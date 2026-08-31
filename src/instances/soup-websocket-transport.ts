import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Soup from 'gi://Soup';

import type {
    Cancellation,
    WebSocketClosure,
    WebSocketConnection,
    WebSocketTransport,
} from './home-assistant-client.js';
import { SignalOwner } from '../shared/signal-owner.js';

Gio._promisify(Soup.Session.prototype, 'websocket_connect_async', 'websocket_connect_finish');

const MAX_INCOMING_PAYLOAD_BYTES = 8 * 1024 * 1024;

export class SoupConnection implements WebSocketConnection {
    readonly #connection: Soup.WebsocketConnection;
    readonly #transportSignals = new SignalOwner();
    #closed = false;
    #closing = false;
    #transportError = false;

    constructor(connection: Soup.WebsocketConnection, release: () => void) {
        this.#connection = connection;
        connection.set_max_incoming_payload_size(MAX_INCOMING_PAYLOAD_BYTES);
        this.#transportSignals.add(connection.connect('error', () => {
            this.#transportError = true;
        }));
        this.#transportSignals.add(connection.connect('closed', () => {
            this.#closed = true;
            this.#disconnectTransportSignals();
            release();
        }));
    }

    sendText(message: string): void {
        this.#connection.send_text(message);
    }

    close(): void {
        if (this.#closing || this.#closed)
            return;
        this.#closing = true;
        // libsoup completes an orderly close asynchronously. Keep the internal
        // lifecycle signals and this wrapper alive until `closed` is emitted.
        this.#connection.close(Soup.WebsocketCloseCode.NORMAL, null);
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
    readonly #connections = new Set<SoupConnection>();
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
            const ownedConnection = new SoupConnection(connection, () => {
                this.#connections.delete(ownedConnection);
            });
            this.#connections.add(ownedConnection);
            return ownedConnection;
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
        // This cancellation is owned and invoked on the Shell main thread, so
        // generic GObject signals avoid g_cancellable_disconnect(), which
        // deadlocks when cleanup runs from inside the cancellation callback.
        const signal = GObject.signal_connect(this.cancellable, 'cancelled', callback);
        let connected = true;
        return () => {
            if (!connected)
                return;
            connected = false;
            GObject.signal_handler_disconnect(this.cancellable, signal);
        };
    }

    cancel(): void {
        this.cancellable.cancel();
    }
}

export class GLibScheduler {
    readonly #sources = new Set<number>();
    #destroyed = false;

    schedule(milliseconds: number, callback: () => void): () => void {
        if (this.#destroyed)
            throw new Error('Cannot schedule a timeout after the scheduler is destroyed.');
        let source = GLib.timeout_add(GLib.PRIORITY_DEFAULT, milliseconds, () => {
            this.#sources.delete(source);
            source = 0;
            callback();
            return GLib.SOURCE_REMOVE;
        });
        this.#sources.add(source);
        return () => {
            if (source !== 0) {
                GLib.source_remove(source);
                this.#sources.delete(source);
            }
            source = 0;
        };
    }

    destroy(): void {
        this.#destroyed = true;
        this.#sources.forEach(source => GLib.source_remove(source));
        this.#sources.clear();
    }
}
