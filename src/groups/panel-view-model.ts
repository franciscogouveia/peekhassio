import type { EntityState } from '../entities/state-client.js';
import type { RuntimeGroupState } from '../runtime/coordinator.js';

export interface PanelGroupViewModel {
    dashboardUrl: string;
    id: string;
    name: string;
    values: string[];
    warning: PanelWarningViewModel | null;
    entities: PanelEntityViewModel[];
    accessibleName: string;
    degraded: boolean;
}

export interface PanelWarningViewModel {
    title: string;
    description?: string;
}

export interface PanelEntityViewModel {
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

function displayWarning(group: RuntimeGroupState): PanelWarningViewModel | null {
    switch (group.status) {
        case 'connecting':
            return {
                title: 'Connecting',
                description: 'Waiting for Home Assistant to provide entity values.',
            };
        case 'stale':
            return {
                title: 'Disconnected',
                description: 'Home Assistant is unreachable. Showing last known values.',
            };
        case 'authentication-failed':
            return {
                title: 'Authentication required',
                description: 'Set the instance token in Peekhassio settings.',
            };
        case 'ready':
            return group.entities.some(entity => entity.availability !== 'available')
                ? {
                        title: 'Entity data unavailable',
                        description: 'Check the affected entities in Home Assistant and Peekhassio settings.',
                    }
                : null;
    }
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

export function buildPanelGroupViewModels(
    groups: RuntimeGroupState[],
    formatTime = (receivedAt: number): string => new Date(receivedAt).toLocaleString(),
): PanelGroupViewModel[] {
    return groups.map((group) => {
        const status = displayStatus(group.status);
        const values = group.entities.length === 0
            ? 'no entities'
            : group.entities.map(accessibleValue).join(', ');
        return {
            dashboardUrl: group.dashboardUrl,
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
