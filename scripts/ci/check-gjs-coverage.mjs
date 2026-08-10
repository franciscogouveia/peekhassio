import { readFile } from 'node:fs/promises';
import { stdout } from 'node:process';

const report = await readFile('coverage/gjs/coverage.lcov', 'utf8');

function total(label) {
    return [...report.matchAll(new RegExp(`^${label}:(\\d+)$`, 'gm'))]
        .reduce((sum, match) => sum + Number(match[1]), 0);
}

function percentage(hit, found) {
    return found === 0 ? 100 : hit / found * 100;
}

const lineCoverage = percentage(total('LH'), total('LF'));
const branchCoverage = percentage(total('BRH'), total('BRF'));

stdout.write(`all files | ${lineCoverage.toFixed(2)} | ${branchCoverage.toFixed(2)}\n`);

if (lineCoverage <= 80 || branchCoverage <= 80)
    throw new Error('GJS line and branch coverage must exceed 80%');
