import Clutter from 'gi://Clutter';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import {
    runPanelAction,
    type PanelGroupWidget,
    type PanelWidgetFactory,
} from './panel-controller.js';
import type { PanelGroupViewModel } from './panel-view-model.js';

export interface ShellPanelActions {
    openDashboard(url: string): void;
    openSettings(): void;
}

interface ShellGroupViewContext {
    actionError: PopupMenu.PopupMenuItem | null;
    button: PanelMenu.Button;
    dashboardUrl: string;
    entityRows: {
        id: string;
        lastUpdate: St.Label;
        value: St.Label;
    }[];
    menu: PopupMenu.PopupMenu;
    name: St.Label;
    valueLabels: St.Label[];
    values: St.BoxLayout;
    warning: St.Icon;
    warningDescription: St.Label | null;
    warningItem: PopupMenu.PopupBaseMenuItem | null;
    warningTitle: St.Label | null;
}

class ShellGroupWidget implements PanelGroupWidget {
    readonly #actions: ShellPanelActions;
    #context: ShellGroupViewContext | null;

    constructor(view: PanelGroupViewModel, position: number, actions: ShellPanelActions) {
        this.#actions = actions;
        const button = new PanelMenu.Button(0.5, view.accessibleName);
        const content = new St.BoxLayout({
            style: 'font-size: 0.9em; spacing: 4px;',
            y_align: Clutter.ActorAlign.CENTER,
        });
        const name = new St.Label({ y_align: Clutter.ActorAlign.CENTER });
        name.opacity = 160;
        const warning = new St.Icon({
            icon_name: 'dialog-warning-symbolic',
            icon_size: 16,
            style: 'color: #f6d32d;',
            y_align: Clutter.ActorAlign.CENTER,
        });
        const values = new St.BoxLayout({
            style: 'spacing: 6px;',
            y_align: Clutter.ActorAlign.CENTER,
        });
        content.add_child(name);
        content.add_child(warning);
        content.add_child(values);
        button.add_child(content);
        this.#context = {
            actionError: null,
            button,
            dashboardUrl: '',
            entityRows: [],
            menu: button.menu as PopupMenu.PopupMenu,
            name,
            valueLabels: [],
            values,
            warning,
            warningDescription: null,
            warningItem: null,
            warningTitle: null,
        };
        Main.panel.addToStatusArea(`peekhassio-${view.id}`, button, position, 'right');
        this.update(view);
    }

    #activeContext(): ShellGroupViewContext {
        if (this.#context === null)
            throw new Error('Panel group widget is destroyed.');
        return this.#context;
    }

    update(view: PanelGroupViewModel): void {
        const context = this.#activeContext();
        context.dashboardUrl = view.dashboardUrl;
        context.name.text = view.name;
        while (context.valueLabels.length > view.values.length)
            context.valueLabels.pop()!.destroy();
        while (context.valueLabels.length < view.values.length) {
            const label = new St.Label({ y_align: Clutter.ActorAlign.CENTER });
            context.valueLabels.push(label);
            context.values.add_child(label);
        }
        view.values.forEach((value, index) => {
            context.valueLabels[index]!.text = value;
        });
        context.warning.visible = view.degraded;
        context.button.set_accessible_name(view.accessibleName);
        this.#updateMenu(view);
    }

    #updateMenu(view: PanelGroupViewModel): void {
        const context = this.#activeContext();
        const ids = view.entities.map(entity => entity.id);
        if (context.warningItem === null || ids.length !== context.entityRows.length
            || ids.some((id, index) => id !== context.entityRows[index]?.id))
            this.#rebuildMenu(view);
        context.warningItem!.visible = view.warning !== null;
        context.warningTitle!.text = view.warning?.title ?? '';
        context.warningDescription!.text = view.warning?.description ?? '';
        context.warningDescription!.visible = view.warning?.description !== undefined;
        view.entities.forEach((entity, index) => {
            const row = context.entityRows[index]!;
            row.value.text = entity.value;
            row.lastUpdate.text = `Last update: ${entity.lastUpdate}`;
        });
    }

    #rebuildMenu(view: PanelGroupViewModel): void {
        const context = this.#activeContext();
        context.menu.removeAll();
        context.entityRows = [];
        context.warningItem = new PopupMenu.PopupBaseMenuItem({ reactive: false, can_focus: false });
        const warningIcon = new St.Icon({
            icon_name: 'dialog-warning-symbolic',
            style: 'color: #f6d32d;',
            y_align: Clutter.ActorAlign.START,
        });
        const warningText = new St.BoxLayout({ vertical: true });
        context.warningTitle = new St.Label({ style: 'color: #f6d32d;' });
        context.warningDescription = new St.Label();
        warningText.add_child(context.warningTitle);
        warningText.add_child(context.warningDescription);
        context.warningItem.add_child(warningIcon);
        context.warningItem.add_child(warningText);
        context.menu.addMenuItem(context.warningItem);
        const emptyItem = new PopupMenu.PopupMenuItem('No entities configured', {
            reactive: false,
            can_focus: false,
        });
        emptyItem.visible = view.entities.length === 0;
        context.menu.addMenuItem(emptyItem);
        view.entities.forEach((entity) => {
            const item = new PopupMenu.PopupBaseMenuItem({ reactive: false, can_focus: false });
            const details = new St.BoxLayout({ vertical: true, x_expand: true });
            const current = new St.BoxLayout({ style: 'spacing: 12px;', x_expand: true });
            const id = new St.Label({ text: entity.id, x_expand: true });
            const value = new St.Label();
            const lastUpdate = new St.Label();
            lastUpdate.opacity = 160;
            current.add_child(id);
            current.add_child(value);
            details.add_child(current);
            details.add_child(lastUpdate);
            item.add_child(details);
            context.menu.addMenuItem(item);
            context.entityRows.push({ id: entity.id, lastUpdate, value });
        });
        context.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        const actionItem = new PopupMenu.PopupBaseMenuItem({ reactive: false, can_focus: false });
        const actions = new St.BoxLayout({ style: 'spacing: 8px;', x_align: Clutter.ActorAlign.CENTER, x_expand: true });
        const dashboard = this.#actionButton('view-grid-symbolic', 'Dashboard');
        const settings = this.#actionButton('preferences-system-symbolic', 'Settings');
        dashboard.connect('clicked', () => this.#runAction(
            () => this.#actions.openDashboard(context.dashboardUrl),
            'Could not open the Home Assistant dashboard.',
        ));
        settings.connect('clicked', () => this.#runAction(
            () => this.#actions.openSettings(),
            'Could not open Peekhassio settings.',
        ));
        actions.add_child(dashboard);
        actions.add_child(settings);
        actionItem.add_child(actions);
        context.menu.addMenuItem(actionItem);
        context.actionError = new PopupMenu.PopupMenuItem('', { reactive: false, can_focus: false });
        context.actionError.style = 'color: #f6d32d;';
        context.actionError.visible = false;
        context.menu.addMenuItem(context.actionError);
    }

    #actionButton(iconName: string, accessibleName: string): St.Button {
        const button = new St.Button({
            accessible_name: accessibleName,
            can_focus: true,
            child: new St.Icon({ icon_name: iconName, icon_size: 16 }),
            style_class: 'button',
        });
        return button;
    }

    #runAction(action: () => void, failureMessage: string): void {
        const context = this.#activeContext();
        context.actionError!.visible = false;
        runPanelAction(
            action,
            () => context.menu.close(),
            failureMessage,
            (message) => {
                console.error(`Peekhassio panel action failed: ${message}`);
                context.actionError!.label.text = message;
                context.actionError!.visible = true;
            },
            () => console.error('Peekhassio could not report a panel action failure.'),
        );
    }

    destroy(): void {
        const context = this.#context;
        this.#context = null;
        context?.button.destroy();
    }
}

export class ShellPanelWidgetFactory implements PanelWidgetFactory {
    readonly #actions: ShellPanelActions;

    constructor(actions: ShellPanelActions) {
        this.#actions = actions;
    }

    create(view: PanelGroupViewModel, position: number): PanelGroupWidget {
        return new ShellGroupWidget(view, position, this.#actions);
    }
}
