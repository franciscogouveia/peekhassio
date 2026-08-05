import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { URL, fileURLToPath } from 'node:url';

import { assertMetadata, validateMetadata } from '../scripts/metadata.mjs';

const metadataPath = fileURLToPath(new URL('../metadata.json', import.meta.url));
const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));

test('accepts the project metadata', () => {
    assert.deepEqual(validateMetadata(metadata), []);
    assert.doesNotThrow(() => assertMetadata(metadata));
});

test('rejects a non-object metadata value', () => {
    assert.deepEqual(validateMetadata(null), ['metadata must be an object']);
});

test('rejects invalid identity and compatibility metadata', () => {
    const invalidMetadata = {
        'uuid': 'wrong@example.com',
        'name': '',
        'description': 42,
        'url': null,
        'shell-version': ['49', '50'],
    };
    const errors = validateMetadata(invalidMetadata);

    assert.deepEqual(errors, [
        'name must be a non-empty string',
        'description must be a non-empty string',
        'url must be a non-empty string',
        'uuid must be peekhassio@de-gouveia.eu',
        'settings-schema must be org.gnome.shell.extensions.peekhassio',
        'shell-version must contain only GNOME Shell 50',
    ]);
    assert.throws(() => assertMetadata(invalidMetadata), /Invalid metadata/);
});
