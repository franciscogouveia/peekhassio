import assert from 'node:assert/strict';
import test from 'node:test';

import {
    CONFIGURATION_KEY,
    ConfigurationStore,
    buildDashboardUrl,
    createDefaultConfiguration,
    parseConfigurationJson,
    parseConfigurationValue,
    serializeConfiguration,
} from '../src/configuration.ts';

const validConfiguration = {
    version: 1,
    instances: [
        { id: 'home', name: 'Home', baseUrl: 'https://ha.example.com' },
        { id: 'cabin', name: 'Cabin', baseUrl: 'http://ha.local:8123' },
    ],
    groups: [
        {
            id: 'living-room',
            instanceId: 'home',
            name: 'Living room',
            dashboardPath: '/lovelace/living-room',
            entities: [
                { entityId: 'sensor.living_room_temperature', unitOverride: '°C' },
                { entityId: 'sensor.living_room_humidity' },
            ],
        },
    ],
};

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

test('round-trips a valid ordered configuration', () => {
    const serialized = serializeConfiguration(validConfiguration);
    const parsed = parseConfigurationJson(serialized);

    assert.deepEqual(parsed, validConfiguration);
    assert.equal(parsed.instances[1].id, 'cabin');
    assert.equal(parsed.groups[0].entities[1].entityId, 'sensor.living_room_humidity');
});

test('creates an empty versioned configuration', () => {
    const configuration = createDefaultConfiguration();

    assert.deepEqual(configuration, { version: 1, instances: [], groups: [] });
    assert.deepEqual(parseConfigurationValue(configuration), configuration);
});

test('loads and saves configuration through the settings boundary', () => {
    let stored = JSON.stringify(createDefaultConfiguration());
    const settings = {
        get_string(key) {
            assert.equal(key, CONFIGURATION_KEY);
            return stored;
        },
        set_string(key, value) {
            assert.equal(key, CONFIGURATION_KEY);
            stored = value;
            return true;
        },
    };
    const store = new ConfigurationStore(settings);

    assert.deepEqual(store.load(), createDefaultConfiguration());
    store.save(validConfiguration);
    assert.deepEqual(store.load(), validConfiguration);
});

test('reports invalid JSON and rejected settings updates', () => {
    assert.throws(() => parseConfigurationJson('{'), /value must be valid JSON/);

    const store = new ConfigurationStore({
        get_string: () => '{}',
        set_string: () => false,
    });
    assert.throws(() => store.save(validConfiguration), /settings backend rejected/);
});

test('builds a dashboard URL from its instance and group', () => {
    const group = validConfiguration.groups[0];

    assert.equal(buildDashboardUrl(validConfiguration.instances[0], group), 'https://ha.example.com/lovelace/living-room');
    assert.equal(
        buildDashboardUrl({ ...validConfiguration.instances[0], baseUrl: 'https://ha.example.com/' }, group),
        'https://ha.example.com/lovelace/living-room',
    );
});

const invalidCases = [
    ['non-object root', null, /root must be an object/],
    ['unsupported version', { ...validConfiguration, version: 2 }, /version must be 1/],
    ['non-array instances', { ...validConfiguration, instances: {} }, /instances must be an array/],
    ['non-array groups', { ...validConfiguration, groups: {} }, /groups must be an array/],
    ['non-object instance', { ...validConfiguration, instances: ['home'] }, /instances\[0\] must be an object/],
    ['blank instance name', { ...validConfiguration, instances: [{ id: 'home', name: '', baseUrl: 'https://ha.example.com' }] }, /name must be a non-empty string/],
    ['invalid instance URL', { ...validConfiguration, instances: [{ id: 'home', name: 'Home', baseUrl: 'not a url' }] }, /baseUrl must be an HTTP/],
    ['unsupported URL protocol', { ...validConfiguration, instances: [{ id: 'home', name: 'Home', baseUrl: 'ftp://ha.example.com' }] }, /baseUrl must be an HTTP/],
    ['base URL query', { ...validConfiguration, instances: [{ id: 'home', name: 'Home', baseUrl: 'https://ha.example.com?redirect=1' }] }, /baseUrl must be an HTTP/],
    ['stored token', { ...validConfiguration, instances: [{ ...validConfiguration.instances[0], token: 'secret' }] }, /must not store a token/],
    ['duplicate instance', { ...validConfiguration, instances: [validConfiguration.instances[0], validConfiguration.instances[0]] }, /instance id home must be unique/],
    ['non-object group', { ...validConfiguration, groups: ['living-room'] }, /groups\[0\] must be an object/],
    ['unknown instance', { ...validConfiguration, groups: [{ ...validConfiguration.groups[0], instanceId: 'missing' }] }, /must reference an instance/],
    ['dashboard URL instead of path', { ...validConfiguration, groups: [{ ...validConfiguration.groups[0], dashboardPath: 'https://ha.example.com/dashboard' }] }, /dashboardPath must start with one slash/],
    ['protocol-relative dashboard path', { ...validConfiguration, groups: [{ ...validConfiguration.groups[0], dashboardPath: '//other.example.com/dashboard' }] }, /dashboardPath must start with one slash/],
    ['duplicate group', { ...validConfiguration, groups: [validConfiguration.groups[0], validConfiguration.groups[0]] }, /group id living-room must be unique/],
    ['non-array entities', { ...validConfiguration, groups: [{ ...validConfiguration.groups[0], entities: {} }] }, /entities must be an array/],
    ['non-object entity', { ...validConfiguration, groups: [{ ...validConfiguration.groups[0], entities: [null] }] }, /entities\[0\] must be an object/],
    ['invalid entity ID', { ...validConfiguration, groups: [{ ...validConfiguration.groups[0], entities: [{ entityId: 'temperature' }] }] }, /must use domain.object_id/],
    ['blank unit override', { ...validConfiguration, groups: [{ ...validConfiguration.groups[0], entities: [{ entityId: 'sensor.temperature', unitOverride: '' }] }] }, /unitOverride must be a non-empty string/],
];

for (const [name, value, expectedError] of invalidCases) {
    test(`rejects ${name}`, () => {
        assert.throws(() => parseConfigurationValue(clone(value)), expectedError);
    });
}
