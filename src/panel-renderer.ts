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
    readonly #label: St.Label;

    constructor(view: PanelGroupView, position: number) {
        this.#button = new PanelMenu.Button(0.5, view.accessibleName, true);
        this.#label = new St.Label();
        this.#button.add_child(this.#label);
        Main.panel.addToStatusArea(`peekhassio-${view.id}`, this.#button, position, 'right');
        this.update(view);
    }

    update(view: PanelGroupView): void {
        this.#label.text = view.label;
        this.#label.opacity = view.degraded ? 160 : 255;
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
