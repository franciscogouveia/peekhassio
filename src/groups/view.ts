import type { ConfigurationV1 } from '../shared/configuration.js';

export interface GroupRowView {
    id: string;
    title: string;
    subtitle: string;
    canMoveUp: boolean;
    canMoveDown: boolean;
}

export interface GroupView {
    canAddGroup: boolean;
    rows: GroupRowView[];
}

export function buildGroupView(configuration: ConfigurationV1): GroupView {
    const instanceNames = new Map(configuration.instances
        .map(instance => [instance.id, instance.name]));
    return {
        canAddGroup: configuration.instances.length > 0,
        rows: configuration.groups.map((group, index) => ({
            id: group.id,
            title: group.name,
            subtitle: `${instanceNames.get(group.instanceId)!} · ${group.dashboardPath}`,
            canMoveUp: index > 0,
            canMoveDown: index < configuration.groups.length - 1,
        })),
    };
}
