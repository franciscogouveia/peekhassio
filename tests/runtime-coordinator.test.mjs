import assert from 'node:assert/strict';
import test from 'node:test';

import { CredentialError } from '../dist/credential-store.js';
import { AuthenticationError } from '../dist/home-assistant-client.js';
import { RuntimeCoordinator } from '../dist/runtime-coordinator.js';

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

class FakeCancellation {
    cancelled = false;

    isCancelled() {
        return this.cancelled;
    }

    onCancel() {
        return () => {};
    }

    cancel() {
        this.cancelled = true;
    }
}

function createHarness(tokens = new Map([['home', 'home-token'], ['cabin', 'cabin-token']])) {
    const errors = [];
    const runtimes = new Map();
    const updates = [];
    const dependencies = {
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
    };
    return { coordinator: new RuntimeCoordinator(dependencies), errors, runtimes, updates };
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
        { entityId: 'sensor.temperature', value: '21', availability: 'available', unit: '°C' },
        { entityId: 'sensor.humidity', value: '45', availability: 'available', unit: '%' },
    ]);
    harness.runtimes.get('home').onError(new Error('subscription failed'));
    assert.deepEqual(harness.errors.at(-1), ['home', 'subscription failed']);
    assert.equal(harness.runtimes.get('home').cancellation.cancelled, true);
    assert.equal(harness.runtimes.get('home').stopped, true);
    assert.equal(harness.runtimes.get('home').connection.closed, true);
    const staleGroups = harness.updates.at(-1);
    assert.equal(staleGroups[0].status, 'stale');
    assert.equal(staleGroups[0].entities[0].value, '21');

    harness.coordinator.stop();
    harness.coordinator.stop();
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
    const updates = [];
    const coordinator = new RuntimeCoordinator({
        credentials: { loadToken: async () => 'token' },
        createCancellation: () => new FakeCancellation(),
        connect: async () => {
            throw new AuthenticationError('Home Assistant rejected the access token.');
        },
        subscribe: async () => { throw new Error('must not subscribe'); },
        onUpdate: groups => updates.push(groups),
        onError: () => {},
    });

    await coordinator.start({
        ...configuration,
        instances: [configuration.instances[0]],
        groups: [configuration.groups[0]],
    });

    assert.equal(updates.at(-1)[0].status, 'authentication-failed');
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
        credentials: { loadToken: async () => 'token' },
        createCancellation: () => new FakeCancellation(),
        connect: async () => new Promise((resolve) => {
            finishConnect = resolve;
            markConnectStarted();
        }),
        subscribe: async () => { throw new Error('must not subscribe'); },
        onUpdate: () => {},
        onError: () => {},
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
