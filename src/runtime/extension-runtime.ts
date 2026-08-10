import type { ConfigurationV1 } from '../shared/configuration.js';

export interface RuntimeSettings {
    connect(signal: string, callback: () => void): number;
    disconnect(signal: number): void;
}

export interface RuntimeConfigurationStore {
    load(): ConfigurationV1;
}

export interface ManagedRuntime {
    start(configuration: ConfigurationV1): Promise<void>;
    stop(): void;
}

export interface ManagedPanel {
    destroy(): void;
}

export class ExtensionRuntime {
    readonly #coordinator: ManagedRuntime;
    readonly #panel: ManagedPanel;
    readonly #reportError: (error: unknown) => void;
    readonly #settings: RuntimeSettings;
    readonly #store: RuntimeConfigurationStore;
    #generation = 0;
    #settingsSignals: number[] = [];

    constructor(
        settings: RuntimeSettings,
        store: RuntimeConfigurationStore,
        coordinator: ManagedRuntime,
        panel: ManagedPanel,
        reportError: (error: unknown) => void,
    ) {
        this.#settings = settings;
        this.#store = store;
        this.#coordinator = coordinator;
        this.#panel = panel;
        this.#reportError = reportError;
    }

    enable(): void {
        this.#settingsSignals = [
            this.#settings.connect('changed::configuration-json', () => this.#restart()),
            this.#settings.connect('changed::credential-revision', () => this.#restart()),
        ];
        this.#restart();
    }

    disable(): void {
        this.#generation++;
        this.#settingsSignals.forEach(signal => this.#settings.disconnect(signal));
        this.#settingsSignals = [];
        this.#coordinator.stop();
        this.#panel.destroy();
    }

    #restart(): void {
        const generation = ++this.#generation;
        try {
            this.#coordinator.start(this.#store.load()).catch((error) => {
                if (generation !== this.#generation)
                    return;
                this.#coordinator.stop();
                this.#panel.destroy();
                this.#reportError(error);
            });
        }
        catch (error) {
            this.#coordinator.stop();
            this.#panel.destroy();
            this.#reportError(error);
        }
    }
}
