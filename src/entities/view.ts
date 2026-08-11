import type { ConfigurationV1 } from '../shared/configuration.js';

export interface EntityRowView {
    id: string;
    title: string;
    subtitle: string;
    canMoveUp: boolean;
    canMoveDown: boolean;
}

export function buildEntityRows(configuration: ConfigurationV1, groupId: string): EntityRowView[] {
    const group = configuration.groups.find(candidate => candidate.id === groupId);
    if (!group)
        throw new Error(`Invalid configuration: group id ${groupId} must exist`);
    return group.entities.map((entity, index) => ({
        id: entity.entityId,
        title: entity.entityId,
        subtitle: entity.unitOverride ?? 'Uses Home Assistant unit',
        canMoveUp: index > 0,
        canMoveDown: index < group.entities.length - 1,
    }));
}
