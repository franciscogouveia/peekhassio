import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { CredentialStore } from './instances/credential-store.js';
import { manageEntities } from './entities/preferences.js';
import { buildGroupPreferencesPage } from './groups/preferences.js';
import { removeInstance } from './instances/configuration.js';
import {
    ConfigurationStore,
    type ConfigurationV1,
    type InstanceConfiguration,
    createDefaultConfiguration,
} from './shared/configuration.js';
import { SecretServiceBackend } from './instances/secret-service.js';
import { buildInstancePreferencesPage } from './instances/preferences.js';
import { runSafely } from './shared/action-runner.js';

function messageFrom(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

export default class PeekhassioPreferences extends ExtensionPreferences {
    #configuration!: ConfigurationV1;
    #credentials!: CredentialStore;
    #pages: Adw.PreferencesPage[] = [];
    #settings!: Gio.Settings;
    #store!: ConfigurationStore;
    #window!: Adw.PreferencesWindow;

    async fillPreferencesWindow(window: Adw.PreferencesWindow): Promise<void> {
        this.#window = window;
        this.#settings = this.getSettings();
        this.#store = new ConfigurationStore(this.#settings);
        this.#credentials = new CredentialStore(new SecretServiceBackend());
        try {
            this.#configuration = this.#store.load();
            this.#renderPreferences();
        }
        catch (error) {
            this.#renderRecovery(messageFrom(error));
        }
    }

    #replacePages(pages: Adw.PreferencesPage[], visibleIndex = 0): void {
        this.#pages.forEach(page => this.#window.remove(page));
        this.#pages = pages;
        pages.forEach(page => this.#window.add(page));
        this.#window.visible_page = pages[visibleIndex]!;
    }

    #renderPreferences(showGroups = false): void {
        this.#replacePages(
            [buildInstancePreferencesPage({
                configuration: this.#configuration,
                credentials: this.#credentials,
                settings: this.#settings,
                window: this.#window,
                deleteInstance: instance => this.#deleteInstance(instance),
                persist: configuration => this.#persist(configuration),
                persistOrThrow: configuration => this.#persistOrThrow(configuration),
                refresh: () => this.#renderPreferences(),
                runAction: action => this.#runAction(action),
                runAsyncAction: action => this.#runAsyncAction(action),
                updateTokenStatus: (row, baseUrl, instanceId) =>
                    this.#updateTokenStatus(row, baseUrl, instanceId),
            }), buildGroupPreferencesPage({
                configuration: this.#configuration,
                window: this.#window,
                manageEntities: groupId => manageEntities({
                    getConfiguration: () => this.#configuration,
                    persist: (configuration, refresh) => this.#persistEntityChange(configuration, refresh),
                    runAction: action => this.#runAction(action),
                    window: this.#window,
                }, groupId),
                persist: configuration => this.#persist(configuration, true),
                runAction: action => this.#runAction(action),
            })],
            showGroups ? 1 : 0,
        );
    }

    #persistEntityChange(configuration: ConfigurationV1, refresh: () => void): void {
        this.#store.save(configuration);
        this.#configuration = configuration;
        this.#renderPreferences(true);
        refresh();
    }

    #deleteInstance(instance: InstanceConfiguration): void {
        const references = this.#configuration.groups.filter(group => group.instanceId === instance.id).length;
        if (references > 0) {
            this.#showMessage(
                _('Instance cannot be deleted'),
                _('Remove or reassign its display groups first.'),
            );
            return;
        }

        const dialog = new Adw.AlertDialog({
            heading: _('Delete “%s”?').format(instance.name),
            body: _('This removes the instance from Peekhassio.'),
        });
        dialog.add_response('cancel', _('Cancel'));
        dialog.add_response('delete', _('Delete'));
        dialog.close_response = 'cancel';
        dialog.set_response_appearance('delete', Adw.ResponseAppearance.DESTRUCTIVE);
        dialog.connect('response', (_dialog, response) => this.#runAsyncAction(async () => {
            if (response === 'delete') {
                await this.#credentials.clearToken(instance.id);
                this.#persist(removeInstance(this.#configuration, instance.id));
            }
        }));
        dialog.present(this.#window);
    }

    #updateTokenStatus(row: Adw.ActionRow, baseUrl: string, instanceId: string): void {
        this.#credentials.hasToken(instanceId).then((configured) => {
            row.subtitle = `${baseUrl} · ${configured ? _('Token configured') : _('Token missing')}`;
        }).catch(() => {
            console.error('Peekhassio could not read an access token from Secret Service.');
            row.subtitle = `${baseUrl} · ${_('Token status unavailable')}`;
        });
    }

    #persist(configuration: ConfigurationV1, showGroups = false): void {
        try {
            this.#persistOrThrow(configuration, showGroups);
        }
        catch (error) {
            this.#showMessage(_('Could not save preferences'), messageFrom(error));
        }
    }

    #persistOrThrow(configuration: ConfigurationV1, showGroups = false): void {
        this.#store.save(configuration);
        this.#configuration = configuration;
        this.#renderPreferences(showGroups);
    }

    #renderRecovery(error: string): void {
        const page = new Adw.PreferencesPage({ title: _('Configuration error') });
        const group = new Adw.PreferencesGroup();
        const row = new Adw.ActionRow({
            title: _('Stored configuration is invalid'),
            subtitle: error,
        });
        const resetButton = new Gtk.Button({ label: _('Reset configuration'), valign: Gtk.Align.CENTER });
        resetButton.add_css_class('destructive-action');
        resetButton.connect('clicked', () => this.#runAction(() => this.#resetConfiguration()));
        row.add_suffix(resetButton);
        group.add(row);
        page.add(group);
        this.#replacePages([page]);
    }

    #resetConfiguration(): void {
        const dialog = new Adw.AlertDialog({
            heading: _('Reset Peekhassio configuration?'),
            body: _('This permanently replaces the invalid configuration with an empty one.'),
        });
        dialog.add_response('cancel', _('Cancel'));
        dialog.add_response('reset', _('Reset'));
        dialog.close_response = 'cancel';
        dialog.set_response_appearance('reset', Adw.ResponseAppearance.DESTRUCTIVE);
        dialog.connect('response', (_dialog, response) => this.#runAction(() => {
            if (response === 'reset')
                this.#persist(createDefaultConfiguration());
        }));
        dialog.present(this.#window);
    }

    #showMessage(heading: string, body: string): void {
        const dialog = new Adw.AlertDialog({ heading, body });
        dialog.add_response('close', _('Close'));
        dialog.present(this.#window);
    }

    #runAction(action: () => void): void {
        runSafely(action, (error) => {
            const message = messageFrom(error);
            console.error(`Peekhassio preferences action failed: ${message}`);
            this.#showMessage(_('Unexpected preferences error'), message);
        }, (reportingError) => {
            console.error(`Peekhassio could not display the error: ${messageFrom(reportingError)}`);
        });
    }

    #runAsyncAction(action: () => Promise<void>): void {
        action().catch(error => this.#runAction(() => {
            throw error;
        }));
    }
}
