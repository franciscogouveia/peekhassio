import GLib from 'gi://GLib';

export const CONFIGURATION_KEY = 'configuration-json';
export const CREDENTIAL_REVISION_KEY = 'credential-revision';
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

export interface RevisionSettings {
    get_uint(key: string): number;
    set_uint(key: string, value: number): boolean;
}

export function incrementCredentialRevision(settings: RevisionSettings): void {
    const revision = settings.get_uint(CREDENTIAL_REVISION_KEY);
    if (!settings.set_uint(CREDENTIAL_REVISION_KEY, (revision + 1) >>> 0))
        throw new Error('Could not notify the extension about the credential change.');
}

export function invariant(condition: boolean, message: string): asserts condition {
    if (!condition)
        throw new Error(`Invalid configuration: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isHttpBaseUrl(value: string): boolean {
    try {
        const uri = GLib.Uri.parse(value, GLib.UriFlags.NONE);
        return ['http', 'https'].includes(uri.get_scheme())
            && uri.get_host() !== null && uri.get_query() === null && uri.get_fragment() === null;
    }
    catch {
        return false;
    }
}

export function isDashboardPath(value: string): boolean {
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
