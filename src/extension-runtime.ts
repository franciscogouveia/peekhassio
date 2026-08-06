import type { ConfigurationV1 } from './configuration.js';

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
    #settingsSignal = 0;

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
        this.#settingsSignal = this.#settings.connect('changed::configuration-json', () => this.#restart());
        this.#restart();
    }

    disable(): void {
        this.#generation++;
        if (this.#settingsSignal !== 0)
            this.#settings.disconnect(this.#settingsSignal);
        this.#settingsSignal = 0;
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
