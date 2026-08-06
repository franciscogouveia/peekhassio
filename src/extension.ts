import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

import { ConfigurationStore, buildWebSocketUrl } from './configuration.js';
import { CredentialStore } from './credential-store.js';
import { subscribeEntityStates } from './entity-state-client.js';
import { ExtensionRuntime } from './extension-runtime.js';
import { connectAuthenticated } from './home-assistant-client.js';
import { ShellPanelWidgetFactory } from './panel-renderer.js';
import { PanelViewController } from './panel-view.js';
import { RuntimeCoordinator } from './runtime-coordinator.js';
import { SecretServiceBackend } from './secret-service.js';
import { GioCancellation, GLibScheduler, SoupWebSocketTransport } from './soup-websocket-transport.js';

const CONNECTION_TIMEOUT_MILLISECONDS = 10_000;

export default class PeekhassioExtension extends Extension {
    #runtime: ExtensionRuntime | null = null;

    enable(): void {
        const settings = this.getSettings();
        const store = new ConfigurationStore(settings);
        const credentials = new CredentialStore(new SecretServiceBackend());
        const scheduler = new GLibScheduler();
        const transport = new SoupWebSocketTransport();
        const panel = new PanelViewController(new ShellPanelWidgetFactory());
        const coordinator = new RuntimeCoordinator({
            credentials,
            createCancellation: () => new GioCancellation(),
            connect: (instance, token, cancellation) => connectAuthenticated(
                transport,
                buildWebSocketUrl(instance),
                token,
                cancellation,
                scheduler,
                CONNECTION_TIMEOUT_MILLISECONDS,
            ),
            subscribe: (session, entities, cancellation, onUpdate, onError) => subscribeEntityStates(
                session.connection,
                entities,
                cancellation,
                scheduler,
                CONNECTION_TIMEOUT_MILLISECONDS,
                onUpdate,
                onError,
            ),
            onUpdate: groups => panel.render(groups),
            onError: (instanceId, error) => this.#reportError(error, instanceId),
        });

        this.#runtime = new ExtensionRuntime(settings, store, coordinator, panel, error => this.#reportError(error));
        this.#runtime.enable();
    }

    disable(): void {
        this.#runtime?.disable();
        this.#runtime = null;
    }

    #reportError(error: unknown, instanceId?: string): void {
        const message = error instanceof Error ? error.message : 'Unexpected runtime failure.';
        const instance = instanceId ? ` for instance ${instanceId}` : '';
        console.error(`Peekhassio runtime error${instance}: ${message}`);
    }
}
