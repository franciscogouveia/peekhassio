import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';

import type {
    Cancellation,
    WebSocketConnection,
    WebSocketTransport,
} from './home-assistant-client.js';

class SoupConnection implements WebSocketConnection {
    readonly #connection: Soup.WebsocketConnection;

    constructor(connection: Soup.WebsocketConnection) {
        this.#connection = connection;
    }

    sendText(message: string): void {
        this.#connection.send_text(message);
    }

    close(): void {
        this.#connection.close(Soup.WebsocketCloseCode.NORMAL, null);
    }

    onMessage(callback: (message: string | null) => void): () => void {
        const signal = this.#connection.connect('message', (_connection, type, data) => {
            callback(type === Soup.WebsocketDataType.TEXT
                ? new TextDecoder().decode(data.get_data() ?? new Uint8Array())
                : null);
        });
        return () => this.#connection.disconnect(signal);
    }

    onClosed(callback: () => void): () => void {
        const signal = this.#connection.connect('closed', callback);
        return () => this.#connection.disconnect(signal);
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
