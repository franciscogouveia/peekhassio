import type {
    ConfigurationV1,
    EntityConfiguration,
    GroupConfiguration,
    InstanceConfiguration,
} from './configuration.js';
import { CredentialError, type CredentialStore } from './credential-store.js';
import type { EntityState, EntitySubscription } from './entity-state-client.js';
import {
    AuthenticationError,
    type AuthenticatedSession,
    type Cancellation,
    type Scheduler,
} from './home-assistant-client.js';

export type RuntimeStatus = 'connecting' | 'ready' | 'stale' | 'authentication-failed';

const BASE_RETRY_MILLISECONDS = 1_000;
const MAX_RETRY_MILLISECONDS = 60_000;

export function calculateRetryDelay(attempt: number, random = Math.random): number {
    const exponential = Math.min(MAX_RETRY_MILLISECONDS, BASE_RETRY_MILLISECONDS * 2 ** attempt);
    return Math.min(MAX_RETRY_MILLISECONDS, Math.round(exponential * (0.75 + random() * 0.5)));
}

export interface OwnedCancellation extends Cancellation {
    cancel(): void;
}

export interface RuntimeGroupState {
    dashboardUrl: string;
    id: string;
    name: string;
    entities: EntityState[];
    status: RuntimeStatus;
}

export interface RuntimeDependencies {
    buildDashboardUrl(instance: InstanceConfiguration, group: GroupConfiguration): string;
    credentials: CredentialStore;
    createCancellation(): OwnedCancellation;
    connect(instance: InstanceConfiguration, token: string, cancellation: Cancellation): Promise<AuthenticatedSession>;
    subscribe(
        session: AuthenticatedSession,
        entities: EntityConfiguration[],
        cancellation: Cancellation,
        onUpdate: (states: EntityState[]) => void,
        onError: (error: Error) => void,
    ): Promise<EntitySubscription>;
    onUpdate(groups: RuntimeGroupState[]): void;
    onError(instanceId: string, error: Error): void;
    retryDelay(attempt: number): number;
    scheduler: Scheduler;
}

interface InstanceRuntime {
    attempt: number;
    cancellation: OwnedCancellation;
    cancelRetry?: () => void;
    session?: AuthenticatedSession;
    subscription?: EntitySubscription;
}

function missing(entityId: string): EntityState {
    return { entityId, value: null, availability: 'missing' };
}

export class RuntimeCoordinator {
    readonly #dependencies: RuntimeDependencies;
    #configuration: ConfigurationV1 | null = null;
    #generation = 0;
    #groups = new Map<string, RuntimeGroupState>();
    #instances = new Map<string, InstanceRuntime>();

    constructor(dependencies: RuntimeDependencies) {
        this.#dependencies = dependencies;
    }

    async start(configuration: ConfigurationV1): Promise<void> {
        this.stop();
        this.#configuration = configuration;
        this.#groups = new Map(configuration.groups.map((group) => {
            const instance = configuration.instances.find(candidate => candidate.id === group.instanceId)!;
            return [group.id, {
                dashboardUrl: this.#dependencies.buildDashboardUrl(instance, group),
                id: group.id,
                name: group.name,
                entities: group.entities.map(entity => missing(entity.entityId)),
                status: 'connecting',
            }];
        }));
        this.#emit();
        const generation = this.#generation;
        const starts = configuration.instances.map(instance =>
            this.#startInstance(instance, generation));
        await Promise.all(starts);
    }

    stop(): void {
        this.#generation++;
        const runtimes = [...this.#instances.values()];
        this.#instances.clear();
        this.#configuration = null;
        this.#groups.clear();
        runtimes.forEach((runtime) => {
            runtime.cancelRetry?.();
            this.#disposeConnection(runtime);
        });
    }

    async #startInstance(instance: InstanceConfiguration, generation: number): Promise<void> {
        const configuration = this.#configuration!;
        const groups = configuration.groups.filter(group => group.instanceId === instance.id);
        const entityIds = [...new Set(groups.flatMap(group => group.entities.map(entity => entity.entityId)))];
        if (entityIds.length === 0) {
            this.#setInstanceStatus(instance.id, 'ready');
            this.#emit();
            return;
        }
        const runtime = {
            attempt: 0,
            cancellation: this.#dependencies.createCancellation(),
        } as InstanceRuntime;
        this.#instances.set(instance.id, runtime);
        await this.#connectInstance(instance, entityIds, runtime, generation);
    }

    async #connectInstance(
        instance: InstanceConfiguration,
        entityIds: string[],
        runtime: InstanceRuntime,
        generation: number,
    ): Promise<void> {
        try {
            const token = await this.#dependencies.credentials.loadToken(instance.id);
            runtime.session = await this.#dependencies.connect(instance, token, runtime.cancellation);
            if (!this.#isCurrent(generation, instance.id)) {
                runtime.session.connection.close();
                return;
            }
            runtime.subscription = await this.#dependencies.subscribe(
                runtime.session,
                entityIds.map(entityId => ({ entityId })),
                runtime.cancellation,
                states => this.#updateInstance(instance.id, states),
                error => this.#failInstance(instance.id, error),
            );
            if (!this.#isCurrent(generation, instance.id)) {
                runtime.subscription.stop();
                runtime.session.connection.close();
            }
            else {
                runtime.attempt = 0;
            }
        }
        catch (error) {
            if (this.#isCurrent(generation, instance.id))
                this.#failInstance(instance.id, error instanceof Error ? error : new Error('Home Assistant startup failed.'));
        }
    }

    #updateInstance(instanceId: string, states: EntityState[]): void {
        const configuration = this.#configuration;
        if (!configuration || !this.#instances.has(instanceId))
            return;
        const byId = new Map(states.map(state => [state.entityId, state]));
        configuration.groups.filter(group => group.instanceId === instanceId).forEach((group) => {
            const current = this.#groups.get(group.id)!;
            this.#groups.set(group.id, {
                ...current,
                entities: group.entities.map((entity) => {
                    const state = byId.get(entity.entityId) ?? missing(entity.entityId);
                    return entity.unitOverride ? { ...state, unit: entity.unitOverride } : state;
                }),
                status: 'ready',
            });
        });
        this.#emit();
    }

    #failInstance(instanceId: string, error: Error): void {
        const runtime = this.#instances.get(instanceId);
        if (!runtime)
            return;
        this.#instances.delete(instanceId);
        this.#disposeConnection(runtime);
        const authenticationFailure = error instanceof CredentialError || error instanceof AuthenticationError;
        this.#setInstanceStatus(instanceId, authenticationFailure ? 'authentication-failed' : 'stale');
        this.#emit();
        this.#dependencies.onError(instanceId, error);
        if (authenticationFailure)
            return;

        this.#instances.set(instanceId, runtime);
        const delay = this.#dependencies.retryDelay(runtime.attempt++);
        runtime.cancelRetry = this.#dependencies.scheduler.schedule(delay, () => {
            delete runtime.cancelRetry;
            if (!this.#isCurrent(this.#generation, instanceId))
                return;
            const configuration = this.#configuration!;
            const instance = configuration.instances.find(candidate => candidate.id === instanceId)!;
            const entityIds = [...new Set(configuration.groups
                .filter(group => group.instanceId === instanceId)
                .flatMap(group => group.entities.map(entity => entity.entityId)))];
            runtime.cancellation = this.#dependencies.createCancellation();
            this.#connectInstance(instance, entityIds, runtime, this.#generation).catch((retryError) => {
                if (this.#isCurrent(this.#generation, instanceId))
                    this.#failInstance(instanceId, retryError instanceof Error ? retryError : new Error('Home Assistant retry failed.'));
            });
        });
    }

    #disposeConnection(runtime: InstanceRuntime): void {
        const subscription = runtime.subscription;
        const session = runtime.session;
        delete runtime.subscription;
        delete runtime.session;
        // Disconnect native callbacks before cancellation and closure can emit
        // signals. Clear ownership first so re-entrant callbacks cannot dispose
        // the same native objects again.
        subscription?.stop();
        runtime.cancellation.cancel();
        session?.connection.close();
    }

    #setInstanceStatus(instanceId: string, status: RuntimeStatus): void {
        const configuration = this.#configuration;
        if (!configuration)
            return;
        configuration.groups.filter(group => group.instanceId === instanceId).forEach((group) => {
            const state = this.#groups.get(group.id)!;
            this.#groups.set(group.id, { ...state, status });
        });
    }

    #isCurrent(generation: number, instanceId: string): boolean {
        return generation === this.#generation && this.#instances.has(instanceId);
    }

    #emit(): void {
        const configuration = this.#configuration;
        if (configuration)
            this.#dependencies.onUpdate(configuration.groups.map(group => this.#groups.get(group.id)!));
    }
}
