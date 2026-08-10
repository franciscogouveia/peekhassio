/* global imports */

import System from 'system';

import { moveEntity, removeEntity, upsertEntity } from '../../dist/entities/configuration.js';
import { buildDashboardUrl, moveGroup, removeGroup, upsertGroup } from '../../dist/groups/configuration.js';
import { buildWebSocketUrl, removeInstance, upsertInstance } from '../../dist/instances/configuration.js';
import { runSafely } from '../../dist/shared/action-runner.js';
import {
    CONFIGURATION_KEY,
    CREDENTIAL_REVISION_KEY,
    ConfigurationStore,
    createDefaultConfiguration,
    incrementCredentialRevision,
    parseConfigurationJson,
    parseConfigurationValue,
    serializeConfiguration,
} from '../../dist/shared/configuration.js';
import { buildEntityRows, buildPreferencesView } from '../../dist/preferences/view.js';
import { assertThrowsMatching } from './assertions.mjs';

const JsUnit = imports.jsUnit;

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

const tests = {
    testRoundTripsValidOrderedConfiguration() {
        const serialized = serializeConfiguration(validConfiguration);
        const parsed = parseConfigurationJson(serialized);

        JsUnit.assertEquals(JSON.stringify(validConfiguration), JSON.stringify(parsed));
        JsUnit.assertEquals('cabin', parsed.instances[1].id);
        JsUnit.assertEquals('sensor.living_room_humidity', parsed.groups[0].entities[1].entityId);
    },
    testCreatesEmptyVersionedConfiguration() {
        const configuration = createDefaultConfiguration();

        JsUnit.assertEquals(JSON.stringify({ version: 1, instances: [], groups: [] }), JSON.stringify(configuration));
        JsUnit.assertEquals(JSON.stringify(configuration), JSON.stringify(parseConfigurationValue(configuration)));
    },
    testLoadsAndSavesThroughSettingsBoundary() {
        let stored = JSON.stringify(createDefaultConfiguration());
        const settings = {
            get_string(key) {
                JsUnit.assertEquals(CONFIGURATION_KEY, key);
                return stored;
            },
            set_string(key, value) {
                JsUnit.assertEquals(CONFIGURATION_KEY, key);
                stored = value;
                return true;
            },
        };
        const store = new ConfigurationStore(settings);

        JsUnit.assertEquals(JSON.stringify(createDefaultConfiguration()), JSON.stringify(store.load()));
        store.save(validConfiguration);
        JsUnit.assertEquals(JSON.stringify(validConfiguration), JSON.stringify(store.load()));
    },
    testIncrementsCredentialRevisionAndReportsRejectedUpdates() {
        let revision = 4;
        const settings = {
            get_uint(key) {
                JsUnit.assertEquals(CREDENTIAL_REVISION_KEY, key);
                return revision;
            },
            set_uint(key, value) {
                JsUnit.assertEquals(CREDENTIAL_REVISION_KEY, key);
                revision = value;
                return true;
            },
        };

        incrementCredentialRevision(settings);
        JsUnit.assertEquals(5, revision);
        settings.set_uint = () => false;
        assertThrowsMatching(() => incrementCredentialRevision(settings), /Could not notify/);
    },
    testReportsInvalidJsonAndRejectedSettingsUpdates() {
        assertThrowsMatching(() => parseConfigurationJson('{'), /value must be valid JSON/);

        const store = new ConfigurationStore({
            get_string: () => '{}',
            set_string: () => false,
        });
        assertThrowsMatching(() => store.save(validConfiguration), /settings backend rejected/);
    },
    testBuildsDashboardUrlFromInstanceAndGroup() {
        const group = validConfiguration.groups[0];

        JsUnit.assertEquals('https://ha.example.com/lovelace/living-room', buildDashboardUrl(validConfiguration.instances[0], group));
        JsUnit.assertEquals(
            'https://ha.example.com/lovelace/living-room',
            buildDashboardUrl({ ...validConfiguration.instances[0], baseUrl: 'https://ha.example.com/' }, group),
        );
    },
    testBuildsHomeAssistantWebSocketUrl() {
        JsUnit.assertEquals('wss://ha.example.com/api/websocket', buildWebSocketUrl(validConfiguration.instances[0]));
        JsUnit.assertEquals('ws://ha.local:8123/api/websocket', buildWebSocketUrl(validConfiguration.instances[1]));
        JsUnit.assertEquals('wss://ha.example.com/api/websocket', buildWebSocketUrl({
            ...validConfiguration.instances[0],
            baseUrl: 'https://ha.example.com/prefix',
        }));
        assertThrowsMatching(() => buildWebSocketUrl({
            ...validConfiguration.instances[0],
            baseUrl: 'file:///private/data',
        }), /baseUrl must be an HTTP/);
    },
    testAddsAndUpdatesInstancesWithoutChangingTheirOrder() {
        const added = upsertInstance(validConfiguration, {
            id: 'office',
            name: 'Office',
            baseUrl: 'https://office.example.com',
        });
        const updated = upsertInstance(added, {
            id: 'cabin',
            name: 'Mountain cabin',
            baseUrl: 'https://cabin.example.com',
        });

        JsUnit.assertEquals('office', added.instances[2].id);
        JsUnit.assertEquals('home,cabin,office', updated.instances.map(instance => instance.id).join(','));
        JsUnit.assertEquals('Mountain cabin', updated.instances[1].name);
        JsUnit.assertEquals(JSON.stringify(validConfiguration.groups), JSON.stringify(updated.groups));
        assertThrowsMatching(
            () => upsertInstance(validConfiguration, { id: 'invalid', name: 'Invalid', baseUrl: 'not a URL' }),
            /baseUrl must be an HTTP/,
        );
    },
    testRemovesOnlyUnreferencedInstances() {
        const removed = removeInstance(validConfiguration, 'cabin');

        JsUnit.assertEquals('home', removed.instances.map(instance => instance.id).join(','));
        assertThrowsMatching(() => removeInstance(validConfiguration, 'missing'), /instance id missing must exist/);
        assertThrowsMatching(() => removeInstance(validConfiguration, 'home'), /must not be referenced by a group/);
    },
    testAddsAndUpdatesGroupsWhilePreservingEntitiesAndOrder() {
        const added = upsertGroup(validConfiguration, {
            id: 'overview',
            instanceId: 'cabin',
            name: 'Overview',
            dashboardPath: '/dashboard/overview',
            entities: [],
        });
        const reassigned = upsertGroup(added, {
            ...validConfiguration.groups[0],
            instanceId: 'cabin',
            name: 'Downstairs',
        });

        JsUnit.assertEquals('living-room,overview', reassigned.groups.map(group => group.id).join(','));
        JsUnit.assertEquals('cabin', reassigned.groups[0].instanceId);
        JsUnit.assertEquals(JSON.stringify(validConfiguration.groups[0].entities), JSON.stringify(reassigned.groups[0].entities));
        assertThrowsMatching(
            () => upsertGroup(validConfiguration, { ...validConfiguration.groups[0], id: 'invalid', instanceId: 'missing' }),
            /must reference an instance/,
        );
        assertThrowsMatching(
            () => upsertGroup(validConfiguration, { ...validConfiguration.groups[0], id: 'invalid', dashboardPath: 'dashboard' }),
            /dashboardPath must start with one slash/,
        );
    },
    testRemovesAndReordersGroups() {
        const withSecondGroup = upsertGroup(validConfiguration, {
            id: 'overview',
            instanceId: 'cabin',
            name: 'Overview',
            dashboardPath: '/dashboard/overview',
            entities: [],
        });
        const moved = moveGroup(withSecondGroup, 'overview', -1);
        const removed = removeGroup(moved, 'living-room');

        JsUnit.assertEquals('overview,living-room', moved.groups.map(group => group.id).join(','));
        JsUnit.assertEquals('overview', removed.groups.map(group => group.id).join(','));
        JsUnit.assertEquals(JSON.stringify(validConfiguration.instances), JSON.stringify(removed.instances));
        assertThrowsMatching(() => moveGroup(moved, 'overview', -1), /cannot move further/);
        assertThrowsMatching(() => moveGroup(moved, 'missing', 1), /group id missing must exist/);
        assertThrowsMatching(() => removeGroup(moved, 'missing'), /group id missing must exist/);
    },
    testAddsEditsAndRemovesEntitiesWithoutChangingOtherConfiguration() {
        const added = upsertEntity(validConfiguration, 'living-room', null, {
            entityId: 'light.floor_lamp',
            unitOverride: '  ',
        });
        const edited = upsertEntity(added, 'living-room', 'sensor.living_room_humidity', {
            entityId: 'sensor.indoor_humidity',
            unitOverride: ' % ',
        });
        const removed = removeEntity(edited, 'living-room', 'sensor.living_room_temperature');

        JsUnit.assertEquals('sensor.living_room_temperature,sensor.living_room_humidity,light.floor_lamp', added.groups[0].entities.map(entity => entity.entityId).join(','));
        JsUnit.assertFalse('unitOverride' in added.groups[0].entities[2]);
        JsUnit.assertEquals('sensor.living_room_temperature,sensor.indoor_humidity,light.floor_lamp', edited.groups[0].entities.map(entity => entity.entityId).join(','));
        JsUnit.assertEquals('%', edited.groups[0].entities[1].unitOverride);
        JsUnit.assertEquals('sensor.indoor_humidity,light.floor_lamp', removed.groups[0].entities.map(entity => entity.entityId).join(','));
        JsUnit.assertEquals(JSON.stringify(validConfiguration.instances), JSON.stringify(removed.instances));
    },
    testValidatesEntityOperationsAndReordersOnlyTheSelectedGroup() {
        const anotherGroup = {
            id: 'overview',
            instanceId: 'cabin',
            name: 'Overview',
            dashboardPath: '/overview',
            entities: [{ entityId: 'sensor.living_room_humidity' }],
        };
        const configuration = upsertGroup(validConfiguration, anotherGroup);
        const moved = moveEntity(configuration, 'living-room', 'sensor.living_room_humidity', -1);

        JsUnit.assertEquals('sensor.living_room_humidity,sensor.living_room_temperature', moved.groups[0].entities.map(entity => entity.entityId).join(','));
        JsUnit.assertEquals(JSON.stringify(anotherGroup.entities), JSON.stringify(moved.groups[1].entities));
        assertThrowsMatching(() => upsertEntity(configuration, 'living-room', null, { entityId: 'sensor.living_room_humidity' }), /must be unique within its group/);
        assertThrowsMatching(() => upsertEntity(configuration, 'missing', null, { entityId: 'sensor.valid' }), /group id missing must exist/);
        assertThrowsMatching(() => upsertEntity(configuration, 'living-room', 'sensor.missing', { entityId: 'sensor.valid' }), /entity id sensor.missing must exist/);
        assertThrowsMatching(() => upsertEntity(configuration, 'living-room', null, { entityId: 'invalid' }), /must use domain.object_id/);
        assertThrowsMatching(() => removeEntity(configuration, 'living-room', 'sensor.missing'), /entity id sensor.missing must exist/);
        assertThrowsMatching(() => moveEntity(configuration, 'living-room', 'sensor.living_room_temperature', -1), /cannot move further/);
        assertThrowsMatching(() => moveEntity(configuration, 'missing', 'sensor.valid', 1), /group id missing must exist/);
    },
    testDerivesOrderedEntityRowsAndMoveControls() {
        const rows = buildEntityRows(validConfiguration, 'living-room');

        JsUnit.assertEquals('sensor.living_room_temperature,sensor.living_room_humidity', rows.map(row => row.title).join(','));
        JsUnit.assertEquals('°C', rows[0].subtitle);
        JsUnit.assertEquals('Uses Home Assistant unit', rows[1].subtitle);
        JsUnit.assertFalse(rows[0].canMoveUp);
        JsUnit.assertTrue(rows[0].canMoveDown);
        JsUnit.assertTrue(rows[1].canMoveUp);
        JsUnit.assertFalse(rows[1].canMoveDown);
        JsUnit.assertEquals(0, buildEntityRows(upsertGroup(validConfiguration, {
            ...validConfiguration.groups[0],
            entities: [],
        }), 'living-room').length);
        assertThrowsMatching(() => buildEntityRows(validConfiguration, 'missing'), /group id missing must exist/);
    },
    testDerivesDisabledControlsForEmptyPreferences() {
        const view = buildPreferencesView(createDefaultConfiguration());

        JsUnit.assertFalse(view.canAddGroup);
        JsUnit.assertEquals(0, view.instanceRows.length);
        JsUnit.assertEquals(0, view.groupRows.length);
    },
    testUpdatesVisibleControlsAfterGroupInteractions() {
        const added = upsertGroup(validConfiguration, {
            id: 'overview',
            instanceId: 'cabin',
            name: 'Overview',
            dashboardPath: '/dashboard/overview',
            entities: [],
        });
        const beforeMove = buildPreferencesView(added);
        const afterMove = buildPreferencesView(moveGroup(added, 'overview', -1));
        const afterDelete = buildPreferencesView(removeGroup(added, 'living-room'));

        JsUnit.assertTrue(beforeMove.canAddGroup);
        JsUnit.assertEquals('Home', beforeMove.instanceRows[0].title);
        JsUnit.assertEquals('https://ha.example.com', beforeMove.instanceRows[0].subtitle);
        JsUnit.assertEquals('Living room,Overview', beforeMove.groupRows.map(row => row.title).join(','));
        JsUnit.assertEquals('Cabin · /dashboard/overview', beforeMove.groupRows[1].subtitle);
        JsUnit.assertFalse(beforeMove.groupRows[0].canMoveUp);
        JsUnit.assertTrue(beforeMove.groupRows[0].canMoveDown);
        JsUnit.assertTrue(beforeMove.groupRows[1].canMoveUp);
        JsUnit.assertFalse(beforeMove.groupRows[1].canMoveDown);
        JsUnit.assertEquals('Overview,Living room', afterMove.groupRows.map(row => row.title).join(','));
        JsUnit.assertEquals('Overview', afterDelete.groupRows.map(row => row.title).join(','));
        JsUnit.assertFalse(afterDelete.groupRows[0].canMoveUp);
        JsUnit.assertFalse(afterDelete.groupRows[0].canMoveDown);
    },
    testRunsPreferencesActionsThroughAnErrorBoundary() {
        let completed = false;
        let reported = '';

        runSafely(() => {
            completed = true;
        }, () => {
            reported = 'unexpected';
        }, () => {
            reported = 'reporter failed';
        });
        runSafely(() => {
            throw new Error('dialog failed');
        }, (error) => {
            reported = error.message;
        }, () => {
            reported = 'reporter failed';
        });

        JsUnit.assertTrue(completed);
        JsUnit.assertEquals('dialog failed', reported);
    },
    testReportsWhenThePreferencesErrorReporterFails() {
        let reportingFailure = '';

        runSafely(() => {
            throw new Error('action failed');
        }, () => {
            throw new Error('dialog failed');
        }, (error) => {
            reportingFailure = error.message;
        });

        JsUnit.assertEquals('dialog failed', reportingFailure);
    },
};

const invalidCases = [
    ['non-object root', null, /root must be an object/],
    ['unsupported version', { ...validConfiguration, version: 2 }, /version must be 1/],
    ['non-array instances', { ...validConfiguration, instances: {} }, /instances must be an array/],
    ['non-array groups', { ...validConfiguration, groups: {} }, /groups must be an array/],
    ['non-object instance', { ...validConfiguration, instances: ['home'] }, /instances\[0\] must be an object/],
    ['non-string instance ID', { ...validConfiguration, instances: [{ id: 7, name: 'Home', baseUrl: 'https://ha.example.com' }] }, /id must be a non-empty string/],
    ['blank instance name', { ...validConfiguration, instances: [{ id: 'home', name: '', baseUrl: 'https://ha.example.com' }] }, /name must be a non-empty string/],
    ['invalid instance URL', { ...validConfiguration, instances: [{ id: 'home', name: 'Home', baseUrl: 'not a url' }] }, /baseUrl must be an HTTP/],
    ['unsupported URL protocol', { ...validConfiguration, instances: [{ id: 'home', name: 'Home', baseUrl: 'ftp://ha.example.com' }] }, /baseUrl must be an HTTP/],
    ['base URL query', { ...validConfiguration, instances: [{ id: 'home', name: 'Home', baseUrl: 'https://ha.example.com?redirect=1' }] }, /baseUrl must be an HTTP/],
    ['base URL fragment', { ...validConfiguration, instances: [{ id: 'home', name: 'Home', baseUrl: 'https://ha.example.com#status' }] }, /baseUrl must be an HTTP/],
    ['base URL without host', { ...validConfiguration, instances: [{ id: 'home', name: 'Home', baseUrl: 'http:/dashboard' }] }, /baseUrl must be an HTTP/],
    ['stored token', { ...validConfiguration, instances: [{ ...validConfiguration.instances[0], token: 'secret' }] }, /must not store a token/],
    ['duplicate instance', { ...validConfiguration, instances: [validConfiguration.instances[0], validConfiguration.instances[0]] }, /instance id home must be unique/],
    ['non-object group', { ...validConfiguration, groups: ['living-room'] }, /groups\[0\] must be an object/],
    ['unknown instance', { ...validConfiguration, groups: [{ ...validConfiguration.groups[0], instanceId: 'missing' }] }, /must reference an instance/],
    ['dashboard URL instead of path', { ...validConfiguration, groups: [{ ...validConfiguration.groups[0], dashboardPath: 'https://ha.example.com/dashboard' }] }, /dashboardPath must start with one slash/],
    ['protocol-relative dashboard path', { ...validConfiguration, groups: [{ ...validConfiguration.groups[0], dashboardPath: '//other.example.com/dashboard' }] }, /dashboardPath must start with one slash/],
    ['malformed dashboard path', { ...validConfiguration, groups: [{ ...validConfiguration.groups[0], dashboardPath: '/bad%ZZ' }] }, /dashboardPath must start with one slash/],
    ['duplicate group', { ...validConfiguration, groups: [validConfiguration.groups[0], validConfiguration.groups[0]] }, /group id living-room must be unique/],
    ['non-array entities', { ...validConfiguration, groups: [{ ...validConfiguration.groups[0], entities: {} }] }, /entities must be an array/],
    ['non-object entity', { ...validConfiguration, groups: [{ ...validConfiguration.groups[0], entities: [null] }] }, /entities\[0\] must be an object/],
    ['invalid entity ID', { ...validConfiguration, groups: [{ ...validConfiguration.groups[0], entities: [{ entityId: 'temperature' }] }] }, /must use domain.object_id/],
    ['blank unit override', { ...validConfiguration, groups: [{ ...validConfiguration.groups[0], entities: [{ entityId: 'sensor.temperature', unitOverride: '' }] }] }, /unitOverride must be a non-empty string/],
    ['duplicate entity', { ...validConfiguration, groups: [{ ...validConfiguration.groups[0], entities: [validConfiguration.groups[0].entities[0], validConfiguration.groups[0].entities[0]] }] }, /must be unique within its group/],
];

invalidCases.forEach(([, value, expectedError], index) => {
    tests[`testRejectsInvalidCase${index}`] = () => {
        assertThrowsMatching(() => parseConfigurationValue(value), expectedError);
    };
});

System.exit(JsUnit.gjstestRun(tests, () => {}, () => {}));
