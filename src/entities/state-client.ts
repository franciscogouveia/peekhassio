import type { EntityConfiguration } from '../shared/configuration.js';
import type {
    Cancellation,
    Scheduler,
    WebSocketConnection,
} from '../instances/home-assistant-client.js';
import {
    type EntityCommandResult,
    type HomeAssistantEntityState,
    parseEntityMessage,
} from '../instances/home-assistant-protocol.js';

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

function parseState(value: HomeAssistantEntityState, configured: EntityConfiguration, receivedAt: number): EntityState {
    if (value.entityId !== configured.entityId)
        throw new Error('Home Assistant sent malformed entity state.');
    const availability = value.state === 'unknown' || value.state === 'unavailable'
        ? value.state
        : 'available';
    const unit = configured.unitOverride ?? value.unit;
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
        const applyEvent = (entityId: string, newState: HomeAssistantEntityState | null): void => {
            if (!configured.has(entityId))
                return;
            const configuration = configured.get(entityId)!;
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
        const handleResult = (message: EntityCommandResult): void => {
            if (message.success !== true)
                throw new Error('Home Assistant rejected an entity command.');
            if (message.command === 'subscribe') {
                subscriptionConfirmed = true;
            }
            else if (message.command === 'get_states') {
                const receivedAt = now();
                message.states.forEach((value) => {
                    const configuration = configured.get(value.entityId);
                    if (configuration)
                        states.set(value.entityId, parseState(value, configuration, receivedAt));
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
                const message = parseEntityMessage(text);
                if (message.type === 'result')
                    handleResult(message);
                else if (message.type === 'event')
                    applyEvent(message.entityId, message.newState);
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
