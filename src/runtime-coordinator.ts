import type {
    ConfigurationV1,
    EntityConfiguration,
    InstanceConfiguration,
} from './configuration.js';
import type { CredentialStore } from './credential-store.js';
import type { EntityState, EntitySubscription } from './entity-state-client.js';
import type { AuthenticatedSession, Cancellation } from './home-assistant-client.js';

export interface OwnedCancellation extends Cancellation {
    cancel(): void;
}

export interface RuntimeGroupState {
    id: string;
    name: string;
    entities: EntityState[];
}

export interface RuntimeDependencies {
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
}

interface InstanceRuntime {
    cancellation: OwnedCancellation;
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
        this.#groups = new Map(configuration.groups.map(group => [group.id, {
            id: group.id,
            name: group.name,
            entities: group.entities.map(entity => missing(entity.entityId)),
        }]));
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
            runtime.cancellation.cancel();
            runtime.subscription?.stop();
            runtime.session?.connection.close();
        });
    }

    async #startInstance(instance: InstanceConfiguration, generation: number): Promise<void> {
        const configuration = this.#configuration!;
        const groups = configuration.groups.filter(group => group.instanceId === instance.id);
        const entityIds = [...new Set(groups.flatMap(group => group.entities.map(entity => entity.entityId)))];
        if (entityIds.length === 0)
            return;
        const runtime = { cancellation: this.#dependencies.createCancellation() } as InstanceRuntime;
        this.#instances.set(instance.id, runtime);
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
            this.#groups.set(group.id, {
                id: group.id,
                name: group.name,
                entities: group.entities.map((entity) => {
                    const state = byId.get(entity.entityId) ?? missing(entity.entityId);
                    return entity.unitOverride ? { ...state, unit: entity.unitOverride } : state;
                }),
            });
        });
        this.#emit();
    }

    #failInstance(instanceId: string, error: Error): void {
        const runtime = this.#instances.get(instanceId);
        if (!runtime)
            return;
        this.#instances.delete(instanceId);
        runtime.cancellation.cancel();
        runtime.subscription?.stop();
        runtime.session?.connection.close();
        this.#dependencies.onError(instanceId, error);
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
