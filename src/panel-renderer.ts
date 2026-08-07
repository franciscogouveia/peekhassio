import Clutter from 'gi://Clutter';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';

import type {
    PanelGroupView,
    PanelGroupWidget,
    PanelWidgetFactory,
} from './panel-view.js';

class ShellGroupWidget implements PanelGroupWidget {
    readonly #button: PanelMenu.Button;
    readonly #name: St.Label;
    readonly #values: St.Label;
    readonly #warning: St.Icon;

    constructor(view: PanelGroupView, position: number) {
        this.#button = new PanelMenu.Button(0.5, view.accessibleName, true);
        const content = new St.BoxLayout({
            style: 'spacing: 4px;',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.#name = new St.Label({ y_align: Clutter.ActorAlign.CENTER });
        this.#warning = new St.Icon({
            icon_name: 'dialog-warning-symbolic',
            icon_size: 16,
            style: 'color: #f6d32d;',
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.#values = new St.Label({ y_align: Clutter.ActorAlign.CENTER });
        content.add_child(this.#name);
        content.add_child(this.#warning);
        content.add_child(this.#values);
        this.#button.add_child(content);
        Main.panel.addToStatusArea(`peekhassio-${view.id}`, this.#button, position, 'right');
        this.update(view);
    }

    update(view: PanelGroupView): void {
        this.#name.text = view.name;
        this.#values.text = view.values;
        this.#warning.visible = view.degraded;
        this.#button.set_accessible_name(view.accessibleName);
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
