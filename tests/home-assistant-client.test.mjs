import assert from 'node:assert/strict';
import test from 'node:test';

import { connectAuthenticated } from '../dist/home-assistant-client.js';

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

    remoteClose() {
        this.closedCallbacks.forEach(callback => callback());
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
    closedConnection.remoteClose();
    await assert.rejects(closed.promise, /closed the connection/);

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
