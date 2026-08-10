import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';

import type {
    Cancellation,
    WebSocketClosure,
    WebSocketConnection,
    WebSocketTransport,
} from './home-assistant-client.js';
import { SignalOwner } from '../shared/signal-owner.js';

Gio._promisify(Soup.Session.prototype, 'websocket_connect_async', 'websocket_connect_finish');

const MAX_INCOMING_PAYLOAD_BYTES = 8 * 1024 * 1024;

class SoupConnection implements WebSocketConnection {
    readonly #connection: Soup.WebsocketConnection;
    readonly #transportSignals = new SignalOwner();
    #closed = false;
    #closing = false;
    #transportError = false;

    constructor(connection: Soup.WebsocketConnection) {
        this.#connection = connection;
        connection.set_max_incoming_payload_size(MAX_INCOMING_PAYLOAD_BYTES);
        this.#transportSignals.add(connection.connect('error', () => {
            this.#transportError = true;
        }));
        this.#transportSignals.add(connection.connect('closed', () => {
            this.#closed = true;
            this.#disconnectTransportSignals();
        }));
    }

    sendText(message: string): void {
        this.#connection.send_text(message);
    }

    close(): void {
        if (this.#closing || this.#closed)
            return;
        this.#closing = true;
        try {
            this.#connection.close(Soup.WebsocketCloseCode.NORMAL, null);
        }
        finally {
            this.#disconnectTransportSignals();
        }
    }

    onMessage(callback: (message: string | null) => void): () => void {
        const signal = this.#connection.connect('message', (_connection, type, data) => {
            callback(type === Soup.WebsocketDataType.TEXT
                ? new TextDecoder().decode(data.get_data() ?? new Uint8Array())
                : null);
        });
        return this.#disconnectOnce(signal);
    }

    onClosed(callback: (closure: WebSocketClosure) => void): () => void {
        const signal = this.#connection.connect('closed', () => callback({
            code: this.#connection.get_close_code(),
            transportError: this.#transportError,
        }));
        return this.#disconnectOnce(signal);
    }

    #disconnectOnce(signal: number): () => void {
        let connected = true;
        return () => {
            if (!connected)
                return;
            connected = false;
            this.#connection.disconnect(signal);
        };
    }

    #disconnectTransportSignals(): void {
        this.#transportSignals.disconnectAll(signal => this.#connection.disconnect(signal));
    }
}

export class SoupWebSocketTransport implements WebSocketTransport {
    readonly #session = new Soup.Session({ timeout: 30 });

    async connect(url: string, cancellation: Cancellation): Promise<WebSocketConnection> {
        const cancellable = new Gio.Cancellable();
        const disconnectCancellation = cancellation.onCancel(() => cancellable.cancel());
        try {
            const message = Soup.Message.new('GET', url);
            if (!message)
                throw new Error();
            const connection = await this.#session.websocket_connect_async(
                message,
                null,
                null,
                GLib.PRIORITY_DEFAULT,
                cancellable,
            );
            return new SoupConnection(connection);
        }
        finally {
            disconnectCancellation();
        }
    }
}

export class GioCancellation implements Cancellation {
    readonly cancellable = new Gio.Cancellable();

    isCancelled(): boolean {
        return this.cancellable.is_cancelled();
    }

    onCancel(callback: () => void): () => void {
        const signal = this.cancellable.connect(callback);
        return () => this.cancellable.disconnect(signal);
    }

    cancel(): void {
        this.cancellable.cancel();
    }
}

export class GLibScheduler {
    schedule(milliseconds: number, callback: () => void): () => void {
        let source = GLib.timeout_add(GLib.PRIORITY_DEFAULT, milliseconds, () => {
            source = 0;
            callback();
            return GLib.SOURCE_REMOVE;
        });
        return () => {
            if (source !== 0)
                GLib.source_remove(source);
            source = 0;
        };
    }
}
