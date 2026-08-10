import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { URL, fileURLToPath } from 'node:url';

import {
    assertExtensionPackage,
    assertRuntimeModulesPackaged,
    collectRuntimeModules,
    extraSourcesFrom,
} from '../../scripts/build/package-sources.mjs';

const projectDirectory = fileURLToPath(new URL('../../', import.meta.url));

test('packages every module imported by the preferences entry point', async () => {
    const packageJson = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
    const modules = await collectRuntimeModules(path.join(projectDirectory, 'dist'));
    const extraSources = extraSourcesFrom(packageJson.scripts.package);

    assert.deepEqual(modules, ['entities/configuration.js', 'entities/preferences.js', 'entities/state-client.js', 'extension.js', 'groups/configuration.js', 'groups/panel-renderer.js', 'groups/panel-view.js', 'groups/preferences.js', 'instances/configuration.js', 'instances/credential-store.js', 'instances/home-assistant-client.js', 'instances/preferences.js', 'instances/secret-service.js', 'instances/soup-websocket-transport.js', 'preferences/view.js', 'prefs.js', 'runtime/coordinator.js', 'runtime/extension-runtime.js', 'shared/action-runner.js', 'shared/configuration.js', 'shared/signal-owner.js']);
    assert.deepEqual(extraSources, ['entities', 'groups', 'instances', 'preferences', 'runtime', 'shared']);
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

test('directory sources cover only their contained runtime modules', () => {
    assert.doesNotThrow(() => assertRuntimeModulesPackaged(
        ['extension.js', 'prefs.js', 'entities/configuration.js'],
        ['entities'],
    ));
    assert.throws(
        () => assertRuntimeModulesPackaged(['extension.js', 'prefs.js', 'entity/configuration.js'], ['entities']),
        /Package omits runtime modules: entity\/configuration\.js/,
    );
});

test('accepts only the complete reviewable extension archive', () => {
    const modules = ['extension.js', 'prefs.js', 'runtime.js'];
    const entries = [
        'schemas/',
        'extension.js',
        'metadata.json',
        'prefs.js',
        'runtime.js',
        'schemas/org.gnome.shell.extensions.peekhassio.gschema.xml',
    ];

    assert.doesNotThrow(() => assertExtensionPackage(entries, modules));
    assert.doesNotThrow(() => assertExtensionPackage([...entries, 'schemas/gschemas.compiled'], modules));
});

test('rejects missing, unnecessary, and unsafe archive files', () => {
    const modules = ['extension.js', 'prefs.js'];
    const required = [
        'extension.js',
        'metadata.json',
        'prefs.js',
        'schemas/org.gnome.shell.extensions.peekhassio.gschema.xml',
    ];

    assert.throws(
        () => assertExtensionPackage(required.filter(file => !file.endsWith('.gschema.xml')), modules),
        /Package omits required files: schemas\/org\.gnome\.shell\.extensions\.peekhassio\.gschema\.xml/,
    );
    assert.throws(
        () => assertExtensionPackage([...required, 'README.md'], modules),
        /Package contains unnecessary files: README\.md/,
    );
    assert.throws(
        () => assertExtensionPackage([...required, '../token'], modules),
        /Package contains unsafe paths: \.\.\/token/,
    );
});
