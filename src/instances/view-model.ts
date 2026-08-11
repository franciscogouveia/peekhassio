import type { ConfigurationV1 } from '../shared/configuration.js';

export interface InstanceRowViewModel {
    id: string;
    title: string;
    subtitle: string;
}

export function buildInstanceRowViewModels(configuration: ConfigurationV1): InstanceRowViewModel[] {
    return configuration.instances.map(instance => ({
        id: instance.id,
        title: instance.name,
        subtitle: instance.baseUrl,
    }));
}
