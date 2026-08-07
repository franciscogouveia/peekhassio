import Clutter from 'gi://Clutter';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import type {
    PanelGroupView,
    PanelGroupWidget,
    PanelWidgetFactory,
} from './panel-view.js';

class ShellGroupWidget implements PanelGroupWidget {
    readonly #button: PanelMenu.Button;
    readonly #menu: PopupMenu.PopupMenu;
    readonly #name: St.Label;
    readonly #values: St.BoxLayout;
    readonly #warning: St.Icon;
    #entityRows: {
        id: string;
        lastUpdate: St.Label;
        value: St.Label;
    }[] = [];

    #warningItem: PopupMenu.PopupImageMenuItem | null = null;
    #valueLabels: St.Label[] = [];

    constructor(view: PanelGroupView, position: number) {
        this.#button = new PanelMenu.Button(0.5, view.accessibleName);
        this.#menu = this.#button.menu as PopupMenu.PopupMenu;
        const content = new St.BoxLayout({
            style: 'font-size: 0.9em; spacing: 4px;',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.#name = new St.Label({ y_align: Clutter.ActorAlign.CENTER });
        this.#name.opacity = 160;
        this.#warning = new St.Icon({
            icon_name: 'dialog-warning-symbolic',
            icon_size: 16,
            style: 'color: #f6d32d;',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.#values = new St.BoxLayout({
            style: 'spacing: 6px;',
            y_align: Clutter.ActorAlign.CENTER,
        });
        content.add_child(this.#name);
        content.add_child(this.#warning);
        content.add_child(this.#values);
        this.#button.add_child(content);
        Main.panel.addToStatusArea(`peekhassio-${view.id}`, this.#button, position, 'right');
        this.update(view);
    }

    update(view: PanelGroupView): void {
        this.#name.text = view.name;
        while (this.#valueLabels.length > view.values.length)
            this.#valueLabels.pop()!.destroy();
        while (this.#valueLabels.length < view.values.length) {
            const label = new St.Label({ y_align: Clutter.ActorAlign.CENTER });
            this.#valueLabels.push(label);
            this.#values.add_child(label);
        }
        view.values.forEach((value, index) => {
            this.#valueLabels[index]!.text = value;
        });
        this.#warning.visible = view.degraded;
        this.#button.set_accessible_name(view.accessibleName);
        this.#updateMenu(view);
    }

    #updateMenu(view: PanelGroupView): void {
        const ids = view.entities.map(entity => entity.id);
        if (ids.length !== this.#entityRows.length
            || ids.some((id, index) => id !== this.#entityRows[index]?.id))
            this.#rebuildMenu(view);
        this.#warningItem!.visible = view.warning !== null;
        this.#warningItem!.label.text = view.warning ?? '';
        view.entities.forEach((entity, index) => {
            const row = this.#entityRows[index]!;
            row.value.text = entity.value;
            row.lastUpdate.text = `Last update: ${entity.lastUpdate}`;
        });
    }

    #rebuildMenu(view: PanelGroupView): void {
        this.#menu.removeAll();
        this.#entityRows = [];
        this.#warningItem = new PopupMenu.PopupImageMenuItem(
            '',
            'dialog-warning-symbolic',
            {
                reactive: false,
                activate: false,
                hover: false,
                style_class: null,
                can_focus: false,
            },
        );
        this.#warningItem.label.style = 'color: #f6d32d;';
        this.#menu.addMenuItem(this.#warningItem);
        const emptyItem = new PopupMenu.PopupMenuItem('No entities configured', {
            reactive: false,
            can_focus: false,
        });
        emptyItem.visible = view.entities.length === 0;
        this.#menu.addMenuItem(emptyItem);
        view.entities.forEach((entity) => {
            const item = new PopupMenu.PopupBaseMenuItem({ reactive: false, can_focus: false });
            const details = new St.BoxLayout({ vertical: true, x_expand: true });
            const current = new St.BoxLayout({ x_expand: true });
            const id = new St.Label({ text: entity.id, x_expand: true });
            const value = new St.Label();
            const lastUpdate = new St.Label();
            lastUpdate.opacity = 160;
            current.add_child(id);
            current.add_child(value);
            details.add_child(current);
            details.add_child(lastUpdate);
            item.add_child(details);
            this.#menu.addMenuItem(item);
            this.#entityRows.push({ id: entity.id, lastUpdate, value });
        });
    }

    destroy(): void {
        this.#button.destroy();
    }
}

export class ShellPanelWidgetFactory implements PanelWidgetFactory {
    create(view: PanelGroupView, position: number): PanelGroupWidget {
        return new ShellGroupWidget(view, position);
    }
}
