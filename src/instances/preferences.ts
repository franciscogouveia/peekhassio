import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { buildPreferencesView } from '../preferences/view.js';
import {
    type ConfigurationV1,
    type InstanceConfiguration,
    incrementCredentialRevision,
} from '../shared/configuration.js';
import { upsertInstance } from './configuration.js';
import type { CredentialStore } from './credential-store.js';

export interface InstancePreferencesContext {
    configuration: ConfigurationV1;
    credentials: CredentialStore;
    settings: Gio.Settings;
    window: Adw.PreferencesWindow;
    deleteInstance: (instance: InstanceConfiguration) => void;
    persist: (configuration: ConfigurationV1) => void;
    persistOrThrow: (configuration: ConfigurationV1) => void;
    refresh: () => void;
    runAction: (action: () => void) => void;
    runAsyncAction: (action: () => Promise<void>) => void;
    updateTokenStatus: (row: Adw.ActionRow, baseUrl: string, instanceId: string) => void;
}

function messageFrom(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function iconButton(iconName: string, tooltipText: string): Gtk.Button {
    const button = new Gtk.Button({
        icon_name: iconName,
        tooltip_text: tooltipText,
        valign: Gtk.Align.CENTER,
    });
    button.add_css_class('flat');
    return button;
}

export function buildInstancePreferencesPage(context: InstancePreferencesContext): Adw.PreferencesPage {
    const view = buildPreferencesView(context.configuration);
    const page = new Adw.PreferencesPage({
        title: _('Instances'),
        icon_name: 'network-server-symbolic',
    });
    const group = new Adw.PreferencesGroup({
        title: _('Home Assistant instances'),
        description: _('Instances provide the base address used by display groups.'),
    });
    const addButton = iconButton('list-add-symbolic', _('Add instance'));
    addButton.connect('clicked', () => context.runAction(() => editInstance(context)));
    group.header_suffix = addButton;

    if (view.instanceRows.length === 0) {
        group.add(new Adw.ActionRow({
            title: _('No instances configured'),
            subtitle: _('Add a Home Assistant instance to get started.'),
        }));
    }

    view.instanceRows.forEach((item) => {
        const instance = context.configuration.instances.find(candidate => candidate.id === item.id)!;
        const row = new Adw.ActionRow({
            title: item.title,
            subtitle: `${item.subtitle} · ${_('Checking token…')}`,
            subtitle_selectable: true,
        });
        context.updateTokenStatus(row, item.subtitle, instance.id);
        const tokenButton = iconButton('dialog-password-symbolic', _('Manage access token'));
        const editButton = iconButton('document-edit-symbolic', _('Edit instance'));
        const deleteButton = iconButton('user-trash-symbolic', _('Delete instance'));
        tokenButton.connect('clicked', () => context.runAction(() => editToken(context, instance)));
        editButton.connect('clicked', () => context.runAction(() => editInstance(context, instance)));
        deleteButton.connect('clicked', () => context.runAction(() => context.deleteInstance(instance)));
        row.add_suffix(tokenButton);
        row.add_suffix(editButton);
        row.add_suffix(deleteButton);
        group.add(row);
    });

    page.add(group);
    return page;
}

function editInstance(context: InstancePreferencesContext, existing?: InstanceConfiguration): void {
    const id = existing?.id ?? GLib.uuid_string_random();
    const dialog = new Adw.AlertDialog({ heading: existing ? _('Edit instance') : _('Add instance') });
    const fields = new Adw.PreferencesGroup();
    const nameRow = new Adw.EntryRow({ title: _('Name'), text: existing?.name ?? '' });
    const urlRow = new Adw.EntryRow({ title: _('Base URL'), text: existing?.baseUrl ?? 'https://' });
    const tokenRow = existing ? null : new Adw.PasswordEntryRow({ title: _('Long-lived access token') });
    fields.add(nameRow);
    fields.add(urlRow);
    if (tokenRow)
        fields.add(tokenRow);
    dialog.extra_child = fields;
    dialog.add_response('cancel', _('Cancel'));
    dialog.add_response('save', existing ? _('Save') : _('Add'));
    dialog.close_response = 'cancel';
    dialog.default_response = 'save';
    dialog.set_response_appearance('save', Adw.ResponseAppearance.SUGGESTED);

    let candidate: ConfigurationV1 | null = null;
    const validate = (): void => {
        const instance = { id, name: nameRow.text.trim(), baseUrl: urlRow.text.trim() };
        try {
            candidate = upsertInstance(context.configuration, instance);
            const scheme = GLib.Uri.parse(instance.baseUrl, GLib.UriFlags.NONE).get_scheme();
            dialog.body = scheme === 'http'
                ? _('Warning: HTTP does not protect Home Assistant data or credentials in transit.')
                : '';
            dialog.set_response_enabled('save', tokenRow === null || tokenRow.text.trim() !== '');
        }
        catch (error) {
            candidate = null;
            dialog.body = messageFrom(error).replace('Invalid configuration: ', '');
            dialog.set_response_enabled('save', false);
        }
    };
    nameRow.connect('changed', validate);
    urlRow.connect('changed', validate);
    tokenRow?.connect('changed', validate);
    validate();

    dialog.connect('response', (_dialog, response) => {
        if (response !== 'save' || candidate === null)
            return;
        if (tokenRow === null) {
            context.runAction(() => context.persist(candidate!));
            return;
        }
        context.runAsyncAction(async () => {
            await context.credentials.saveToken(id, tokenRow.text);
            try {
                context.persistOrThrow(candidate!);
            }
            catch (error) {
                try {
                    await context.credentials.clearToken(id);
                }
                catch {
                    console.error('Peekhassio could not roll back an access token after configuration storage failed.');
                }
                throw error;
            }
        });
    });
    dialog.present(context.window);
}

function editToken(context: InstancePreferencesContext, instance: InstanceConfiguration): void {
    const dialog = new Adw.AlertDialog({
        heading: _('Access token for “%s”').format(instance.name),
        body: _('The token is stored securely in GNOME Secret Service.'),
    });
    const fields = new Adw.PreferencesGroup();
    const tokenRow = new Adw.PasswordEntryRow({ title: _('Long-lived access token') });
    fields.add(tokenRow);
    dialog.extra_child = fields;
    dialog.add_response('cancel', _('Cancel'));
    dialog.add_response('remove', _('Remove token'));
    dialog.set_response_appearance('remove', Adw.ResponseAppearance.DESTRUCTIVE);
    dialog.add_response('save', _('Save token'));
    dialog.close_response = 'cancel';
    dialog.default_response = 'save';
    dialog.set_response_appearance('save', Adw.ResponseAppearance.SUGGESTED);
    const validate = (): void => dialog.set_response_enabled('save', tokenRow.text.trim() !== '');
    tokenRow.connect('changed', validate);
    validate();
    dialog.connect('response', (_dialog, response) => context.runAsyncAction(async () => {
        if (response === 'save')
            await context.credentials.saveToken(instance.id, tokenRow.text);
        else if (response === 'remove')
            await context.credentials.clearToken(instance.id);
        else
            return;
        incrementCredentialRevision(context.settings);
        context.refresh();
    }));
    dialog.present(context.window);
}
