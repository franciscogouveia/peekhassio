interface AuthenticationRequiredMessage {
    type: 'auth_required';
}

interface AuthenticationAcceptedMessage {
    type: 'auth_ok';
    homeAssistantVersion: string;
}

interface AuthenticationRejectedMessage {
    type: 'auth_invalid';
}

export type AuthenticationMessage
    = | AuthenticationRequiredMessage
        | AuthenticationAcceptedMessage
        | AuthenticationRejectedMessage;

export interface HomeAssistantEntityState {
    entityId: string;
    state: string;
    unit?: string;
}

interface FailedEntityCommandResult {
    type: 'result';
    command: 'unexpected';
    success: false;
}

interface SubscribeCommandResult {
    type: 'result';
    command: 'subscribe';
    success: true;
}

interface GetStatesCommandResult {
    type: 'result';
    command: 'get_states';
    success: true;
    states: HomeAssistantEntityState[];
}

interface UnexpectedCommandResult {
    type: 'result';
    command: 'unexpected';
    success: true;
}

export type EntityCommandResult
    = | FailedEntityCommandResult
        | SubscribeCommandResult
        | GetStatesCommandResult
        | UnexpectedCommandResult;

interface EntityStateChangedEvent {
    type: 'event';
    entityId: string;
    newState: HomeAssistantEntityState | null;
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
        return { type: 'auth_ok', homeAssistantVersion: value.ha_version };
    throw new Error('Home Assistant sent an unexpected authentication message.');
}

function parseEntityState(value: unknown): HomeAssistantEntityState {
    if (!isRecord(value) || typeof value.entity_id !== 'string' || typeof value.state !== 'string'
        || !isRecord(value.attributes))
        throw new Error('Home Assistant sent malformed entity state.');
    const unit = value.attributes.unit_of_measurement;
    if (unit !== undefined && unit !== null && typeof unit !== 'string')
        throw new Error('Home Assistant sent malformed entity state.');
    return {
        entityId: value.entity_id,
        state: value.state,
        ...(typeof unit === 'string' ? { unit } : {}),
    };
}

function parseCommandResult(value: Record<string, unknown>): EntityCommandResult {
    if (typeof value.id !== 'number' || typeof value.success !== 'boolean')
        throw new Error('Home Assistant sent malformed entity data.');
    if (!value.success)
        return { type: 'result', command: 'unexpected', success: false };
    if (value.id === 1)
        return { type: 'result', command: 'subscribe', success: true };
    if (value.id === 2) {
        if (!Array.isArray(value.result))
            throw new Error('Home Assistant sent malformed entity state.');
        return {
            type: 'result',
            command: 'get_states',
            success: true,
            states: value.result.map(parseEntityState),
        };
    }
    return { type: 'result', command: 'unexpected', success: true };
}

function parseStateChangedEvent(value: Record<string, unknown>): EntityStateChangedEvent {
    if (value.id !== 1 || !isRecord(value.event) || !isRecord(value.event.data)
        || typeof value.event.data.entity_id !== 'string')
        throw new Error('Home Assistant sent malformed entity event.');
    const newState = value.event.data.new_state;
    return {
        type: 'event',
        entityId: value.event.data.entity_id,
        newState: newState === null ? null : parseEntityState(newState),
    };
}

export function parseEntityMessage(message: string | null): EntityMessage {
    const value = parseJsonObject(message, 'entity');
    if (value.type === 'result')
        return parseCommandResult(value);
    if (value.type === 'event')
        return parseStateChangedEvent(value);
    throw new Error('Home Assistant sent an unexpected entity message.');
}
