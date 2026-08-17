interface AuthenticationRequiredMessage {
    type: 'auth_required';
}

interface AuthenticationAcceptedMessage {
    type: 'auth_ok';
    ha_version: string;
}

interface AuthenticationRejectedMessage {
    type: 'auth_invalid';
}

export type AuthenticationMessage
    = | AuthenticationRequiredMessage
        | AuthenticationAcceptedMessage
        | AuthenticationRejectedMessage;

export interface EntityCommandResult {
    type: 'result';
    id: number;
    success: boolean;
    result?: unknown;
}

interface EntityStateChangedEvent {
    type: 'event';
    id: number;
    event: {
        data: {
            entity_id: string;
            new_state?: unknown;
        };
    };
}

export type EntityMessage = EntityCommandResult | EntityStateChangedEvent;

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseJsonObject(message: string | null, subject: string): Record<string, unknown> {
    if (message === null)
        throw new Error(`Home Assistant sent binary ${subject} data.`);
    try {
        const value: unknown = JSON.parse(message);
        if (isRecord(value))
            return value;
    }
    catch {
        // Report one fixed error without exposing remote content.
    }
    throw new Error(`Home Assistant sent malformed ${subject} data.`);
}

export function parseAuthenticationMessage(message: string | null): AuthenticationMessage {
    const value = parseJsonObject(message, 'authentication');
    if (value.type === 'auth_required')
        return { type: 'auth_required' };
    if (value.type === 'auth_invalid')
        return { type: 'auth_invalid' };
    if (value.type === 'auth_ok' && typeof value.ha_version === 'string')
        return { type: 'auth_ok', ha_version: value.ha_version };
    throw new Error('Home Assistant sent an unexpected authentication message.');
}

function parseCommandResult(value: Record<string, unknown>): EntityCommandResult {
    if (typeof value.id !== 'number' || typeof value.success !== 'boolean')
        throw new Error('Home Assistant sent malformed entity data.');
    return value as unknown as EntityCommandResult;
}

function parseStateChangedEvent(value: Record<string, unknown>): EntityStateChangedEvent {
    if (value.id !== 1 || !isRecord(value.event) || !isRecord(value.event.data)
        || typeof value.event.data.entity_id !== 'string')
        throw new Error('Home Assistant sent malformed entity event.');
    return value as unknown as EntityStateChangedEvent;
}

export function parseEntityMessage(message: string | null): EntityMessage {
    const value = parseJsonObject(message, 'entity');
    if (value.type === 'result')
        return parseCommandResult(value);
    if (value.type === 'event')
        return parseStateChangedEvent(value);
    throw new Error('Home Assistant sent an unexpected entity message.');
}
