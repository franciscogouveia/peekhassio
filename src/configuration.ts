export const CONFIGURATION_KEY = 'configuration-json';
export const CONFIGURATION_VERSION = 1 as const;

export interface EntityConfiguration {
    entityId: string;
    unitOverride?: string;
}

export interface GroupConfiguration {
    id: string;
    instanceId: string;
    name: string;
    dashboardPath: string;
    entities: EntityConfiguration[];
}

export interface InstanceConfiguration {
    id: string;
    name: string;
    baseUrl: string;
}

export interface ConfigurationV1 {
    version: typeof CONFIGURATION_VERSION;
    instances: InstanceConfiguration[];
    groups: GroupConfiguration[];
}

export interface StringSettings {
    get_string(key: string): string;
    set_string(key: string, value: string): boolean;
}

function invariant(condition: boolean, message: string): asserts condition {
    if (!condition)
        throw new Error(`Invalid configuration: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isHttpBaseUrl(value: string): boolean {
    return /^https?:\/\/[^/?#\s]+(?:\/[^?#\s]*)?$/.test(value);
}

function isDashboardPath(value: string): boolean {
    return /^\/(?!\/)[^\s]*$/.test(value);
}

function requireText(value: unknown, path: string): asserts value is string {
    invariant(typeof value === 'string' && value.trim() !== '', `${path} must be a non-empty string`);
}

export function parseConfigurationValue(value: unknown): ConfigurationV1 {
    invariant(isRecord(value), 'root must be an object');
    invariant(value.version === CONFIGURATION_VERSION, `version must be ${CONFIGURATION_VERSION}`);
    invariant(Array.isArray(value.instances), 'instances must be an array');
    invariant(Array.isArray(value.groups), 'groups must be an array');

    const instanceIds = new Set<string>();
    for (const [index, instance] of value.instances.entries()) {
        invariant(isRecord(instance), `instances[${index}] must be an object`);
        requireText(instance.id, `instances[${index}].id`);
        requireText(instance.name, `instances[${index}].name`);
        requireText(instance.baseUrl, `instances[${index}].baseUrl`);
        invariant(isHttpBaseUrl(instance.baseUrl), `instances[${index}].baseUrl must be an HTTP(S) base URL without a query or fragment`);
        invariant(!('token' in instance), `instances[${index}] must not store a token`);
        invariant(!instanceIds.has(instance.id), `instance id ${instance.id} must be unique`);
        instanceIds.add(instance.id);
    }

    const groupIds = new Set<string>();
    for (const [groupIndex, group] of value.groups.entries()) {
        invariant(isRecord(group), `groups[${groupIndex}] must be an object`);
        requireText(group.id, `groups[${groupIndex}].id`);
        requireText(group.instanceId, `groups[${groupIndex}].instanceId`);
        requireText(group.name, `groups[${groupIndex}].name`);
        requireText(group.dashboardPath, `groups[${groupIndex}].dashboardPath`);
        invariant(instanceIds.has(group.instanceId), `groups[${groupIndex}].instanceId must reference an instance`);
        invariant(isDashboardPath(group.dashboardPath), `groups[${groupIndex}].dashboardPath must start with one slash`);
        invariant(!groupIds.has(group.id), `group id ${group.id} must be unique`);
        invariant(Array.isArray(group.entities), `groups[${groupIndex}].entities must be an array`);
        groupIds.add(group.id);

        for (const [entityIndex, entity] of group.entities.entries()) {
            const path = `groups[${groupIndex}].entities[${entityIndex}]`;
            invariant(isRecord(entity), `${path} must be an object`);
            requireText(entity.entityId, `${path}.entityId`);
            invariant(/^[a-z0-9_]+\.[a-z0-9_]+$/.test(entity.entityId), `${path}.entityId must use domain.object_id`);
            if ('unitOverride' in entity)
                requireText(entity.unitOverride, `${path}.unitOverride`);
        }
    }

    return value as unknown as ConfigurationV1;
}

export function parseConfigurationJson(json: string): ConfigurationV1 {
    let value: unknown;
    try {
        value = JSON.parse(json);
    }
    catch {
        throw new Error('Invalid configuration: value must be valid JSON');
    }
    return parseConfigurationValue(value);
}

export function serializeConfiguration(configuration: ConfigurationV1): string {
    return JSON.stringify(parseConfigurationValue(configuration));
}

export function createDefaultConfiguration(): ConfigurationV1 {
    return { version: CONFIGURATION_VERSION, instances: [], groups: [] };
}

export function buildDashboardUrl(instance: InstanceConfiguration, group: GroupConfiguration): string {
    invariant(isHttpBaseUrl(instance.baseUrl), 'instance baseUrl must be an HTTP(S) base URL without a query or fragment');
    invariant(isDashboardPath(group.dashboardPath), 'group dashboardPath must start with one slash');
    return `${instance.baseUrl.replace(/\/+$/, '')}${group.dashboardPath}`;
}

export class ConfigurationStore {
    readonly #settings: StringSettings;

    constructor(settings: StringSettings) {
        this.#settings = settings;
    }

    load(): ConfigurationV1 {
        return parseConfigurationJson(this.#settings.get_string(CONFIGURATION_KEY));
    }

    save(configuration: ConfigurationV1): void {
        const saved = this.#settings.set_string(CONFIGURATION_KEY, serializeConfiguration(configuration));
        invariant(saved, 'settings backend rejected the update');
    }
}
