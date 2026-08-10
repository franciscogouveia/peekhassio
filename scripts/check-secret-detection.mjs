import { readFile } from 'node:fs/promises';
import { argv, stdout } from 'node:process';

const reportPath = argv[2] ?? 'gl-secret-detection-report.json';

let report;
try {
    report = JSON.parse(await readFile(reportPath, 'utf8'));
}
catch {
    throw new Error('GitLab secret detection did not produce a readable report.');
}

if (!report || typeof report !== 'object' || !Array.isArray(report.vulnerabilities))
    throw new Error('GitLab secret detection produced an invalid report.');

const findingCount = report.vulnerabilities.length;
if (findingCount > 0)
    throw new Error(`GitLab secret detection found ${findingCount} potential secret(s). Review the protected job artifact.`);

await new Promise((resolve, reject) => stdout.write(
    'GitLab secret detection found no potential secrets.\n',
    error => error ? reject(error) : resolve(),
));
