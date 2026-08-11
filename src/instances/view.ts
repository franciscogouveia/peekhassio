import type { ConfigurationV1 } from '../shared/configuration.js';

export interface InstanceRowView {
    id: string;
    title: string;
    subtitle: string;
}

export function buildInstanceRows(configuration: ConfigurationV1): InstanceRowView[] {
    return configuration.instances.map(instance => ({
        id: instance.id,
        title: instance.name,
        subtitle: instance.baseUrl,
    }));
}
