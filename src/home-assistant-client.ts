export interface Cancellation {
    isCancelled(): boolean;
    onCancel(callback: () => void): () => void;
}

export interface Scheduler {
    schedule(milliseconds: number, callback: () => void): () => void;
}

export interface WebSocketConnection {
    sendText(message: string): void;
    close(): void;
    onMessage(callback: (message: string | null) => void): () => void;
    onClosed(callback: (closure: WebSocketClosure) => void): () => void;
}

export interface WebSocketClosure {
    code: number;
    transportError: boolean;
}

export interface WebSocketTransport {
    connect(url: string, cancellation: Cancellation): Promise<WebSocketConnection>;
}

export interface AuthenticatedSession {
    connection: WebSocketConnection;
    homeAssistantVersion: string;
}

function parseMessage(message: string | null): Record<string, unknown> {
    if (message === null)
        throw new Error('Home Assistant sent a binary authentication message.');
    let value: unknown;
    try {
        value = JSON.parse(message);
    }
    catch {
        throw new Error('Home Assistant sent malformed authentication data.');
    }
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        throw new Error('Home Assistant sent malformed authentication data.');
    return value as Record<string, unknown>;
}

export async function connectAuthenticated(
    transport: WebSocketTransport,
    url: string,
    accessToken: string,
    cancellation: Cancellation,
    scheduler: Scheduler,
    timeoutMilliseconds: number,
): Promise<AuthenticatedSession> {
    if (accessToken.trim() === '')
        throw new Error('Home Assistant access token is missing.');
    if (timeoutMilliseconds <= 0)
        throw new Error('Home Assistant connection timeout must be positive.');
    if (cancellation.isCancelled())
        throw new Error('Home Assistant connection was cancelled.');

    let connection: WebSocketConnection;
    try {
        connection = await transport.connect(url, cancellation);
    }
    catch {
        if (cancellation.isCancelled())
            throw new Error('Home Assistant connection was cancelled.');
        throw new Error('Could not connect to Home Assistant.');
    }

    return new Promise((resolve, reject) => {
        let phase: 'required' | 'result' = 'required';
        let settled = false;
        const cleanupCallbacks: (() => void)[] = [];
        const finish = (error?: Error, version?: string, close = true): void => {
            if (settled)
                return;
            settled = true;
            cleanupCallbacks.forEach(cleanup => cleanup());
            if (error) {
                if (close)
                    connection.close();
                reject(error);
            }
            else {
                resolve({ connection, homeAssistantVersion: version! });
            }
        };

        cleanupCallbacks.push(scheduler.schedule(timeoutMilliseconds, () =>
            finish(new Error('Home Assistant authentication timed out.'))));
        cleanupCallbacks.push(cancellation.onCancel(() =>
            finish(new Error('Home Assistant connection was cancelled.'))));
        cleanupCallbacks.push(connection.onClosed(closure => finish(new Error(
            closure.transportError
                ? 'Home Assistant authentication connection failed at the transport layer.'
                : `Home Assistant closed the authentication connection (WebSocket code ${closure.code}).`,
        ), undefined, false)));
        cleanupCallbacks.push(connection.onMessage((message) => {
            try {
                const value = parseMessage(message);
                if (phase === 'required') {
                    if (value.type !== 'auth_required')
                        throw new Error('Home Assistant sent an unexpected authentication message.');
                    connection.sendText(JSON.stringify({ type: 'auth', access_token: accessToken.trim() }));
                    phase = 'result';
                }
                else if (value.type === 'auth_invalid') {
                    finish(new Error('Home Assistant rejected the access token.'));
                }
                else if (value.type === 'auth_ok' && typeof value.ha_version === 'string') {
                    finish(undefined, value.ha_version);
                }
                else {
                    throw new Error('Home Assistant sent an unexpected authentication message.');
                }
            }
            catch (error) {
                finish(error instanceof Error ? error : new Error('Home Assistant authentication failed.'));
            }
        }));
    });
}
