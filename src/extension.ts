import Gio from 'gi://Gio';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

import { subscribeEntityStates } from './entities/state-client.js';
import { buildDashboardUrl } from './groups/configuration.js';
import { ShellPanelWidgetFactory } from './groups/panel-renderer.js';
import { PanelViewController } from './groups/panel-view.js';
import { CredentialStore } from './instances/credential-store.js';
import { buildWebSocketUrl } from './instances/configuration.js';
import { connectAuthenticated } from './instances/home-assistant-client.js';
import { SecretServiceBackend } from './instances/secret-service.js';
import { GioCancellation, GLibScheduler, SoupWebSocketTransport } from './instances/soup-websocket-transport.js';
import { ExtensionRuntime } from './runtime/extension-runtime.js';
import { RuntimeCoordinator, calculateRetryDelay } from './runtime/coordinator.js';
import { ConfigurationStore } from './shared/configuration.js';

const CONNECTION_TIMEOUT_MILLISECONDS = 10_000;

export default class PeekhassioExtension extends Extension {
    #runtime: ExtensionRuntime | null = null;

    enable(): void {
        const settings = this.getSettings();
        const store = new ConfigurationStore(settings);
        const credentials = new CredentialStore(new SecretServiceBackend());
        const scheduler = new GLibScheduler();
        const transport = new SoupWebSocketTransport();
        const panel = new PanelViewController(new ShellPanelWidgetFactory({
            openDashboard: (url) => {
                if (!Gio.AppInfo.launch_default_for_uri(url, null))
                    throw new Error('The default URI handler rejected the dashboard.');
            },
            openSettings: () => this.openPreferences(),
        }));
        const coordinator = new RuntimeCoordinator({
            buildDashboardUrl,
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
                Date.now,
                onUpdate,
                onError,
            ),
            onUpdate: groups => panel.render(groups),
            onError: (instanceId, error) => this.#reportError(error, instanceId),
            retryDelay: calculateRetryDelay,
            scheduler,
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
