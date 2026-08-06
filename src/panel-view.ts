import type { EntityState } from './entity-state-client.js';
import type { RuntimeGroupState } from './runtime-coordinator.js';

export interface PanelGroupView {
    id: string;
    label: string;
    accessibleName: string;
    degraded: boolean;
}

export interface PanelGroupWidget {
    update(view: PanelGroupView): void;
    destroy(): void;
}

export interface PanelWidgetFactory {
    create(view: PanelGroupView, position: number): PanelGroupWidget;
}

function displayValue(state: EntityState): string {
    switch (state.availability) {
        case 'available':
            return `${state.value!}${state.unit ?? ''}`;
        case 'unknown':
            return '?';
        case 'unavailable':
            return 'Unavailable';
        case 'missing':
            return '—';
    }
}

function accessibleValue(state: EntityState): string {
    const value = state.availability === 'available'
        ? `${state.value!}${state.unit ? ` ${state.unit}` : ''}`
        : state.availability;
    return `${state.entityId}: ${value}`;
}

export function buildPanelGroupViews(groups: RuntimeGroupState[]): PanelGroupView[] {
    return groups.map(group => ({
        id: group.id,
        label: [group.name, ...group.entities.map(displayValue)].join(' '),
        accessibleName: group.entities.length === 0
            ? `${group.name}: no entities`
            : `${group.name}: ${group.entities.map(accessibleValue).join(', ')}`,
        degraded: group.entities.some(entity => entity.availability !== 'available'),
    }));
}

export class PanelViewController {
    readonly #factory: PanelWidgetFactory;
    #ids: string[] = [];
    #widgets: PanelGroupWidget[] = [];

    constructor(factory: PanelWidgetFactory) {
        this.#factory = factory;
    }

    render(groups: RuntimeGroupState[]): void {
        const views = buildPanelGroupViews(groups);
        const ids = views.map(view => view.id);
        if (ids.length !== this.#ids.length || ids.some((id, index) => id !== this.#ids[index])) {
            this.destroy();
            this.#ids = ids;
            this.#widgets = views.map((view, index) => this.#factory.create(view, index));
            return;
        }
        views.forEach((view, index) => this.#widgets[index]!.update(view));
    }

    destroy(): void {
        this.#widgets.forEach(widget => widget.destroy());
        this.#widgets = [];
        this.#ids = [];
    }
}
