import type { EntityState } from './entity-state-client.js';
import type { RuntimeGroupState } from './runtime-coordinator.js';

export interface PanelGroupView {
    id: string;
    name: string;
    values: string[];
    warning: string | null;
    entities: PanelEntityView[];
    accessibleName: string;
    degraded: boolean;
}

export interface PanelEntityView {
    id: string;
    value: string;
    lastUpdate: string;
}

function displayStatus(status: RuntimeGroupState['status']): string | null {
    switch (status) {
        case 'connecting': return 'Connecting…';
        case 'stale': return 'Stale';
        case 'authentication-failed': return 'Authentication required';
        case 'ready': return null;
    }
}

function displayWarning(group: RuntimeGroupState): string | null {
    switch (group.status) {
        case 'connecting': return 'Connecting to Home Assistant.';
        case 'stale': return 'Home Assistant is unreachable. Showing last known values.';
        case 'authentication-failed':
            return 'Authentication required. Set the instance token in Peekhassio settings.';
        case 'ready':
            return group.entities.some(entity => entity.availability !== 'available')
                ? 'One or more entities are unavailable.'
                : null;
    }
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
        case 'unavailable':
        case 'missing':
            return 'N/A';
    }
}

function accessibleValue(state: EntityState): string {
    const value = state.availability === 'available'
        ? `${state.value!}${state.unit ? ` ${state.unit}` : ''}`
        : state.availability;
    return `${state.entityId}: ${value}`;
}

export function buildPanelGroupViews(
    groups: RuntimeGroupState[],
    formatTime = (receivedAt: number): string => new Date(receivedAt).toLocaleString(),
): PanelGroupView[] {
    return groups.map((group) => {
        const status = displayStatus(group.status);
        const values = group.entities.length === 0
            ? 'no entities'
            : group.entities.map(accessibleValue).join(', ');
        return {
            id: group.id,
            name: group.name,
            values: group.entities.map(displayValue),
            warning: displayWarning(group),
            entities: group.entities.map(entity => ({
                id: entity.entityId,
                value: displayValue(entity),
                lastUpdate: entity.receivedAt === undefined ? 'N/A' : formatTime(entity.receivedAt),
            })),
            accessibleName: `${group.name}: ${values}${status ? `; status: ${status}` : ''}`,
            degraded: group.status !== 'ready'
                || group.entities.some(entity => entity.availability !== 'available'),
        };
    });
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
