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
    readonly #values: St.BoxLayout;
    readonly #warning: St.Icon;
    #valueLabels: St.Label[] = [];

    constructor(view: PanelGroupView, position: number) {
        this.#button = new PanelMenu.Button(0.5, view.accessibleName, true);
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
