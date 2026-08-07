import assert from 'node:assert/strict';
import test from 'node:test';

import { buildPanelGroupViews, PanelViewController } from '../dist/panel-view.js';

const groups = [
    {
        id: 'living-room',
        name: 'Living room',
        entities: [
            { entityId: 'sensor.temperature', value: '21', availability: 'available', unit: '°C' },
            { entityId: 'sensor.humidity', value: null, availability: 'unknown', unit: '%' },
        ],
        status: 'ready',
    },
    {
        id: 'porch',
        name: 'Porch',
        entities: [
            { entityId: 'light.porch', value: null, availability: 'unavailable' },
            { entityId: 'sensor.outdoor', value: null, availability: 'missing' },
        ],
        status: 'ready',
    },
    { id: 'empty', name: 'Empty', entities: [], status: 'ready' },
];

test('builds compact labels, accessible descriptions, and degraded state', () => {
    assert.deepEqual(buildPanelGroupViews(groups), [
        {
            id: 'living-room',
            name: 'Living room',
            values: ['21°C', 'N/A'],
            accessibleName: 'Living room: sensor.temperature: 21 °C, sensor.humidity: unknown',
            degraded: true,
        },
        {
            id: 'porch',
            name: 'Porch',
            values: ['N/A', 'N/A'],
            accessibleName: 'Porch: light.porch: unavailable, sensor.outdoor: missing',
            degraded: true,
        },
        {
            id: 'empty',
            name: 'Empty',
            values: [],
            accessibleName: 'Empty: no entities',
            degraded: false,
        },
    ]);
});

test('keeps values compact and accessible status details off the panel', () => {
    const base = {
        id: 'living-room',
        name: 'Living room',
        entities: [{ entityId: 'sensor.temperature', value: '21', availability: 'available', unit: '°C' }],
    };
    const views = buildPanelGroupViews([
        { ...base, id: 'connecting', status: 'connecting' },
        { ...base, id: 'stale', status: 'stale' },
        { ...base, id: 'authentication', status: 'authentication-failed' },
    ]);

    assert.deepEqual(views.map(view => view.values), [['21°C'], ['21°C'], ['21°C']]);
    assert.equal(views.every(view => view.degraded), true);
    assert.match(views[1].accessibleName, /status: Stale/);
    assert.match(views[2].accessibleName, /status: Authentication required/);
});

test('updates stable widgets and rebuilds only for identity or order changes', () => {
    const created = [];
    const factory = {
        create(view, position) {
            const widget = {
                destroyed: false,
                position,
                updates: [view],
                update(nextView) {
                    this.updates.push(nextView);
                },
                destroy() {
                    this.destroyed = true;
                },
            };
            created.push(widget);
            return widget;
        },
    };
    const controller = new PanelViewController(factory);

    controller.render(groups);
    const firstWidgets = [...created];
    controller.render([{ ...groups[0], entities: [{
        entityId: 'sensor.temperature',
        value: '22',
        availability: 'available',
        unit: '°C',
    }] }, groups[1], groups[2]]);
    assert.equal(created.length, 3);
    assert.deepEqual(firstWidgets[0].updates.at(-1).values, ['22°C']);
    assert.equal(firstWidgets[0].destroyed, false);

    controller.render([groups[1], groups[0], groups[2]]);
    assert.equal(created.length, 6);
    assert.deepEqual(created.slice(3).map(widget => widget.position), [0, 1, 2]);
    assert.equal(firstWidgets.every(widget => widget.destroyed), true);

    controller.render([]);
    assert.equal(created.slice(3).every(widget => widget.destroyed), true);
    controller.destroy();
});
