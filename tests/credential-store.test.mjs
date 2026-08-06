import assert from 'node:assert/strict';
import test from 'node:test';

import { CredentialStore } from '../dist/credential-store.js';

test('stores, checks, loads, and clears credentials asynchronously', async () => {
    const tokens = new Map();
    const store = new CredentialStore({
        has: async instanceId => tokens.has(instanceId),
        load: async instanceId => tokens.get(instanceId) ?? null,
        async store(instanceId, token) {
            tokens.set(instanceId, token);
            return true;
        },
        async clear(instanceId) {
            tokens.delete(instanceId);
        },
    });

    assert.equal(await store.hasToken('home'), false);
    await store.saveToken('home', ' token-value ');
    assert.equal(await store.hasToken('home'), true);
    assert.equal(await store.loadToken('home'), 'token-value');
    assert.equal(tokens.get('home'), 'token-value');
    await store.clearToken('home');
    assert.equal(await store.hasToken('home'), false);
    await assert.rejects(store.saveToken('home', '  '), /must not be blank/);
});

test('redacts asynchronous credential backend failures', async () => {
    const leakedToken = 'secret-token-value';
    const failure = async () => {
        throw new Error(leakedToken);
    };
    const failingStore = new CredentialStore({ has: failure, load: failure, store: failure, clear: failure });
    const rejectedStore = new CredentialStore({
        has: async () => false,
        load: async () => null,
        store: async () => false,
        clear: async () => {},
    });
    const actions = [
        () => failingStore.hasToken('home'),
        () => failingStore.loadToken('home'),
        () => failingStore.saveToken('home', leakedToken),
        () => failingStore.clearToken('home'),
        () => rejectedStore.saveToken('home', leakedToken),
        () => rejectedStore.loadToken('home'),
    ];

    for (const action of actions) {
        await assert.rejects(action(), (error) => {
            assert.doesNotMatch(error.message, new RegExp(leakedToken));
            assert.match(error.message, /Secret Service/);
            return true;
        });
    }
});
