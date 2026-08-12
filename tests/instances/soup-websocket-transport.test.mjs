/* global imports */

import System from 'system';
import Soup from 'gi://Soup?version=3.0';

import { SoupConnection } from '../../dist/instances/soup-websocket-transport.js';

const JsUnit = imports.jsUnit;

class FakeWebSocketConnection {
    closeCalls = 0;
    disconnected = [];
    sent = [];
    #nextSignal = 1;
    #signals = new Map();

    close() {
        this.closeCalls++;
    }

    connect(name, callback) {
        const signal = this.#nextSignal++;
        this.#signals.set(signal, { callback, name });
        return signal;
    }

    disconnect(signal) {
        this.disconnected.push(signal);
        this.#signals.delete(signal);
    }

    emit(name, ...args) {
        [...this.#signals.values()]
            .filter(signal => signal.name === name)
            .forEach(signal => signal.callback(this, ...args));
    }

    get_close_code() {
        return 1006;
    }

    send_text(message) {
        this.sent.push(message);
    }

    set_max_incoming_payload_size() {}
}

const tests = {
    testRetainsLifecycleSignalsUntilAsynchronousCloseCompletes() {
        const nativeConnection = new FakeWebSocketConnection();
        let releases = 0;
        const connection = new SoupConnection(nativeConnection, () => releases++);

        connection.close();
        connection.close();

        JsUnit.assertEquals(1, nativeConnection.closeCalls);
        JsUnit.assertEquals(0, nativeConnection.disconnected.length);
        JsUnit.assertEquals(0, releases);

        nativeConnection.emit('closed');

        JsUnit.assertEquals(2, nativeConnection.disconnected.length);
        JsUnit.assertEquals(1, releases);
    },

    testForwardsMessagesAndReportsTransportClosure() {
        const nativeConnection = new FakeWebSocketConnection();
        const connection = new SoupConnection(nativeConnection, () => {});
        const messages = [];
        let closure = null;
        const disconnectMessage = connection.onMessage(message => messages.push(message));
        const disconnectClosed = connection.onClosed(value => closure = value);

        connection.sendText('request');
        nativeConnection.emit('message', Soup.WebsocketDataType.TEXT, {
            get_data: () => new Uint8Array([114, 101, 115, 112, 111, 110, 115, 101]),
        });
        nativeConnection.emit('message', Soup.WebsocketDataType.BINARY, {
            get_data: () => new Uint8Array(),
        });
        nativeConnection.emit('message', Soup.WebsocketDataType.TEXT, {
            get_data: () => null,
        });
        nativeConnection.emit('error');
        nativeConnection.emit('closed');
        connection.close();
        disconnectMessage();
        disconnectMessage();
        disconnectClosed();

        JsUnit.assertEquals('request', nativeConnection.sent[0]);
        JsUnit.assertEquals('response', messages[0]);
        JsUnit.assertEquals(null, messages[1]);
        JsUnit.assertEquals('', messages[2]);
        JsUnit.assertEquals(1006, closure.code);
        JsUnit.assertTrue(closure.transportError);
        JsUnit.assertEquals(0, nativeConnection.closeCalls);
    },
};

System.exit(JsUnit.gjstestRun(tests, () => {}, () => {}));
