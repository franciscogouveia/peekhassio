import assert from 'node:assert/strict';
import test from 'node:test';
import { URL } from 'node:url';

import { CredentialError } from '../dist/credential-store.js';
import { AuthenticationError } from '../dist/home-assistant-client.js';
import { RuntimeCoordinator, calculateRetryDelay } from '../dist/runtime-coordinator.js';

const configuration = {
    version: 1,
    instances: [
        { id: 'home', name: 'Home', baseUrl: 'https://home.example' },
        { id: 'cabin', name: 'Cabin', baseUrl: 'https://cabin.example' },
        { id: 'unused', name: 'Unused', baseUrl: 'https://unused.example' },
    ],
    groups: [
        {
            id: 'downstairs',
            instanceId: 'home',
            name: 'Downstairs',
            dashboardPath: '/',
            entities: [{ entityId: 'sensor.temperature', unitOverride: '°C' }, { entityId: 'sensor.humidity' }],
        },
        {
            id: 'upstairs',
            instanceId: 'home',
            name: 'Upstairs',
            dashboardPath: '/',
            entities: [{ entityId: 'sensor.temperature', unitOverride: '°F' }],
        },
        {
            id: 'cabin-lights',
            instanceId: 'cabin',
            name: 'Cabin lights',
            dashboardPath: '/',
            entities: [{ entityId: 'light.porch' }],
        },
    ],
};

async function flushPromises() {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
}

function buildDashboardUrl(instance, group) {
    return new URL(group.dashboardPath, instance.baseUrl).toString();
}

class FakeCancellation {
    cancelled = false;
    callbacks = [];

    isCancelled() {
        return this.cancelled;
    }

    onCancel(callback) {
        this.callbacks.push(callback);
        return () => {
            this.callbacks = this.callbacks.filter(candidate => candidate !== callback);
        };
    }

    cancel() {
        this.cancelled = true;
        this.callbacks.forEach(callback => callback());
    }
}

class FakeRetryScheduler {
    delays = [];
    tasks = [];

    schedule(milliseconds, callback) {
        const task = { callback, cancelled: false };
        this.delays.push(milliseconds);
        this.tasks.push(task);
        return () => {
            task.cancelled = true;
        };
    }

    runNext() {
        const task = this.tasks.shift();
        if (!task.cancelled)
            task.callback();
    }
}

function createHarness(tokens = new Map([['home', 'home-token'], ['cabin', 'cabin-token']])) {
    const errors = [];
    const runtimes = new Map();
    const updates = [];
    const retryScheduler = new FakeRetryScheduler();
    const dependencies = {
        buildDashboardUrl,
        credentials: {
            loadToken(instanceId) {
                const token = tokens.get(instanceId);
                if (!token)
                    throw new CredentialError('Could not read the access token from Secret Service.');
                return token;
            },
        },
        createCancellation: () => new FakeCancellation(),
        async connect(instance, token, cancellation) {
            const runtime = {
                cancellation,
                connection: { closed: false, close() { this.closed = true; } },
                instance,
                token,
            };
            runtimes.set(instance.id, runtime);
            return { connection: runtime.connection, homeAssistantVersion: '2026.8' };
        },
        async subscribe(_session, entities, _cancellation, onUpdate, onError) {
            const instanceId = entities.some(entity => entity.entityId === 'light.porch') ? 'cabin' : 'home';
            const runtime = runtimes.get(instanceId);
            Object.assign(runtime, {
                entities,
                onError,
                onUpdate,
                stopped: false,
                subscription: { stop() { runtime.stopped = true; } },
            });
            return runtime.subscription;
        },
        onUpdate: groups => updates.push(JSON.parse(JSON.stringify(groups))),
        onError: (instanceId, error) => errors.push([instanceId, error.message]),
        retryDelay: attempt => 100 * (attempt + 1),
        scheduler: retryScheduler,
    };
    return { coordinator: new RuntimeCoordinator(dependencies), errors, retryScheduler, runtimes, updates };
}

test('starts one deduplicated runtime per used instance and maps ordered groups', async () => {
    const harness = createHarness();
    await harness.coordinator.start(configuration);

    assert.deepEqual([...harness.runtimes], [
        ['home', harness.runtimes.get('home')],
        ['cabin', harness.runtimes.get('cabin')],
    ]);
    assert.deepEqual(harness.runtimes.get('home').entities, [
        { entityId: 'sensor.temperature' },
        { entityId: 'sensor.humidity' },
    ]);
    assert.equal(harness.runtimes.get('home').token, 'home-token');
    assert.deepEqual(harness.updates[0].map(group => group.id), ['downstairs', 'upstairs', 'cabin-lights']);
    assert.deepEqual(harness.updates[0].map(group => group.status), ['connecting', 'connecting', 'connecting']);
    assert.deepEqual(harness.updates[0].map(group => group.dashboardUrl), [
        'https://home.example/',
        'https://home.example/',
        'https://cabin.example/',
    ]);

    harness.runtimes.get('home').onUpdate([
        { entityId: 'sensor.humidity', value: '45', availability: 'available', unit: '%' },
        { entityId: 'sensor.temperature', value: '21', availability: 'available', unit: 'K' },
    ]);
    const latest = harness.updates.at(-1);
    assert.equal(latest[0].entities[0].unit, '°C');
    assert.equal(latest[1].entities[0].unit, '°F');
    assert.equal(latest[0].entities[1].unit, '%');
    assert.equal(latest[2].entities[0].availability, 'missing');
    assert.deepEqual(latest.map(group => group.status), ['ready', 'ready', 'connecting']);
});

test('isolates instance failures and owns active runtime cleanup', async () => {
    const harness = createHarness(new Map([['home', 'home-token']]));
    await harness.coordinator.start(configuration);

    assert.deepEqual(harness.errors, [['cabin', 'Could not read the access token from Secret Service.']]);
    assert.equal(harness.updates.at(-1)[2].status, 'authentication-failed');
    assert.equal(harness.runtimes.get('home').cancellation.cancelled, false);
    harness.runtimes.get('home').onUpdate([
        { entityId: 'sensor.temperature', value: '21', availability: 'available', receivedAt: 1_000, unit: '°C' },
        { entityId: 'sensor.humidity', value: '45', availability: 'available', receivedAt: 1_001, unit: '%' },
    ]);
    harness.runtimes.get('home').onError(new Error('subscription failed'));
    assert.deepEqual(harness.errors.at(-1), ['home', 'subscription failed']);
    assert.equal(harness.runtimes.get('home').cancellation.cancelled, true);
    assert.equal(harness.runtimes.get('home').stopped, true);
    assert.equal(harness.runtimes.get('home').connection.closed, true);
    const staleGroups = harness.updates.at(-1);
    assert.equal(staleGroups[0].status, 'stale');
    assert.equal(staleGroups[0].entities[0].value, '21');
    assert.equal(staleGroups[0].entities[0].receivedAt, 1_000);
    assert.deepEqual(harness.retryScheduler.delays, [100]);
    const failedRuntime = harness.runtimes.get('home');
    harness.retryScheduler.runNext();
    await flushPromises();
    const recoveredRuntime = harness.runtimes.get('home');
    assert.notEqual(recoveredRuntime, failedRuntime);
    recoveredRuntime.onUpdate([
        { entityId: 'sensor.temperature', value: '22', availability: 'available', receivedAt: 2_000, unit: '°C' },
        { entityId: 'sensor.humidity', value: '46', availability: 'available', receivedAt: 2_001, unit: '%' },
    ]);
    assert.equal(harness.updates.at(-1)[0].status, 'ready');
    assert.equal(harness.updates.at(-1)[0].entities[0].value, '22');
    assert.equal(harness.updates.at(-1)[0].entities[0].receivedAt, 2_000);

    harness.coordinator.stop();
    harness.coordinator.stop();
});

test('disconnects subscription callbacks before cancelling and closes once', async () => {
    const harness = createHarness();
    await harness.coordinator.start(configuration);
    const runtime = harness.runtimes.get('home');
    const events = [];
    runtime.subscription.stop = () => {
        runtime.stopped = true;
        events.push('stop');
    };
    runtime.cancellation.onCancel(() => {
        events.push('cancel');
        runtime.onError(new Error('cancelled callback'));
    });
    runtime.connection.close = () => {
        events.push('close');
        runtime.onError(new Error('closed callback'));
    };

    harness.coordinator.stop();

    assert.deepEqual(events, ['stop', 'cancel', 'close']);
    assert.deepEqual(harness.errors, []);
});

test('marks groups without configured entities ready without connecting', async () => {
    const harness = createHarness();
    await harness.coordinator.start({
        ...configuration,
        instances: [configuration.instances[0]],
        groups: [{ ...configuration.groups[0], entities: [] }],
    });

    assert.equal(harness.runtimes.size, 0);
    assert.equal(harness.updates.at(-1)[0].status, 'ready');
});

test('marks rejected Home Assistant authentication explicitly', async () => {
    const scheduler = new FakeRetryScheduler();
    const updates = [];
    const coordinator = new RuntimeCoordinator({
        buildDashboardUrl,
        credentials: { loadToken: async () => 'token' },
        createCancellation: () => new FakeCancellation(),
        connect: async () => {
            throw new AuthenticationError('Home Assistant rejected the access token.');
        },
        subscribe: async () => { throw new Error('must not subscribe'); },
        onUpdate: groups => updates.push(groups),
        onError: () => {},
        retryDelay: () => 100,
        scheduler,
    });

    await coordinator.start({
        ...configuration,
        instances: [configuration.instances[0]],
        groups: [configuration.groups[0]],
    });

    assert.equal(updates.at(-1)[0].status, 'authentication-failed');
    assert.deepEqual(scheduler.delays, []);
});

test('retries ordinary failures with increasing delays and cancels pending work', async () => {
    const scheduler = new FakeRetryScheduler();
    let attempts = 0;
    const coordinator = new RuntimeCoordinator({
        buildDashboardUrl,
        credentials: { loadToken: async () => 'token' },
        createCancellation: () => new FakeCancellation(),
        connect: async () => {
            attempts++;
            throw new Error('offline');
        },
        subscribe: async () => { throw new Error('must not subscribe'); },
        onUpdate: () => {},
        onError: () => {},
        retryDelay: attempt => 100 * (attempt + 1),
        scheduler,
    });

    await coordinator.start({
        ...configuration,
        instances: [configuration.instances[0]],
        groups: [configuration.groups[0]],
    });
    assert.deepEqual(scheduler.delays, [100]);
    scheduler.runNext();
    await flushPromises();

    assert.equal(attempts, 2);
    assert.deepEqual(scheduler.delays, [100, 200]);
    coordinator.stop();
    assert.equal(scheduler.tasks.at(-1).cancelled, true);
});

test('calculates jittered exponential retry delays within the cap', () => {
    assert.equal(calculateRetryDelay(0, () => 0), 750);
    assert.equal(calculateRetryDelay(0, () => 1), 1250);
    assert.equal(calculateRetryDelay(20, () => 1), 60_000);
});

test('stops stale startup work and supports a fresh restart', async () => {
    let finishConnect;
    let markConnectStarted;
    const connectStarted = new Promise((resolve) => {
        markConnectStarted = resolve;
    });
    const harness = createHarness();
    const originalConnect = harness.coordinator;
    const pendingHarness = createHarness();
    pendingHarness.coordinator = new RuntimeCoordinator({
        buildDashboardUrl,
        credentials: { loadToken: async () => 'token' },
        createCancellation: () => new FakeCancellation(),
        connect: async () => new Promise((resolve) => {
            finishConnect = resolve;
            markConnectStarted();
        }),
        subscribe: async () => { throw new Error('must not subscribe'); },
        onUpdate: () => {},
        onError: () => {},
        retryDelay: () => 100,
        scheduler: new FakeRetryScheduler(),
    });
    const pendingConfiguration = {
        ...configuration,
        instances: [configuration.instances[0]],
        groups: [configuration.groups[0]],
    };
    const start = pendingHarness.coordinator.start(pendingConfiguration);
    await connectStarted;
    pendingHarness.coordinator.stop();
    const connection = {
        closed: false,
        close() {
            this.closed = true;
        },
    };
    finishConnect({ connection, homeAssistantVersion: '2026.8' });
    await start;
    assert.equal(connection.closed, true);

    await originalConnect.start(configuration);
    const firstHomeRuntime = harness.runtimes.get('home');
    await originalConnect.start(configuration);
    assert.equal(firstHomeRuntime.cancellation.cancelled, true);
    assert.equal(firstHomeRuntime.stopped, true);
    assert.equal(firstHomeRuntime.connection.closed, true);
    assert.notEqual(harness.runtimes.get('home'), firstHomeRuntime);
});
