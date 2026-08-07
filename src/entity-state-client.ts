import type { EntityConfiguration } from './configuration.js';
import type {
    Cancellation,
    Scheduler,
    WebSocketConnection,
} from './home-assistant-client.js';

export type EntityAvailability = 'available' | 'missing' | 'unavailable' | 'unknown';

export interface EntityState {
    entityId: string;
    value: string | null;
    availability: EntityAvailability;
    /** Unix time in milliseconds recorded locally when this state was received. */
    receivedAt?: number;
    unit?: string;
}

export interface EntitySubscription {
    states: EntityState[];
    stop(): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseMessage(message: string | null): Record<string, unknown> {
    if (message === null)
        throw new Error('Home Assistant sent binary entity data.');
    try {
        const value: unknown = JSON.parse(message);
        if (isRecord(value))
            return value;
    }
    catch {
        // Report one fixed error without exposing remote content.
    }
    throw new Error('Home Assistant sent malformed entity data.');
}

function parseState(value: unknown, configured: EntityConfiguration, receivedAt: number): EntityState {
    if (!isRecord(value) || value.entity_id !== configured.entityId || typeof value.state !== 'string'
        || !isRecord(value.attributes))
        throw new Error('Home Assistant sent malformed entity state.');
    const availability = value.state === 'unknown' || value.state === 'unavailable'
        ? value.state
        : 'available';
    const reportedUnit = value.attributes.unit_of_measurement;
    if (reportedUnit !== undefined && reportedUnit !== null && typeof reportedUnit !== 'string')
        throw new Error('Home Assistant sent malformed entity state.');
    const unit = configured.unitOverride ?? reportedUnit;
    return {
        entityId: configured.entityId,
        value: availability === 'available' ? value.state : null,
        availability,
        receivedAt,
        ...(typeof unit === 'string' && unit !== '' ? { unit } : {}),
    };
}

function missingState(entityId: string): EntityState {
    return { entityId, value: null, availability: 'missing' };
}

export function subscribeEntityStates(
    connection: WebSocketConnection,
    entities: EntityConfiguration[],
    cancellation: Cancellation,
    scheduler: Scheduler,
    timeoutMilliseconds: number,
    now: () => number,
    onUpdate: (states: EntityState[]) => void,
    onError: (error: Error) => void,
): Promise<EntitySubscription> {
    if (timeoutMilliseconds <= 0)
        return Promise.reject(new Error('Home Assistant command timeout must be positive.'));
    if (cancellation.isCancelled())
        return Promise.reject(new Error('Home Assistant entity subscription was cancelled.'));

    const configured = new Map(entities.map(entity => [entity.entityId, entity]));
    const states = new Map(entities.map(entity => [entity.entityId, missingState(entity.entityId)]));
    const buffered = new Map<string, EntityState>();
    let initialReceived = false;
    let subscriptionConfirmed = false;
    let active = true;
    let ready = false;

    return new Promise((resolve, reject) => {
        const cleanupCallbacks: (() => void)[] = [];
        let cancelTimeout = (): void => {};
        const orderedStates = (): EntityState[] => entities.map(entity => states.get(entity.entityId)!);
        const stop = (): void => {
            if (!active)
                return;
            active = false;
            cleanupCallbacks.forEach(cleanup => cleanup());
        };
        const fail = (error: Error): void => {
            if (!active)
                return;
            stop();
            if (ready)
                onError(error);
            else
                reject(error);
        };
        const completeIfReady = (): void => {
            if (!initialReceived || !subscriptionConfirmed || !active)
                return;
            cancelTimeout();
            buffered.forEach((state, entityId) => states.set(entityId, state));
            buffered.clear();
            const result = orderedStates();
            onUpdate(result);
            ready = true;
            resolve({ states: result, stop });
        };
        const applyEvent = (event: Record<string, unknown>): void => {
            if (!isRecord(event.event) || !isRecord(event.event.data))
                throw new Error('Home Assistant sent malformed entity event.');
            const entityId = event.event.data.entity_id;
            if (typeof entityId !== 'string')
                throw new Error('Home Assistant sent malformed entity event.');
            if (!configured.has(entityId))
                return;
            const configuration = configured.get(entityId)!;
            const newState = event.event.data.new_state;
            const receivedAt = now();
            const state = newState === null
                ? { ...missingState(entityId), receivedAt }
                : parseState(newState, configuration, receivedAt);
            if (!initialReceived)
                buffered.set(entityId, state);
            else {
                states.set(entityId, state);
                onUpdate(orderedStates());
            }
        };
        const handleResult = (message: Record<string, unknown>): void => {
            if (message.success !== true)
                throw new Error('Home Assistant rejected an entity command.');
            if (message.id === 1) {
                subscriptionConfirmed = true;
            }
            else if (message.id === 2) {
                if (!Array.isArray(message.result))
                    throw new Error('Home Assistant sent malformed entity state.');
                const receivedAt = now();
                message.result.forEach((value) => {
                    if (!isRecord(value) || typeof value.entity_id !== 'string')
                        throw new Error('Home Assistant sent malformed entity state.');
                    const configuration = configured.get(value.entity_id);
                    if (configuration)
                        states.set(value.entity_id, parseState(value, configuration, receivedAt));
                });
                initialReceived = true;
            }
            else {
                throw new Error('Home Assistant sent an unexpected command result.');
            }
            completeIfReady();
        };

        cancelTimeout = scheduler.schedule(timeoutMilliseconds, () =>
            fail(new Error('Home Assistant entity initialization timed out.')));
        cleanupCallbacks.push(cancelTimeout);
        cleanupCallbacks.push(cancellation.onCancel(() =>
            fail(new Error('Home Assistant entity subscription was cancelled.'))));
        cleanupCallbacks.push(connection.onClosed(closure => fail(new Error(
            closure.transportError
                ? 'Home Assistant entity connection failed at the transport layer.'
                : `Home Assistant closed the entity connection (WebSocket code ${closure.code}).`,
        ))));
        cleanupCallbacks.push(connection.onMessage((text) => {
            try {
                const message = parseMessage(text);
                if (message.type === 'result')
                    handleResult(message);
                else if (message.type === 'event' && message.id === 1)
                    applyEvent(message);
                else
                    throw new Error('Home Assistant sent an unexpected entity message.');
            }
            catch (error) {
                fail(error instanceof Error ? error : new Error('Home Assistant entity processing failed.'));
            }
        }));
        connection.sendText(JSON.stringify({ id: 1, type: 'subscribe_events', event_type: 'state_changed' }));
        connection.sendText(JSON.stringify({ id: 2, type: 'get_states' }));
    });
}
