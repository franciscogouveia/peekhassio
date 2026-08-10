import { rm } from 'node:fs/promises';
import { URL, fileURLToPath } from 'node:url';

const generatedPaths = ['../../coverage/', '../../dist/']
    .map(path => fileURLToPath(new URL(path, import.meta.url)));

await Promise.all(generatedPaths.map(path => rm(path, { recursive: true, force: true })));
