import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('preferences use the GNOME 45+ window entry point', async () => {
    const preferences = await readFile('src/prefs.ts', 'utf8');
    assert.match(preferences, /fillPreferencesWindow\(window: Adw\.PreferencesWindow\): Promise<void>/);
    assert.doesNotMatch(preferences, /getPreferencesWidget/);
    assert.match(preferences, /new Adw\.PreferencesPage\(\{\s+title: _\('Instances'\)/);
    assert.match(preferences, /new Adw\.PreferencesPage\(\{\s+title: _\('Groups'\)/);
});
