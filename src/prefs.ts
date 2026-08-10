import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { CredentialStore } from './instances/credential-store.js';
import { moveEntity, removeEntity, upsertEntity } from './entities/configuration.js';
import { buildGroupPreferencesPage } from './groups/preferences.js';
import { removeInstance } from './instances/configuration.js';
import {
    ConfigurationStore,
    type ConfigurationV1,
    type EntityConfiguration,
    type InstanceConfiguration,
    createDefaultConfiguration,
} from './shared/configuration.js';
import { SecretServiceBackend } from './instances/secret-service.js';
import { buildInstancePreferencesPage } from './instances/preferences.js';
import { buildEntityRows } from './preferences/view.js';
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
                manageEntities: groupId => this.#manageEntities(groupId),
                persist: configuration => this.#persist(configuration, true),
                runAction: action => this.#runAction(action),
            })],
            showGroups ? 1 : 0,
        );
    }

    #iconButton(iconName: string, tooltipText: string): Gtk.Button {
        const button = new Gtk.Button({
            icon_name: iconName,
            tooltip_text: tooltipText,
            valign: Gtk.Align.CENTER,
        });
        button.add_css_class('flat');
        return button;
    }

    #manageEntities(groupId: string): void {
        const dialog = new Adw.PreferencesDialog();
        let page: Adw.PreferencesPage | null = null;
        const render = (): void => {
            if (page)
                dialog.remove(page);
            const group = this.#configuration.groups.find(candidate => candidate.id === groupId);
            if (!group)
                throw new Error(`Invalid configuration: group id ${groupId} must exist`);
            page = new Adw.PreferencesPage({ title: _('Entities') });
            const rows = new Adw.PreferencesGroup({
                title: group.name,
                description: _('Entities appear in this order.'),
            });
            const addButton = this.#iconButton('list-add-symbolic', _('Add entity'));
            addButton.connect('clicked', () => this.#runAction(() => this.#editEntity(dialog, groupId, render)));
            rows.header_suffix = addButton;

            const view = buildEntityRows(this.#configuration, groupId);
            if (view.length === 0) {
                rows.add(new Adw.ActionRow({
                    title: _('No entities configured'),
                    subtitle: _('Add a Home Assistant entity to this group.'),
                }));
            }
            view.forEach((item) => {
                const entity = group.entities.find(candidate => candidate.entityId === item.id)!;
                const row = new Adw.ActionRow({ title: item.title, subtitle: _(item.subtitle) });
                const upButton = this.#iconButton('go-up-symbolic', _('Move entity up'));
                const downButton = this.#iconButton('go-down-symbolic', _('Move entity down'));
                const editButton = this.#iconButton('document-edit-symbolic', _('Edit entity'));
                const deleteButton = this.#iconButton('user-trash-symbolic', _('Delete entity'));
                upButton.sensitive = item.canMoveUp;
                downButton.sensitive = item.canMoveDown;
                upButton.connect('clicked', () => this.#runAction(() => this.#persistEntityChange(
                    moveEntity(this.#configuration, groupId, entity.entityId, -1), render)));
                downButton.connect('clicked', () => this.#runAction(() => this.#persistEntityChange(
                    moveEntity(this.#configuration, groupId, entity.entityId, 1), render)));
                editButton.connect('clicked', () => this.#runAction(() => this.#editEntity(dialog, groupId, render, entity)));
                deleteButton.connect('clicked', () => this.#runAction(() => this.#deleteEntity(dialog, groupId, entity, render)));
                row.add_suffix(upButton);
                row.add_suffix(downButton);
                row.add_suffix(editButton);
                row.add_suffix(deleteButton);
                rows.add(row);
            });
            page.add(rows);
            dialog.add(page);
        };
        render();
        dialog.present(this.#window);
    }

    #editEntity(
        parent: Adw.PreferencesDialog,
        groupId: string,
        refresh: () => void,
        existing?: EntityConfiguration,
    ): void {
        const dialog = new Adw.AlertDialog({ heading: existing ? _('Edit entity') : _('Add entity') });
        const fields = new Adw.PreferencesGroup();
        const idRow = new Adw.EntryRow({ title: _('Entity ID'), text: existing?.entityId ?? '' });
        const unitRow = new Adw.EntryRow({ title: _('Unit override (optional)'), text: existing?.unitOverride ?? '' });
        fields.add(idRow);
        fields.add(unitRow);
        dialog.extra_child = fields;
        dialog.add_response('cancel', _('Cancel'));
        dialog.add_response('save', existing ? _('Save') : _('Add'));
        dialog.close_response = 'cancel';
        dialog.default_response = 'save';
        dialog.set_response_appearance('save', Adw.ResponseAppearance.SUGGESTED);
        let candidate: ConfigurationV1 | null = null;
        const validate = (): void => {
            try {
                candidate = upsertEntity(this.#configuration, groupId, existing?.entityId ?? null, {
                    entityId: idRow.text.trim(),
                    unitOverride: unitRow.text,
                });
                dialog.body = '';
                dialog.set_response_enabled('save', true);
            }
            catch (error) {
                candidate = null;
                dialog.body = messageFrom(error).replace('Invalid configuration: ', '');
                dialog.set_response_enabled('save', false);
            }
        };
        idRow.connect('changed', validate);
        unitRow.connect('changed', validate);
        validate();
        dialog.connect('response', (_dialog, response) => this.#runAction(() => {
            if (response === 'save' && candidate)
                this.#persistEntityChange(candidate, refresh);
        }));
        dialog.present(parent);
    }

    #deleteEntity(
        parent: Adw.PreferencesDialog,
        groupId: string,
        entity: EntityConfiguration,
        refresh: () => void,
    ): void {
        const dialog = new Adw.AlertDialog({
            heading: _('Delete “%s”?').format(entity.entityId),
            body: _('This removes the entity from this group.'),
        });
        dialog.add_response('cancel', _('Cancel'));
        dialog.add_response('delete', _('Delete'));
        dialog.close_response = 'cancel';
        dialog.set_response_appearance('delete', Adw.ResponseAppearance.DESTRUCTIVE);
        dialog.connect('response', (_dialog, response) => this.#runAction(() => {
            if (response === 'delete')
                this.#persistEntityChange(removeEntity(this.#configuration, groupId, entity.entityId), refresh);
        }));
        dialog.present(parent);
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
