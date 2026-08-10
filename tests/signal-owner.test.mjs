import assert from 'node:assert/strict';
import test from 'node:test';

import { SignalOwner } from '../dist/signal-owner.js';

test('disconnects every owned signal exactly once', () => {
    const owner = new SignalOwner();
    const disconnected = [];
    owner.add(4);
    owner.add(7);

    owner.disconnectAll(signal => disconnected.push(signal));
    owner.disconnectAll(signal => disconnected.push(signal));

    assert.deepEqual(disconnected, [4, 7]);
});

test('clears ownership before invoking disconnect callbacks', () => {
    const owner = new SignalOwner();
    const disconnected = [];
    owner.add(3);

    owner.disconnectAll((signal) => {
        disconnected.push(signal);
        owner.disconnectAll(nestedSignal => disconnected.push(nestedSignal));
    });

    assert.deepEqual(disconnected, [3]);
});
