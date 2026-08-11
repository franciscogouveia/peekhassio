import assert from 'node:assert/strict';
import test from 'node:test';

import { buildEntityRowViewModels } from '../../dist/entities/view-model.js';

const configuration = {
    version: 1,
    instances: [{ id: 'home', name: 'Home', baseUrl: 'https://ha.example.com' }],
    groups: [{
        id: 'living-room',
        instanceId: 'home',
        name: 'Living room',
        dashboardPath: '/lovelace/living-room',
        entities: [
            { entityId: 'sensor.temperature', unitOverride: '°C' },
            { entityId: 'sensor.humidity' },
        ],
    }],
};

test('derives ordered entity rows and move controls', () => {
    assert.deepEqual(buildEntityRowViewModels(configuration, 'living-room'), [
        {
            id: 'sensor.temperature',
            title: 'sensor.temperature',
            subtitle: '°C',
            canMoveUp: false,
            canMoveDown: true,
        },
        {
            id: 'sensor.humidity',
            title: 'sensor.humidity',
            subtitle: 'Uses Home Assistant unit',
            canMoveUp: true,
            canMoveDown: false,
        },
    ]);
    assert.deepEqual(buildEntityRowViewModels({
        ...configuration,
        groups: [{ ...configuration.groups[0], entities: [] }],
    }, 'living-room'), []);
});

test('rejects an unknown entity group', () => {
    assert.throws(() => buildEntityRowViewModels(configuration, 'missing'), /group id missing must exist/);
});
