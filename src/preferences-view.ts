import type { ConfigurationV1 } from './configuration.js';

export interface InstanceRowView {
    id: string;
    title: string;
    subtitle: string;
}

export interface GroupRowView extends InstanceRowView {
    canMoveUp: boolean;
    canMoveDown: boolean;
}

export interface PreferencesView {
    canAddGroup: boolean;
    instanceRows: InstanceRowView[];
    groupRows: GroupRowView[];
}

export interface EntityRowView extends InstanceRowView {
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

export function buildPreferencesView(configuration: ConfigurationV1): PreferencesView {
    const instanceNames = new Map(configuration.instances
        .map(instance => [instance.id, instance.name]));

    return {
        canAddGroup: configuration.instances.length > 0,
        instanceRows: configuration.instances.map(instance => ({
            id: instance.id,
            title: instance.name,
            subtitle: instance.baseUrl,
        })),
        groupRows: configuration.groups.map((group, index) => ({
            id: group.id,
            title: group.name,
            subtitle: `${instanceNames.get(group.instanceId)!} · ${group.dashboardPath}`,
            canMoveUp: index > 0,
            canMoveDown: index < configuration.groups.length - 1,
        })),
    };
}
