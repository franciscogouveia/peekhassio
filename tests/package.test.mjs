import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { URL, fileURLToPath } from 'node:url';

import {
    assertRuntimeModulesPackaged,
    collectRuntimeModules,
    extraSourcesFrom,
} from '../scripts/package-sources.mjs';

const projectDirectory = fileURLToPath(new URL('../', import.meta.url));

test('packages every module imported by the preferences entry point', async () => {
    const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
    const modules = await collectRuntimeModules(path.join(projectDirectory, 'dist'));
    const extraSources = extraSourcesFrom(packageJson.scripts.package);

    assert.deepEqual(modules, ['action-runner.js', 'configuration.js', 'credential-store.js', 'extension.js', 'preferences-view.js', 'prefs.js', 'secret-service.js']);
    assert.deepEqual(extraSources, ['action-runner.js', 'configuration.js', 'credential-store.js', 'entity-state-client.js', 'home-assistant-client.js', 'panel-renderer.js', 'panel-view.js', 'preferences-view.js', 'runtime-coordinator.js', 'secret-service.js', 'soup-websocket-transport.js']);
    assert.doesNotThrow(() => assertRuntimeModulesPackaged(modules, extraSources));
});

test('rejects a preferences build with a missing imported module', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'peekhassio-package-'));
    try {
        await writeFile(path.join(directory, 'extension.js'), 'export default class Extension {}\n');
        await writeFile(path.join(directory, 'prefs.js'), 'import \'./configuration.js\';\n');

        await assert.rejects(
            collectRuntimeModules(directory),
            /Runtime module is missing: configuration\.js/,
        );
    }
    finally {
        await rm(directory, { recursive: true });
    }
});

test('rejects a runtime module omitted from the pack command', () => {
    assert.throws(
        () => assertRuntimeModulesPackaged(['extension.js', 'prefs.js', 'configuration.js'], []),
        /Package omits runtime modules: configuration\.js/,
    );
});
