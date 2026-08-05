import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { URL, fileURLToPath } from 'node:url';

import { assertMetadata } from './metadata.mjs';

const metadataPath = fileURLToPath(new URL('../metadata.json', import.meta.url));
const destinationPath = fileURLToPath(new URL('../dist/metadata.json', import.meta.url));
const schemaPath = fileURLToPath(new URL('../schemas/org.gnome.shell.extensions.peekhassio.gschema.xml', import.meta.url));
const schemaDirectory = fileURLToPath(new URL('../dist/schemas/', import.meta.url));
const schemaDestination = fileURLToPath(new URL('../dist/schemas/org.gnome.shell.extensions.peekhassio.gschema.xml', import.meta.url));
const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));

assertMetadata(metadata);
await copyFile(metadataPath, destinationPath);
await mkdir(schemaDirectory);
await copyFile(schemaPath, schemaDestination);
