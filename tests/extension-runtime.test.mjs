import assert from 'node:assert/strict';
import test from 'node:test';

import { ExtensionRuntime } from '../dist/extension-runtime.js';

const configuration = { version: 1, instances: [], groups: [] };

function deferred() {
    let reject;
    const promise = new Promise((_resolve, rejectPromise) => {
        reject = rejectPromise;
    });
    return { promise, reject };
}

function createHarness(starts = []) {
    const changed = [];
    const disconnected = [];
    const errors = [];
    let destroys = 0;
    let stops = 0;
    let startIndex = 0;
    const loaded = [];
    const settings = {
        connect(signal, callback) {
            assert.equal(signal, ['changed::configuration-json', 'changed::credential-revision'][changed.length]);
            changed.push([signal, callback]);
            return 7 + changed.length - 1;
        },
        disconnect: signal => disconnected.push(signal),
    };
    const store = {
        load() {
            loaded.push(configuration);
            return configuration;
        },
    };
    const coordinator = {
        start(value) {
            assert.equal(value, configuration);
            return starts[startIndex++] ?? Promise.resolve();
        },
        stop() {
            stops++;
        },
    };
    const runtime = new ExtensionRuntime(
        settings,
        store,
        coordinator,
        { destroy: () => destroys++ },
        error => errors.push(error),
    );
    return {
        runtime,
        errors,
        disconnected,
        loaded,
        change: index => changed[index][1](),
        destroys: () => destroys,
        stops: () => stops,
        store,
    };
}

test('starts, reloads on settings changes, and cleans up on disable', () => {
    const harness = createHarness();

    harness.runtime.enable();
    harness.change(0);
    harness.change(1);
    harness.runtime.disable();

    assert.equal(harness.loaded.length, 3);
    assert.deepEqual(harness.disconnected, [7, 8]);
    assert.equal(harness.stops(), 1);
    assert.equal(harness.destroys(), 1);
});

test('ignores stale startup failure and owns the current failure', async () => {
    const stale = deferred();
    const current = deferred();
    const harness = createHarness([stale.promise, current.promise]);
    harness.runtime.enable();
    harness.change(0);

    stale.reject(new Error('stale'));
    await Promise.resolve();
    assert.deepEqual(harness.errors, []);

    current.reject(new Error('current'));
    await Promise.resolve();
    assert.equal(harness.errors[0].message, 'current');
    assert.equal(harness.stops(), 1);
    assert.equal(harness.destroys(), 1);
});

test('reports invalid stored configuration and cleans up immediately', () => {
    const harness = createHarness();
    harness.store.load = () => {
        throw new Error('invalid configuration');
    };

    harness.runtime.enable();

    assert.equal(harness.errors[0].message, 'invalid configuration');
    assert.equal(harness.stops(), 1);
    assert.equal(harness.destroys(), 1);
});
