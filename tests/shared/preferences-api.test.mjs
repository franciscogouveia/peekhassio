import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

async function sourceFiles(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    const files = await Promise.all(entries.map(entry => entry.isDirectory()
        ? sourceFiles(`${directory}/${entry.name}`)
        : [`${directory}/${entry.name}`]));
    return files.flat().filter(file => file.endsWith('.ts'));
}

test('preferences source is independent of the deprecated window host', async () => {
    const files = await sourceFiles('src');
    const sources = await Promise.all(files.map(async file => [file, await readFile(file, 'utf8')]));

    for (const [file, source] of sources) {
        assert.doesNotMatch(source, /Adw\.PreferencesWindow/, `${file} uses Adw.PreferencesWindow`);
        assert.doesNotMatch(source, /fillPreferencesWindow/, `${file} overrides the window-specific hook`);
    }

    const preferences = await readFile('src/prefs.ts', 'utf8');
    assert.match(preferences, /getPreferencesWidget\(\): Gtk\.Widget/);
});
