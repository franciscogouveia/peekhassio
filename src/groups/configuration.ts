import GLib from 'gi://GLib';

import {
    type ConfigurationV1,
    type GroupConfiguration,
    type InstanceConfiguration,
    invariant,
    isDashboardPath,
    isHttpBaseUrl,
    parseConfigurationValue,
} from '../shared/configuration.js';

export function upsertGroup(configuration: ConfigurationV1, group: GroupConfiguration): ConfigurationV1 {
    const existingIndex = configuration.groups.findIndex(candidate => candidate.id === group.id);
    const groups = existingIndex === -1
        ? [...configuration.groups, group]
        : configuration.groups.map(candidate => candidate.id === group.id ? group : candidate);
    return parseConfigurationValue({ ...configuration, groups });
}

export function removeGroup(configuration: ConfigurationV1, groupId: string): ConfigurationV1 {
    invariant(configuration.groups.some(group => group.id === groupId), `group id ${groupId} must exist`);
    return parseConfigurationValue({
        ...configuration,
        groups: configuration.groups.filter(group => group.id !== groupId),
    });
}

export function moveGroup(configuration: ConfigurationV1, groupId: string, direction: -1 | 1): ConfigurationV1 {
    const currentIndex = configuration.groups.findIndex(group => group.id === groupId);
    invariant(currentIndex !== -1, `group id ${groupId} must exist`);
    const targetIndex = currentIndex + direction;
    invariant(targetIndex >= 0 && targetIndex < configuration.groups.length, `group id ${groupId} cannot move further`);
    const groups = [...configuration.groups];
    const currentGroup = groups[currentIndex]!;
    groups[currentIndex] = groups[targetIndex]!;
    groups[targetIndex] = currentGroup;
    return parseConfigurationValue({ ...configuration, groups });
}

export function buildDashboardUrl(instance: InstanceConfiguration, group: GroupConfiguration): string {
    invariant(isHttpBaseUrl(instance.baseUrl), 'instance baseUrl must be an HTTP(S) base URL without a query or fragment');
    invariant(isDashboardPath(group.dashboardPath), 'group dashboardPath must start with one slash');
    return GLib.Uri.resolve_relative(instance.baseUrl, group.dashboardPath, GLib.UriFlags.NONE);
}
