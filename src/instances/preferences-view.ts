import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { createIconButton } from '../gtk/icon-button.js';
import {
    type ConfigurationV1,
    type InstanceConfiguration,
    incrementCredentialRevision,
} from '../shared/configuration.js';
import { removeInstance, upsertInstance } from './configuration.js';
import type { CredentialStore } from './credential-store.js';
import { buildInstanceRowViewModels } from './view-model.js';

export interface InstancePreferencesContext {
    configuration: ConfigurationV1;
    credentials: CredentialStore;
    settings: Gio.Settings;
    window: Adw.PreferencesWindow;
    persist: (configuration: ConfigurationV1) => void;
    persistOrThrow: (configuration: ConfigurationV1) => void;
    refresh: () => void;
    runAction: (action: () => void) => void;
    runAsyncAction: (action: () => Promise<void>) => void;
}

function messageFrom(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

export function buildInstancePreferencesPage(context: InstancePreferencesContext): Adw.PreferencesPage {
    const rowViewModels = buildInstanceRowViewModels(context.configuration);
    const page = new Adw.PreferencesPage({
        title: _('Instances'),
        icon_name: 'network-server-symbolic',
    });
    const group = new Adw.PreferencesGroup({
        title: _('Home Assistant instances'),
        description: _('Instances provide the base address used by display groups.'),
    });
    const addButton = createIconButton('list-add-symbolic', _('Add instance'));
    addButton.connect('clicked', () => context.runAction(() => editInstance(context)));
    group.header_suffix = addButton;

    if (rowViewModels.length === 0) {
        group.add(new Adw.ActionRow({
            title: _('No instances configured'),
            subtitle: _('Add a Home Assistant instance to get started.'),
        }));
    }

    rowViewModels.forEach((item) => {
        const instance = context.configuration.instances.find(candidate => candidate.id === item.id)!;
        const row = new Adw.ActionRow({
            title: item.title,
            subtitle: `${item.subtitle} · ${_('Checking token…')}`,
            subtitle_selectable: true,
        });
        updateTokenStatus(context, row, item.subtitle, instance.id);
        const tokenButton = createIconButton('dialog-password-symbolic', _('Manage access token'));
        const editButton = createIconButton('document-edit-symbolic', _('Edit instance'));
        const deleteButton = createIconButton('user-trash-symbolic', _('Delete instance'));
        tokenButton.connect('clicked', () => context.runAction(() => editToken(context, instance)));
        editButton.connect('clicked', () => context.runAction(() => editInstance(context, instance)));
        deleteButton.connect('clicked', () => context.runAction(() => deleteInstance(context, instance)));
        row.add_suffix(tokenButton);
        row.add_suffix(editButton);
        row.add_suffix(deleteButton);
        group.add(row);
    });

    page.add(group);
    return page;
}

function deleteInstance(context: InstancePreferencesContext, instance: InstanceConfiguration): void {
    const references = context.configuration.groups.filter(group => group.instanceId === instance.id).length;
    if (references > 0) {
        showMessage(
            context.window,
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
    dialog.connect('response', (_dialog, response) => context.runAsyncAction(async () => {
        if (response === 'delete') {
            await context.credentials.clearToken(instance.id);
            context.persist(removeInstance(context.configuration, instance.id));
        }
    }));
    dialog.present(context.window);
}

function updateTokenStatus(
    context: InstancePreferencesContext,
    row: Adw.ActionRow,
    baseUrl: string,
    instanceId: string,
): void {
    context.credentials.hasToken(instanceId).then((configured) => {
        row.subtitle = `${baseUrl} · ${configured ? _('Token configured') : _('Token missing')}`;
    }).catch(() => {
        console.error('Peekhassio could not read an access token from Secret Service.');
        row.subtitle = `${baseUrl} · ${_('Token status unavailable')}`;
    });
}

function showMessage(window: Adw.PreferencesWindow, heading: string, body: string): void {
    const dialog = new Adw.AlertDialog({ heading, body });
    dialog.add_response('close', _('Close'));
    dialog.present(window);
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
