import assert from 'node:assert/strict';
import test from 'node:test';

import { buildGroupView } from '../../dist/groups/view.js';

const instances = [
    { id: 'home', name: 'Home', baseUrl: 'https://ha.example.com' },
    { id: 'cabin', name: 'Cabin', baseUrl: 'http://ha.local:8123' },
];
const groups = [
    { id: 'living-room', instanceId: 'home', name: 'Living room', dashboardPath: '/living-room', entities: [] },
    { id: 'overview', instanceId: 'cabin', name: 'Overview', dashboardPath: '/overview', entities: [] },
];

test('derives ordered group rows and move controls', () => {
    assert.deepEqual(buildGroupView({ version: 1, instances, groups }), {
        canAddGroup: true,
        rows: [
            {
                id: 'living-room',
                title: 'Living room',
                subtitle: 'Home · /living-room',
                canMoveUp: false,
                canMoveDown: true,
            },
            {
                id: 'overview',
                title: 'Overview',
                subtitle: 'Cabin · /overview',
                canMoveUp: true,
                canMoveDown: false,
            },
        ],
    });
});

test('disables group creation and movement for empty configuration', () => {
    assert.deepEqual(buildGroupView({ version: 1, instances: [], groups: [] }), {
        canAddGroup: false,
        rows: [],
    });
    assert.deepEqual(buildGroupView({ version: 1, instances, groups: [groups[0]] }).rows[0], {
        id: 'living-room',
        title: 'Living room',
        subtitle: 'Home · /living-room',
        canMoveUp: false,
        canMoveDown: false,
    });
});
