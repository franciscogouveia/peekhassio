import { execFile } from 'node:child_process';
import { argv } from 'node:process';
import { promisify } from 'node:util';

import {
    assertExtensionPackage,
    collectRuntimeModules,
} from '../build/package-sources.mjs';

const archive = argv[2];
if (!archive)
    throw new Error('Pass the extension archive path to validate.');

const execute = promisify(execFile);
const [{ stdout }, runtimeModules] = await Promise.all([
    execute('unzip', ['-Z1', archive]),
    collectRuntimeModules('dist'),
]);
const entries = stdout.split('\n').filter(Boolean);
assertExtensionPackage(entries, runtimeModules);
