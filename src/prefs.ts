import Adw from 'gi://Adw';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import { ExtensionPreferences, gettext as _ } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {
    ConfigurationStore,
    type ConfigurationV1,
    type InstanceConfiguration,
    createDefaultConfiguration,
    removeInstance,
    upsertInstance,
} from './configuration.js';

function messageFrom(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

export default class PeekhassioPreferences extends ExtensionPreferences {
    #configuration!: ConfigurationV1;
    #page: Adw.PreferencesPage | null = null;
    #store!: ConfigurationStore;
    #window!: Adw.PreferencesWindow;

    async fillPreferencesWindow(window: Adw.PreferencesWindow): Promise<void> {
        this.#window = window;
        this.#store = new ConfigurationStore(this.getSettings());
        try {
            this.#configuration = this.#store.load();
            this.#renderInstances();
        }
        catch (error) {
            this.#renderRecovery(messageFrom(error));
        }
    }

    #replacePage(page: Adw.PreferencesPage): void {
        if (this.#page)
            this.#window.remove(this.#page);
        this.#page = page;
        this.#window.add(page);
    }

    #renderInstances(): void {
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
        addButton.connect('clicked', () => void this.#editInstance());
        group.header_suffix = addButton;

        if (this.#configuration.instances.length === 0) {
            group.add(new Adw.ActionRow({
                title: _('No instances configured'),
                subtitle: _('Add a Home Assistant instance to get started.'),
            }));
        }

        this.#configuration.instances.forEach((instance) => {
            const row = new Adw.ActionRow({
                title: instance.name,
                subtitle: instance.baseUrl,
                subtitle_selectable: true,
            });
            const editButton = this.#iconButton('document-edit-symbolic', _('Edit instance'));
            const deleteButton = this.#iconButton('user-trash-symbolic', _('Delete instance'));
            editButton.connect('clicked', () => void this.#editInstance(instance));
            deleteButton.connect('clicked', () => void this.#deleteInstance(instance));
            row.add_suffix(editButton);
            row.add_suffix(deleteButton);
            group.add(row);
        });

        page.add(group);
        this.#replacePage(page);
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

    async #editInstance(existing?: InstanceConfiguration): Promise<void> {
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

        if (await dialog.choose(this.#window, null) !== 'save' || candidate === null)
            return;
        await this.#persist(candidate);
    }

    async #deleteInstance(instance: InstanceConfiguration): Promise<void> {
        const references = this.#configuration.groups.filter(group => group.instanceId === instance.id).length;
        if (references > 0) {
            await this.#showMessage(
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
        if (await dialog.choose(this.#window, null) !== 'delete')
            return;
        await this.#persist(removeInstance(this.#configuration, instance.id));
    }

    async #persist(configuration: ConfigurationV1): Promise<void> {
        try {
            this.#store.save(configuration);
            this.#configuration = configuration;
            this.#renderInstances();
        }
        catch (error) {
            await this.#showMessage(_('Could not save preferences'), messageFrom(error));
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
        resetButton.connect('clicked', () => void this.#resetConfiguration());
        row.add_suffix(resetButton);
        group.add(row);
        page.add(group);
        this.#replacePage(page);
    }

    async #resetConfiguration(): Promise<void> {
        const dialog = new Adw.AlertDialog({
            heading: _('Reset Peekhassio configuration?'),
            body: _('This permanently replaces the invalid configuration with an empty one.'),
        });
        dialog.add_response('cancel', _('Cancel'));
        dialog.add_response('reset', _('Reset'));
        dialog.close_response = 'cancel';
        dialog.set_response_appearance('reset', Adw.ResponseAppearance.DESTRUCTIVE);
        if (await dialog.choose(this.#window, null) !== 'reset')
            return;
        await this.#persist(createDefaultConfiguration());
    }

    async #showMessage(heading: string, body: string): Promise<void> {
        const dialog = new Adw.AlertDialog({ heading, body });
        dialog.add_response('close', _('Close'));
        await dialog.choose(this.#window, null);
    }
}
