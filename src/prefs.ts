import Adw from 'gi://Adw';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { runSafely } from './action-runner.js';
import {
    ConfigurationStore,
    type ConfigurationV1,
    type GroupConfiguration,
    type InstanceConfiguration,
    createDefaultConfiguration,
    moveGroup,
    removeGroup,
    removeInstance,
    upsertGroup,
    upsertInstance,
} from './configuration.js';
import { buildPreferencesView } from './preferences-view.js';

function messageFrom(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

export default class PeekhassioPreferences extends ExtensionPreferences {
    #configuration!: ConfigurationV1;
    #pages: Adw.PreferencesPage[] = [];
    #store!: ConfigurationStore;
    #window!: Adw.PreferencesWindow;

    async fillPreferencesWindow(window: Adw.PreferencesWindow): Promise<void> {
        this.#window = window;
        this.#store = new ConfigurationStore(this.getSettings());
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
            [this.#buildInstancesPage(), this.#buildGroupsPage()],
            showGroups ? 1 : 0,
        );
    }

    #buildInstancesPage(): Adw.PreferencesPage {
        const view = buildPreferencesView(this.#configuration);
        const page = new Adw.PreferencesPage({
            title: _('Instances'),
            icon_name: 'network-server-symbolic',
        });
        const group = new Adw.PreferencesGroup({
            title: _('Home Assistant instances'),
            description: _('Instances provide the base address used by display groups.'),
        });
        const addButton = new Gtk.Button({
            icon_name: 'list-add-symbolic',
            tooltip_text: _('Add instance'),
            valign: Gtk.Align.CENTER,
        });
        addButton.add_css_class('flat');
        addButton.connect('clicked', () => this.#runAction(() => this.#editInstance()));
        group.header_suffix = addButton;

        if (view.instanceRows.length === 0) {
            group.add(new Adw.ActionRow({
                title: _('No instances configured'),
                subtitle: _('Add a Home Assistant instance to get started.'),
            }));
        }

        view.instanceRows.forEach((item) => {
            const instance = this.#configuration.instances.find(candidate => candidate.id === item.id)!;
            const row = new Adw.ActionRow({
                title: item.title,
                subtitle: item.subtitle,
                subtitle_selectable: true,
            });
            const editButton = this.#iconButton('document-edit-symbolic', _('Edit instance'));
            const deleteButton = this.#iconButton('user-trash-symbolic', _('Delete instance'));
            editButton.connect('clicked', () => this.#runAction(() => this.#editInstance(instance)));
            deleteButton.connect('clicked', () => this.#runAction(() => this.#deleteInstance(instance)));
            row.add_suffix(editButton);
            row.add_suffix(deleteButton);
            group.add(row);
        });

        page.add(group);
        return page;
    }

    #buildGroupsPage(): Adw.PreferencesPage {
        const view = buildPreferencesView(this.#configuration);
        const page = new Adw.PreferencesPage({
            title: _('Groups'),
            icon_name: 'view-list-symbolic',
        });
        const group = new Adw.PreferencesGroup({
            title: _('Display groups'),
            description: _('Groups appear in this order in the top bar.'),
        });
        const addButton = this.#iconButton('list-add-symbolic', _('Add group'));
        addButton.sensitive = view.canAddGroup;
        addButton.connect('clicked', () => this.#runAction(() => this.#editGroup()));
        group.header_suffix = addButton;

        if (view.groupRows.length === 0) {
            group.add(new Adw.ActionRow({
                title: _('No groups configured'),
                subtitle: this.#configuration.instances.length === 0
                    ? _('Add a Home Assistant instance before creating a group.')
                    : _('Add a display group to get started.'),
            }));
        }

        view.groupRows.forEach((item) => {
            const displayGroup = this.#configuration.groups.find(candidate => candidate.id === item.id)!;
            const row = new Adw.ActionRow({
                title: item.title,
                subtitle: item.subtitle,
            });
            const upButton = this.#iconButton('go-up-symbolic', _('Move group up'));
            const downButton = this.#iconButton('go-down-symbolic', _('Move group down'));
            const editButton = this.#iconButton('document-edit-symbolic', _('Edit group'));
            const deleteButton = this.#iconButton('user-trash-symbolic', _('Delete group'));
            upButton.sensitive = item.canMoveUp;
            downButton.sensitive = item.canMoveDown;
            upButton.connect('clicked', () => this.#runAction(() => this.#moveGroup(displayGroup, -1)));
            downButton.connect('clicked', () => this.#runAction(() => this.#moveGroup(displayGroup, 1)));
            editButton.connect('clicked', () => this.#runAction(() => this.#editGroup(displayGroup)));
            deleteButton.connect('clicked', () => this.#runAction(() => this.#deleteGroup(displayGroup)));
            row.add_suffix(upButton);
            row.add_suffix(downButton);
            row.add_suffix(editButton);
            row.add_suffix(deleteButton);
            group.add(row);
        });

        page.add(group);
        return page;
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

    #editInstance(existing?: InstanceConfiguration): void {
        const id = existing?.id ?? GLib.uuid_string_random();
        const dialog = new Adw.AlertDialog({
            heading: existing ? _('Edit instance') : _('Add instance'),
        });
        const fields = new Adw.PreferencesGroup();
        const nameRow = new Adw.EntryRow({ title: _('Name'), text: existing?.name ?? '' });
        const urlRow = new Adw.EntryRow({ title: _('Base URL'), text: existing?.baseUrl ?? 'https://' });
        fields.add(nameRow);
        fields.add(urlRow);
        dialog.extra_child = fields;
        dialog.add_response('cancel', _('Cancel'));
        dialog.add_response('save', existing ? _('Save') : _('Add'));
        dialog.close_response = 'cancel';
        dialog.default_response = 'save';
        dialog.set_response_appearance('save', Adw.ResponseAppearance.SUGGESTED);

        let candidate: ConfigurationV1 | null = null;
        const validate = (): void => {
            const instance = {
                id,
                name: nameRow.text.trim(),
                baseUrl: urlRow.text.trim(),
            };
            try {
                candidate = upsertInstance(this.#configuration, instance);
                const scheme = GLib.Uri.parse(instance.baseUrl, GLib.UriFlags.NONE).get_scheme();
                dialog.body = scheme === 'http'
                    ? _('Warning: HTTP does not protect Home Assistant data or credentials in transit.')
                    : '';
                dialog.set_response_enabled('save', true);
            }
            catch (error) {
                candidate = null;
                dialog.body = messageFrom(error).replace('Invalid configuration: ', '');
                dialog.set_response_enabled('save', false);
            }
        };
        nameRow.connect('changed', validate);
        urlRow.connect('changed', validate);
        validate();

        dialog.connect('response', (_dialog, response) => this.#runAction(() => {
            if (response === 'save' && candidate !== null)
                this.#persist(candidate);
        }));
        dialog.present(this.#window);
    }

    #editGroup(existing?: GroupConfiguration): void {
        const id = existing?.id ?? GLib.uuid_string_random();
        const instanceNames = this.#configuration.instances
            .map(instance => `${instance.name} · ${instance.baseUrl}`);
        const selected = existing
            ? this.#configuration.instances.findIndex(instance => instance.id === existing.instanceId)
            : 0;
        const dialog = new Adw.AlertDialog({
            heading: existing ? _('Edit group') : _('Add group'),
        });
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
            const instance = this.#configuration.instances[instanceRow.selected];
            try {
                if (!instance)
                    throw new Error(_('Select a Home Assistant instance.'));
                candidate = upsertGroup(this.#configuration, {
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

        dialog.connect('response', (_dialog, response) => this.#runAction(() => {
            if (response === 'save' && candidate !== null)
                this.#persist(candidate, true);
        }));
        dialog.present(this.#window);
    }

    #deleteGroup(group: GroupConfiguration): void {
        const dialog = new Adw.AlertDialog({
            heading: _('Delete “%s”?').format(group.name),
            body: _('This also removes every entity configured in this group.'),
        });
        dialog.add_response('cancel', _('Cancel'));
        dialog.add_response('delete', _('Delete'));
        dialog.close_response = 'cancel';
        dialog.set_response_appearance('delete', Adw.ResponseAppearance.DESTRUCTIVE);
        dialog.connect('response', (_dialog, response) => this.#runAction(() => {
            if (response === 'delete')
                this.#persist(removeGroup(this.#configuration, group.id), true);
        }));
        dialog.present(this.#window);
    }

    #moveGroup(group: GroupConfiguration, direction: -1 | 1): void {
        this.#persist(moveGroup(this.#configuration, group.id, direction), true);
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
        dialog.connect('response', (_dialog, response) => this.#runAction(() => {
            if (response === 'delete')
                this.#persist(removeInstance(this.#configuration, instance.id));
        }));
        dialog.present(this.#window);
    }

    #persist(configuration: ConfigurationV1, showGroups = false): void {
        try {
            this.#store.save(configuration);
            this.#configuration = configuration;
            this.#renderPreferences(showGroups);
        }
        catch (error) {
            this.#showMessage(_('Could not save preferences'), messageFrom(error));
        }
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
}
