import assert from 'node:assert/strict';
import test from 'node:test';

import { connectAuthenticated } from '../dist/home-assistant-client.js';
import { subscribeEntityStates } from '../dist/entity-state-client.js';

class FakeCancellation {
    cancelled = false;
    callbacks = new Set();

    isCancelled() {
        return this.cancelled;
    }

    onCancel(callback) {
        this.callbacks.add(callback);
        return () => this.callbacks.delete(callback);
    }

    cancel() {
        this.cancelled = true;
        this.callbacks.forEach(callback => callback());
    }
}

class FakeScheduler {
    callbacks = new Set();

    schedule(_milliseconds, callback) {
        this.callbacks.add(callback);
        return () => this.callbacks.delete(callback);
    }

    expire() {
        this.callbacks.forEach(callback => callback());
    }
}

class FakeConnection {
    closed = false;
    closedCallbacks = new Set();
    messages = [];
    messageCallbacks = new Set();

    sendText(message) {
        this.messages.push(message);
    }

    close() {
        this.closed = true;
    }

    onMessage(callback) {
        this.messageCallbacks.add(callback);
        return () => this.messageCallbacks.delete(callback);
    }

    onClosed(callback) {
        this.closedCallbacks.add(callback);
        return () => this.closedCallbacks.delete(callback);
    }

    receive(message) {
        this.messageCallbacks.forEach(callback => callback(message));
    }

    remoteClose(closure = { code: 1000, transportError: false }) {
        this.closedCallbacks.forEach(callback => callback(closure));
    }
}

function connect(connection, options = {}) {
    const cancellation = options.cancellation ?? new FakeCancellation();
    const scheduler = options.scheduler ?? new FakeScheduler();
    const transport = { connect: async () => connection };
    return {
        cancellation,
        promise: connectAuthenticated(transport, 'wss://private.example/api/websocket', 'secret-token', cancellation, scheduler, 5000),
        scheduler,
    };
}

test('authenticates only after the required handshake', async () => {
    const connection = new FakeConnection();
    const { promise } = connect(connection);
    await Promise.resolve();

    connection.receive(JSON.stringify({ type: 'auth_required', ha_version: '2026.8' }));
    assert.deepEqual(JSON.parse(connection.messages[0]), { type: 'auth', access_token: 'secret-token' });
    connection.receive(JSON.stringify({ type: 'auth_ok', ha_version: '2026.8.1' }));

    assert.deepEqual(await promise, { connection, homeAssistantVersion: '2026.8.1' });
    assert.equal(connection.closed, false);
    assert.equal(connection.messageCallbacks.size, 0);
});

test('rejects invalid authentication without exposing server data', async () => {
    const connection = new FakeConnection();
    const { promise } = connect(connection);
    await Promise.resolve();
    connection.receive('{"type":"auth_required"}');
    connection.receive('{"type":"auth_invalid","message":"secret server detail"}');

    await assert.rejects(promise, (error) => {
        assert.match(error.message, /rejected the access token/);
        assert.doesNotMatch(error.message, /secret server detail|private\.example|secret-token/);
        return true;
    });
    assert.equal(connection.closed, true);
});

test('rejects malformed, binary, and out-of-order authentication messages', async () => {
    for (const message of ['{', null, '{"type":"auth_ok","ha_version":"1"}', '[]']) {
        const connection = new FakeConnection();
        const { promise } = connect(connection);
        await Promise.resolve();
        connection.receive(message);
        await assert.rejects(promise, /authentication/);
        assert.equal(connection.closed, true);
    }
});

test('handles timeout, cancellation, closure, connection failure, and invalid input', async () => {
    const timeoutConnection = new FakeConnection();
    const timeout = connect(timeoutConnection);
    await Promise.resolve();
    timeout.scheduler.expire();
    await assert.rejects(timeout.promise, /timed out/);

    const cancelledConnection = new FakeConnection();
    const cancelled = connect(cancelledConnection);
    await Promise.resolve();
    cancelled.cancellation.cancel();
    await assert.rejects(cancelled.promise, /cancelled/);

    const closedConnection = new FakeConnection();
    const closed = connect(closedConnection);
    await Promise.resolve();
    closedConnection.remoteClose({ code: 1009, transportError: false });
    await assert.rejects(closed.promise, /WebSocket code 1009/);

    const cancellation = new FakeCancellation();
    cancellation.cancel();
    await assert.rejects(connectAuthenticated({}, 'wss://example', 'token', cancellation, new FakeScheduler(), 1), /cancelled/);
    const failingTransport = {
        connect: async () => {
            throw new Error('private.example');
        },
    };
    await assert.rejects(connectAuthenticated(failingTransport, 'wss://private.example', 'token', new FakeCancellation(), new FakeScheduler(), 1), /^Error: Could not connect to Home Assistant\.$/);
    await assert.rejects(connectAuthenticated({}, 'wss://example', ' ', new FakeCancellation(), new FakeScheduler(), 1), /token is missing/);
    await assert.rejects(connectAuthenticated({}, 'wss://example', 'token', new FakeCancellation(), new FakeScheduler(), 0), /timeout must be positive/);
});

const configuredEntities = [
    { entityId: 'sensor.temperature', unitOverride: '°F' },
    { entityId: 'sensor.humidity' },
    { entityId: 'sensor.missing' },
];

function state(entityId, value, unit) {
    return {
        entity_id: entityId,
        state: value,
        attributes: unit === undefined ? {} : { unit_of_measurement: unit },
    };
}

function subscribe(connection, options = {}) {
    const cancellation = options.cancellation ?? new FakeCancellation();
    const scheduler = options.scheduler ?? new FakeScheduler();
    const updates = [];
    const errors = [];
    return {
        cancellation,
        errors,
        promise: subscribeEntityStates(
            connection,
            configuredEntities,
            cancellation,
            scheduler,
            5000,
            states => updates.push(JSON.parse(JSON.stringify(states))),
            error => errors.push(error),
        ),
        scheduler,
        updates,
    };
}

test('loads ordered states, buffers events, filters entities, and applies units', async () => {
    const connection = new FakeConnection();
    const subscription = subscribe(connection);
    assert.deepEqual(connection.messages.map(JSON.parse), [
        { id: 1, type: 'subscribe_events', event_type: 'state_changed' },
        { id: 2, type: 'get_states' },
    ]);
    connection.receive(JSON.stringify({
        id: 1,
        type: 'event',
        event: { data: { entity_id: 'sensor.temperature', new_state: state('sensor.temperature', '71', '°C') } },
    }));
    connection.receive(JSON.stringify({
        id: 1,
        type: 'event',
        event: { data: { entity_id: 'sensor.unconfigured', new_state: state('sensor.unconfigured', 'on') } },
    }));
    connection.receive(JSON.stringify({
        id: 2,
        type: 'result',
        success: true,
        result: [state('sensor.temperature', '70', '°C'), state('sensor.humidity', 'unknown', '%')],
    }));
    connection.receive(JSON.stringify({ id: 1, type: 'result', success: true, result: null }));

    const result = await subscription.promise;
    assert.deepEqual(result.states, [
        { entityId: 'sensor.temperature', value: '71', availability: 'available', unit: '°F' },
        { entityId: 'sensor.humidity', value: null, availability: 'unknown', unit: '%' },
        { entityId: 'sensor.missing', value: null, availability: 'missing' },
    ]);
    assert.deepEqual(subscription.updates, [result.states]);
    assert.equal(subscription.scheduler.callbacks.size, 0);

    connection.receive(JSON.stringify({
        id: 1,
        type: 'event',
        event: { data: { entity_id: 'sensor.humidity', new_state: state('sensor.humidity', 'unavailable', '%') } },
    }));
    assert.deepEqual(subscription.updates[1][1], {
        entityId: 'sensor.humidity',
        value: null,
        availability: 'unavailable',
        unit: '%',
    });
    connection.receive(JSON.stringify({
        id: 1,
        type: 'event',
        event: { data: { entity_id: 'sensor.humidity', new_state: null } },
    }));
    assert.deepEqual(subscription.updates[2][1], {
        entityId: 'sensor.humidity',
        value: null,
        availability: 'missing',
    });
    result.stop();
    assert.equal(connection.messageCallbacks.size, 0);
});

test('reports initialization and active subscription failures without remote details', async () => {
    for (const message of [
        null,
        '{',
        '{"id":2,"type":"result","success":false,"error":{"message":"private state"}}',
        '{"id":2,"type":"result","success":true,"result":{}}',
        '{"id":9,"type":"result","success":true,"result":null}',
    ]) {
        const connection = new FakeConnection();
        const subscription = subscribe(connection);
        connection.receive(message);
        await assert.rejects(subscription.promise, (error) => {
            assert.doesNotMatch(error.message, /private state/);
            return true;
        });
    }

    const connection = new FakeConnection();
    const active = subscribe(connection);
    connection.receive('{"id":2,"type":"result","success":true,"result":[]}');
    connection.receive('{"id":1,"type":"result","success":true,"result":null}');
    await active.promise;
    connection.receive('{"id":1,"type":"event","event":{"data":{"entity_id":7}}}');
    assert.match(active.errors[0].message, /malformed entity event/);
    assert.equal(connection.messageCallbacks.size, 0);
});

test('handles entity initialization timeout, cancellation, closure, and invalid timeout', async () => {
    const timeout = subscribe(new FakeConnection());
    timeout.scheduler.expire();
    await assert.rejects(timeout.promise, /timed out/);

    const cancelled = subscribe(new FakeConnection());
    cancelled.cancellation.cancel();
    await assert.rejects(cancelled.promise, /cancelled/);

    const connection = new FakeConnection();
    const closed = subscribe(connection);
    connection.remoteClose({ code: 1009, transportError: false });
    await assert.rejects(closed.promise, /WebSocket code 1009/);

    const transportConnection = new FakeConnection();
    const transportFailure = subscribe(transportConnection);
    transportConnection.remoteClose({ code: 1006, transportError: true });
    await assert.rejects(transportFailure.promise, /transport layer/);

    await assert.rejects(subscribeEntityStates(connection, [], new FakeCancellation(), new FakeScheduler(), 0, () => {}, () => {}), /timeout must be positive/);
    const alreadyCancelled = new FakeCancellation();
    alreadyCancelled.cancel();
    await assert.rejects(subscribeEntityStates(connection, [], alreadyCancelled, new FakeScheduler(), 1, () => {}, () => {}), /cancelled/);
});

test('rejects when the initial state consumer fails', async () => {
    const connection = new FakeConnection();
    const promise = subscribeEntityStates(
        connection,
        [],
        new FakeCancellation(),
        new FakeScheduler(),
        1,
        () => {
            throw new Error('consumer failed');
        },
        () => {},
    );
    connection.receive('{"id":2,"type":"result","success":true,"result":[]}');
    connection.receive('{"id":1,"type":"result","success":true,"result":null}');
    await assert.rejects(promise, /consumer failed/);
});
