import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execPath } from 'node:process';
import { URL, fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const checker = fileURLToPath(new URL('../scripts/ci/check-secret-detection.mjs', import.meta.url));

async function withReport(contents, action) {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'peekhassio-secret-detection-'));
    const reportPath = path.join(directory, 'report.json');
    try {
        await writeFile(reportPath, contents);
        await action(reportPath);
    }
    finally {
        await rm(directory, { recursive: true });
    }
}

test('accepts a valid secret detection report without findings', async () => {
    await withReport(JSON.stringify({ vulnerabilities: [] }), async (reportPath) => {
        await assert.doesNotReject(execFileAsync(execPath, [checker, reportPath]));
    });
});

test('rejects findings without printing their contents', async () => {
    const sensitiveValue = 'DO_NOT_PRINT_SECRET_VALUE';
    await withReport(JSON.stringify({ vulnerabilities: [{ value: sensitiveValue }] }), async (reportPath) => {
        await assert.rejects(
            execFileAsync(execPath, [checker, reportPath]),
            (error) => {
                assert.match(error.stderr, /found 1 potential secret/);
                assert.doesNotMatch(error.stderr, new RegExp(sensitiveValue));
                return true;
            },
        );
    });
});

test('rejects unreadable and structurally invalid reports', async () => {
    await assert.rejects(
        execFileAsync(execPath, [checker, 'missing-report.json']),
        /did not produce a readable report/,
    );
    await withReport('{}', reportPath => assert.rejects(
        execFileAsync(execPath, [checker, reportPath]),
        /produced an invalid report/,
    ));
});
