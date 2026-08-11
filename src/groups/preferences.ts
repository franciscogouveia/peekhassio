import Adw from 'gi://Adw';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import { gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import type { ConfigurationV1, GroupConfiguration } from '../shared/configuration.js';
import { moveGroup, removeGroup, upsertGroup } from './configuration.js';
import { buildGroupView } from './view.js';

export interface GroupPreferencesContext {
    configuration: ConfigurationV1;
    window: Adw.PreferencesWindow;
    manageEntities: (groupId: string) => void;
    persist: (configuration: ConfigurationV1) => void;
    runAction: (action: () => void) => void;
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

export function buildGroupPreferencesPage(context: GroupPreferencesContext): Adw.PreferencesPage {
    const view = buildGroupView(context.configuration);
    const page = new Adw.PreferencesPage({
        title: _('Groups'),
        icon_name: 'view-list-symbolic',
    });
    const group = new Adw.PreferencesGroup({
        title: _('Display groups'),
        description: _('Groups appear in this order in the top bar.'),
    });
    const addButton = iconButton('list-add-symbolic', _('Add group'));
    addButton.sensitive = view.canAddGroup;
    addButton.connect('clicked', () => context.runAction(() => editGroup(context)));
    group.header_suffix = addButton;

    if (view.rows.length === 0) {
        group.add(new Adw.ActionRow({
            title: _('No groups configured'),
            subtitle: context.configuration.instances.length === 0
                ? _('Add a Home Assistant instance before creating a group.')
                : _('Add a display group to get started.'),
        }));
    }

    view.rows.forEach((item) => {
        const displayGroup = context.configuration.groups.find(candidate => candidate.id === item.id)!;
        const row = new Adw.ActionRow({ title: item.title, subtitle: item.subtitle });
        const upButton = iconButton('go-up-symbolic', _('Move group up'));
        const downButton = iconButton('go-down-symbolic', _('Move group down'));
        const entitiesButton = iconButton('view-list-symbolic', _('Manage entities'));
        const editButton = iconButton('document-edit-symbolic', _('Edit group'));
        const deleteButton = iconButton('user-trash-symbolic', _('Delete group'));
        upButton.sensitive = item.canMoveUp;
        downButton.sensitive = item.canMoveDown;
        upButton.connect('clicked', () => context.runAction(() => moveDisplayGroup(context, displayGroup, -1)));
        downButton.connect('clicked', () => context.runAction(() => moveDisplayGroup(context, displayGroup, 1)));
        entitiesButton.connect('clicked', () => context.runAction(() => context.manageEntities(displayGroup.id)));
        editButton.connect('clicked', () => context.runAction(() => editGroup(context, displayGroup)));
        deleteButton.connect('clicked', () => context.runAction(() => deleteGroup(context, displayGroup)));
        row.add_suffix(upButton);
        row.add_suffix(downButton);
        row.add_suffix(entitiesButton);
        row.add_suffix(editButton);
        row.add_suffix(deleteButton);
        group.add(row);
    });

    page.add(group);
    return page;
}

function editGroup(context: GroupPreferencesContext, existing?: GroupConfiguration): void {
    const id = existing?.id ?? GLib.uuid_string_random();
    const instanceNames = context.configuration.instances
        .map(instance => `${instance.name} · ${instance.baseUrl}`);
    const selected = existing
        ? context.configuration.instances.findIndex(instance => instance.id === existing.instanceId)
        : 0;
    const dialog = new Adw.AlertDialog({ heading: existing ? _('Edit group') : _('Add group') });
    const fields = new Adw.PreferencesGroup();
    const instanceRow = new Adw.ComboRow({
        title: _('Home Assistant instance'),
        model: Gtk.StringList.new(instanceNames),
        selected,
    });
    const nameRow = new Adw.EntryRow({ title: _('Name'), text: existing?.name ?? '' });
    const pathRow = new Adw.EntryRow({ title: _('Dashboard path'), text: existing?.dashboardPath ?? '/' });
    fields.add(instanceRow);
    fields.add(nameRow);
    fields.add(pathRow);
    dialog.extra_child = fields;
    dialog.add_response('cancel', _('Cancel'));
    dialog.add_response('save', existing ? _('Save') : _('Add'));
    dialog.close_response = 'cancel';
    dialog.default_response = 'save';
    dialog.set_response_appearance('save', Adw.ResponseAppearance.SUGGESTED);

    let candidate: ConfigurationV1 | null = null;
    const validate = (): void => {
        const instance = context.configuration.instances[instanceRow.selected];
        try {
            if (!instance)
                throw new Error(_('Select a Home Assistant instance.'));
            candidate = upsertGroup(context.configuration, {
                id,
                instanceId: instance.id,
                name: nameRow.text.trim(),
                dashboardPath: pathRow.text.trim(),
                entities: existing?.entities ?? [],
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
    instanceRow.connect('notify::selected', validate);
    nameRow.connect('changed', validate);
    pathRow.connect('changed', validate);
    validate();

    dialog.connect('response', (_dialog, response) => context.runAction(() => {
        if (response === 'save' && candidate !== null)
            context.persist(candidate);
    }));
    dialog.present(context.window);
}

function deleteGroup(context: GroupPreferencesContext, group: GroupConfiguration): void {
    const dialog = new Adw.AlertDialog({
        heading: _('Delete “%s”?').format(group.name),
        body: _('This also removes every entity configured in this group.'),
    });
    dialog.add_response('cancel', _('Cancel'));
    dialog.add_response('delete', _('Delete'));
    dialog.close_response = 'cancel';
    dialog.set_response_appearance('delete', Adw.ResponseAppearance.DESTRUCTIVE);
    dialog.connect('response', (_dialog, response) => context.runAction(() => {
        if (response === 'delete')
            context.persist(removeGroup(context.configuration, group.id));
    }));
    dialog.present(context.window);
}

function moveDisplayGroup(context: GroupPreferencesContext, group: GroupConfiguration, direction: -1 | 1): void {
    context.persist(moveGroup(context.configuration, group.id, direction));
}
