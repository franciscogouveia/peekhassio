import GLib from 'gi://GLib';

import {
    type ConfigurationV1,
    type InstanceConfiguration,
    invariant,
    isHttpBaseUrl,
    parseConfigurationValue,
} from '../shared/configuration.js';

export function upsertInstance(configuration: ConfigurationV1, instance: InstanceConfiguration): ConfigurationV1 {
    const existingIndex = configuration.instances.findIndex(candidate => candidate.id === instance.id);
    const instances = existingIndex === -1
        ? [...configuration.instances, instance]
        : configuration.instances.map(candidate => candidate.id === instance.id ? instance : candidate);
    return parseConfigurationValue({ ...configuration, instances });
}

export function removeInstance(configuration: ConfigurationV1, instanceId: string): ConfigurationV1 {
    invariant(configuration.instances.some(instance => instance.id === instanceId), `instance id ${instanceId} must exist`);
    invariant(!configuration.groups.some(group => group.instanceId === instanceId), `instance id ${instanceId} must not be referenced by a group`);
    return parseConfigurationValue({
        ...configuration,
        instances: configuration.instances.filter(instance => instance.id !== instanceId),
    });
}

export function buildWebSocketUrl(instance: InstanceConfiguration): string {
    invariant(isHttpBaseUrl(instance.baseUrl), 'instance baseUrl must be an HTTP(S) base URL without a query or fragment');
    const httpUrl = GLib.Uri.resolve_relative(instance.baseUrl, '/api/websocket', GLib.UriFlags.NONE);
    return httpUrl.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
}
