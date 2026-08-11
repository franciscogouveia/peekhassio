import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import type { ConfigurationV1, EntityConfiguration } from '../shared/configuration.js';
import { moveEntity, removeEntity, upsertEntity } from './configuration.js';
import { buildEntityRows } from './view.js';

export interface EntityPreferencesContext {
    getConfiguration: () => ConfigurationV1;
    persist: (configuration: ConfigurationV1, refresh: () => void) => void;
    runAction: (action: () => void) => void;
    window: Adw.PreferencesWindow;
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

export function manageEntities(context: EntityPreferencesContext, groupId: string): void {
    const dialog = new Adw.PreferencesDialog();
    let page: Adw.PreferencesPage | null = null;
    const render = (): void => {
        if (page)
            dialog.remove(page);
        const configuration = context.getConfiguration();
        const group = configuration.groups.find(candidate => candidate.id === groupId);
        if (!group)
            throw new Error(`Invalid configuration: group id ${groupId} must exist`);
        page = new Adw.PreferencesPage({ title: _('Entities') });
        const rows = new Adw.PreferencesGroup({
            title: group.name,
            description: _('Entities appear in this order.'),
        });
        const addButton = iconButton('list-add-symbolic', _('Add entity'));
        addButton.connect('clicked', () => context.runAction(() => editEntity(context, dialog, groupId, render)));
        rows.header_suffix = addButton;

        const view = buildEntityRows(configuration, groupId);
        if (view.length === 0) {
            rows.add(new Adw.ActionRow({
                title: _('No entities configured'),
                subtitle: _('Add a Home Assistant entity to this group.'),
            }));
        }
        view.forEach((item) => {
            const entity = group.entities.find(candidate => candidate.entityId === item.id)!;
            const row = new Adw.ActionRow({ title: item.title, subtitle: _(item.subtitle) });
            const upButton = iconButton('go-up-symbolic', _('Move entity up'));
            const downButton = iconButton('go-down-symbolic', _('Move entity down'));
            const editButton = iconButton('document-edit-symbolic', _('Edit entity'));
            const deleteButton = iconButton('user-trash-symbolic', _('Delete entity'));
            upButton.sensitive = item.canMoveUp;
            downButton.sensitive = item.canMoveDown;
            upButton.connect('clicked', () => context.runAction(() => context.persist(
                moveEntity(context.getConfiguration(), groupId, entity.entityId, -1), render)));
            downButton.connect('clicked', () => context.runAction(() => context.persist(
                moveEntity(context.getConfiguration(), groupId, entity.entityId, 1), render)));
            editButton.connect('clicked', () => context.runAction(() =>
                editEntity(context, dialog, groupId, render, entity)));
            deleteButton.connect('clicked', () => context.runAction(() =>
                deleteEntity(context, dialog, groupId, entity, render)));
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
    dialog.present(context.window);
}

function editEntity(
    context: EntityPreferencesContext,
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
            candidate = upsertEntity(context.getConfiguration(), groupId, existing?.entityId ?? null, {
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
    dialog.connect('response', (_dialog, response) => context.runAction(() => {
        if (response === 'save' && candidate)
            context.persist(candidate, refresh);
    }));
    dialog.present(parent);
}

function deleteEntity(
    context: EntityPreferencesContext,
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
    dialog.connect('response', (_dialog, response) => context.runAction(() => {
        if (response === 'delete') {
            context.persist(
                removeEntity(context.getConfiguration(), groupId, entity.entityId),
                refresh,
            );
        }
    }));
    dialog.present(parent);
}
