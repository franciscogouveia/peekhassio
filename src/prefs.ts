import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { CredentialStore } from './instances/credential-store.js';
import { manageEntities } from './entities/preferences-view.js';
import { buildGroupPreferencesGroup } from './groups/preferences-view.js';
import {
    ConfigurationStore,
    type ConfigurationV1,
    createDefaultConfiguration,
} from './shared/configuration.js';
import { SecretServiceBackend } from './instances/secret-service.js';
import { buildInstancePreferencesGroup } from './instances/preferences-view.js';
import { runSafely } from './shared/action-runner.js';

function messageFrom(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

interface PreferencesContext {
    configuration: ConfigurationV1;
    credentials: CredentialStore;
    pages: Adw.PreferencesPage[];
    settings: Gio.Settings;
    store: ConfigurationStore;
    window: Adw.PreferencesWindow;
}

export default class PeekhassioPreferences extends ExtensionPreferences {
    #context: PreferencesContext | null = null;

    async fillPreferencesWindow(window: Adw.PreferencesWindow): Promise<void> {
        const settings = this.getSettings();
        const store = new ConfigurationStore(settings);
        this.#context = {
            configuration: createDefaultConfiguration(),
            credentials: new CredentialStore(new SecretServiceBackend()),
            pages: [],
            settings,
            store,
            window,
        };
        window.connect('close-request', () => {
            this.#context = null;
            return false;
        });
        try {
            this.#context.configuration = store.load();
            this.#renderPreferences();
        }
        catch (error) {
            this.#renderRecovery(messageFrom(error));
        }
    }

    #activeContext(): PreferencesContext {
        if (this.#context === null)
            throw new Error('Preferences widget is closed.');
        return this.#context;
    }

    #replacePages(pages: Adw.PreferencesPage[]): void {
        const context = this.#activeContext();
        context.pages.forEach(page => context.window.remove(page));
        context.pages = pages;
        pages.forEach(page => context.window.add(page));
    }

    #renderPreferences(): void {
        const context = this.#activeContext();
        const instancePage = new Adw.PreferencesPage({
            title: _('Instances'),
            icon_name: 'network-server-symbolic',
        });
        instancePage.add(buildInstancePreferencesGroup({
            configuration: context.configuration,
            credentials: context.credentials,
            parent: context.window,
            settings: context.settings,
            persist: configuration => this.#persist(configuration),
            persistOrThrow: configuration => this.#persistOrThrow(configuration),
            refresh: () => this.#renderPreferences(),
            runAction: action => this.#runAction(action),
            runAsyncAction: action => this.#runAsyncAction(action),
        }));
        const groupPage = new Adw.PreferencesPage({
            title: _('Groups'),
            icon_name: 'view-list-symbolic',
        });
        groupPage.add(buildGroupPreferencesGroup({
            configuration: context.configuration,
            manageEntities: groupId => manageEntities({
                getConfiguration: () => this.#activeContext().configuration,
                parent: context.window,
                persist: (configuration, refresh) => this.#persistEntityChange(configuration, refresh),
                runAction: action => this.#runAction(action),
            }, groupId),
            parent: context.window,
            persist: configuration => this.#persist(configuration),
            runAction: action => this.#runAction(action),
        }));
        this.#replacePages([instancePage, groupPage]);
    }

    #persistEntityChange(configuration: ConfigurationV1, refresh: () => void): void {
        const context = this.#activeContext();
        context.store.save(configuration);
        context.configuration = configuration;
        this.#renderPreferences();
        refresh();
    }

    #persist(configuration: ConfigurationV1): void {
        try {
            this.#persistOrThrow(configuration);
        }
        catch (error) {
            this.#showMessage(_('Could not save preferences'), messageFrom(error));
        }
    }

    #persistOrThrow(configuration: ConfigurationV1): void {
        const context = this.#activeContext();
        context.store.save(configuration);
        context.configuration = configuration;
        this.#renderPreferences();
    }

    #renderRecovery(error: string): void {
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
        const page = new Adw.PreferencesPage({ title: _('Configuration error') });
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
        dialog.present(this.#activeContext().window);
    }

    #showMessage(heading: string, body: string): void {
        const dialog = new Adw.AlertDialog({ heading, body });
        dialog.add_response('close', _('Close'));
        dialog.present(this.#activeContext().window);
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
