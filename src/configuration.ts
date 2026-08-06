import GLib from 'gi://GLib';

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
    try {
        const uri = GLib.Uri.parse(value, GLib.UriFlags.NONE);
        return ['http', 'https'].includes(uri.get_scheme())
            && uri.get_host() !== null && uri.get_query() === null && uri.get_fragment() === null;
    }
    catch {
        return false;
    }
}

function isDashboardPath(value: string): boolean {
    if (!value.startsWith('/') || value.startsWith('//'))
        return false;

    try {
        GLib.Uri.resolve_relative('https://example.invalid', value, GLib.UriFlags.NONE);
        return true;
    }
    catch {
        return false;
    }
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
    value.instances.forEach((instance, index) => {
        invariant(isRecord(instance), `instances[${index}] must be an object`);
        requireText(instance.id, `instances[${index}].id`);
        requireText(instance.name, `instances[${index}].name`);
        requireText(instance.baseUrl, `instances[${index}].baseUrl`);
        invariant(isHttpBaseUrl(instance.baseUrl), `instances[${index}].baseUrl must be an HTTP(S) base URL without a query or fragment`);
        invariant(!('token' in instance), `instances[${index}] must not store a token`);
        invariant(!instanceIds.has(instance.id), `instance id ${instance.id} must be unique`);
        instanceIds.add(instance.id);
    });

    const groupIds = new Set<string>();
    value.groups.forEach((group, groupIndex) => {
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

        const entityIds = new Set<string>();
        group.entities.forEach((entity, entityIndex) => {
            const path = `groups[${groupIndex}].entities[${entityIndex}]`;
            invariant(isRecord(entity), `${path} must be an object`);
            requireText(entity.entityId, `${path}.entityId`);
            invariant(/^[a-z0-9_]+\.[a-z0-9_]+$/.test(entity.entityId), `${path}.entityId must use domain.object_id`);
            invariant(!entityIds.has(entity.entityId), `${path}.entityId must be unique within its group`);
            entityIds.add(entity.entityId);
            if ('unitOverride' in entity)
                requireText(entity.unitOverride, `${path}.unitOverride`);
        });
    });

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

export function upsertEntity(
    configuration: ConfigurationV1,
    groupId: string,
    previousEntityId: string | null,
    entity: EntityConfiguration,
): ConfigurationV1 {
    const group = configuration.groups.find(candidate => candidate.id === groupId);
    invariant(group !== undefined, `group id ${groupId} must exist`);
    const existingIndex = previousEntityId === null
        ? -1
        : group.entities.findIndex(candidate => candidate.entityId === previousEntityId);
    invariant(previousEntityId === null || existingIndex !== -1, `entity id ${previousEntityId} must exist`);
    invariant(!group.entities.some((candidate, index) =>
        candidate.entityId === entity.entityId && index !== existingIndex),
    `entity id ${entity.entityId} must be unique within its group`);
    const normalized = entity.unitOverride?.trim()
        ? { ...entity, unitOverride: entity.unitOverride.trim() }
        : { entityId: entity.entityId };
    const entities = existingIndex === -1
        ? [...group.entities, normalized]
        : group.entities.map((candidate, index) => index === existingIndex ? normalized : candidate);
    return upsertGroup(configuration, { ...group, entities });
}

export function removeEntity(configuration: ConfigurationV1, groupId: string, entityId: string): ConfigurationV1 {
    const group = configuration.groups.find(candidate => candidate.id === groupId);
    invariant(group !== undefined, `group id ${groupId} must exist`);
    invariant(group.entities.some(entity => entity.entityId === entityId), `entity id ${entityId} must exist`);
    return upsertGroup(configuration, {
        ...group,
        entities: group.entities.filter(entity => entity.entityId !== entityId),
    });
}

export function moveEntity(
    configuration: ConfigurationV1,
    groupId: string,
    entityId: string,
    direction: -1 | 1,
): ConfigurationV1 {
    const group = configuration.groups.find(candidate => candidate.id === groupId);
    invariant(group !== undefined, `group id ${groupId} must exist`);
    const currentIndex = group.entities.findIndex(entity => entity.entityId === entityId);
    invariant(currentIndex !== -1, `entity id ${entityId} must exist`);
    const targetIndex = currentIndex + direction;
    invariant(targetIndex >= 0 && targetIndex < group.entities.length, `entity id ${entityId} cannot move further`);
    const entities = [...group.entities];
    [entities[currentIndex], entities[targetIndex]] = [entities[targetIndex]!, entities[currentIndex]!];
    return upsertGroup(configuration, { ...group, entities });
}

export function buildDashboardUrl(instance: InstanceConfiguration, group: GroupConfiguration): string {
    invariant(isHttpBaseUrl(instance.baseUrl), 'instance baseUrl must be an HTTP(S) base URL without a query or fragment');
    invariant(isDashboardPath(group.dashboardPath), 'group dashboardPath must start with one slash');
    return GLib.Uri.resolve_relative(instance.baseUrl, group.dashboardPath, GLib.UriFlags.NONE);
}

export function buildWebSocketUrl(instance: InstanceConfiguration): string {
    invariant(isHttpBaseUrl(instance.baseUrl), 'instance baseUrl must be an HTTP(S) base URL without a query or fragment');
    const httpUrl = GLib.Uri.resolve_relative(instance.baseUrl, '/api/websocket', GLib.UriFlags.NONE);
    return httpUrl.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
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
