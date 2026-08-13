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
    groups: Adw.PreferencesGroup[];
    groupPage: Gtk.Box;
    groupTab: Adw.ViewStackPage;
    instancePage: Gtk.Box;
    parent: Gtk.Widget;
    settings: Gio.Settings;
    store: ConfigurationStore;
}

export default class PeekhassioPreferences extends ExtensionPreferences {
    #context: PreferencesContext | null = null;

    getPreferencesWidget(): Gtk.Widget {
        const settings = this.getSettings();
        const store = new ConfigurationStore(settings);
        const stack = new Adw.ViewStack({ vexpand: true });
        const instancePage = this.#createTabPage();
        const groupPage = this.#createTabPage();
        stack.add_titled_with_icon(
            new Gtk.ScrolledWindow({ child: instancePage, vexpand: true }),
            'instances',
            _('Instances'),
            'network-server-symbolic',
        );
        const groupTab = stack.add_titled_with_icon(
            new Gtk.ScrolledWindow({ child: groupPage, vexpand: true }),
            'groups',
            _('Groups'),
            'view-list-symbolic',
        );
        const switcher = new Adw.ViewSwitcher({
            halign: Gtk.Align.CENTER,
            margin_bottom: 3,
            policy: Adw.ViewSwitcherPolicy.WIDE,
            stack,
        });
        const preferences = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            vexpand: true,
        });
        preferences.append(switcher);
        preferences.append(stack);
        this.#context = {
            configuration: createDefaultConfiguration(),
            credentials: new CredentialStore(new SecretServiceBackend()),
            groups: [],
            groupPage,
            groupTab,
            instancePage,
            parent: preferences,
            settings,
            store,
        };
        preferences.connect('destroy', () => {
            this.#context = null;
        });
        try {
            this.#context.configuration = store.load();
            this.#renderPreferences();
        }
        catch (error) {
            this.#renderRecovery(messageFrom(error));
        }
        return preferences;
    }

    #createTabPage(): Gtk.Box {
        return new Gtk.Box({
            margin_bottom: 12,
            margin_end: 12,
            margin_start: 12,
            margin_top: 6,
            orientation: Gtk.Orientation.VERTICAL,
        });
    }

    #activeContext(): PreferencesContext {
        if (this.#context === null)
            throw new Error('Preferences widget is closed.');
        return this.#context;
    }

    #replaceGroups(groups: Adw.PreferencesGroup[]): void {
        const context = this.#activeContext();
        if (context.groups[0])
            context.instancePage.remove(context.groups[0]);
        if (context.groups[1])
            context.groupPage.remove(context.groups[1]);
        context.groups = groups;
        if (groups[0])
            context.instancePage.append(groups[0]);
        if (groups[1])
            context.groupPage.append(groups[1]);
        context.groupTab.visible = groups.length > 1;
    }

    #renderPreferences(): void {
        const context = this.#activeContext();
        this.#replaceGroups(
            [buildInstancePreferencesGroup({
                configuration: context.configuration,
                credentials: context.credentials,
                parent: context.parent,
                settings: context.settings,
                persist: configuration => this.#persist(configuration),
                persistOrThrow: configuration => this.#persistOrThrow(configuration),
                refresh: () => this.#renderPreferences(),
                runAction: action => this.#runAction(action),
                runAsyncAction: action => this.#runAsyncAction(action),
            }), buildGroupPreferencesGroup({
                configuration: context.configuration,
                manageEntities: groupId => manageEntities({
                    getConfiguration: () => this.#activeContext().configuration,
                    parent: context.parent,
                    persist: (configuration, refresh) => this.#persistEntityChange(configuration, refresh),
                    runAction: action => this.#runAction(action),
                }, groupId),
                parent: context.parent,
                persist: configuration => this.#persist(configuration),
                runAction: action => this.#runAction(action),
            })],
        );
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
        this.#replaceGroups([group]);
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
        dialog.present(this.#activeContext().parent);
    }

    #showMessage(heading: string, body: string): void {
        const dialog = new Adw.AlertDialog({ heading, body });
        dialog.add_response('close', _('Close'));
        dialog.present(this.#activeContext().parent);
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
