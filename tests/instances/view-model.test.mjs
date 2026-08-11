import assert from 'node:assert/strict';
import test from 'node:test';

import { buildInstanceRowViewModels } from '../../dist/instances/view-model.js';

test('derives instance rows in configuration order', () => {
    assert.deepEqual(buildInstanceRowViewModels({
        version: 1,
        instances: [
            { id: 'home', name: 'Home', baseUrl: 'https://ha.example.com' },
            { id: 'cabin', name: 'Cabin', baseUrl: 'http://ha.local:8123' },
        ],
        groups: [],
    }), [
        { id: 'home', title: 'Home', subtitle: 'https://ha.example.com' },
        { id: 'cabin', title: 'Cabin', subtitle: 'http://ha.local:8123' },
    ]);
});

test('derives no instance rows from empty configuration', () => {
    assert.deepEqual(buildInstanceRowViewModels({ version: 1, instances: [], groups: [] }), []);
});
