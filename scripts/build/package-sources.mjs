import { readFile } from 'node:fs/promises';
import path from 'node:path';

const ENTRY_POINTS = new Set(['extension.js', 'prefs.js']);
const RELATIVE_IMPORT = /(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"](\.[^'"]+)['"]/g;

export async function collectRuntimeModules(directory) {
    const pending = [...ENTRY_POINTS];
    const modules = new Set();

    while (pending.length > 0) {
        const module = pending.shift();
        if (modules.has(module))
            continue;

        let source;
        try {
            source = await readFile(path.join(directory, module), 'utf8');
        }
        catch {
            throw new Error(`Runtime module is missing: ${module}`);
        }
        modules.add(module);

        for (const match of source.matchAll(RELATIVE_IMPORT)) {
            const dependency = path.normalize(path.join(path.dirname(module), match[1]));
            if (dependency.startsWith('..') || path.isAbsolute(dependency))
                throw new Error(`Runtime import leaves the extension directory: ${match[1]}`);
            pending.push(dependency);
        }
    }

    return [...modules].sort();
}

export function extraSourcesFrom(command) {
    return [...command.matchAll(/(?:^|\s)--extra-source=(?:'([^']+)'|"([^"]+)"|(\S+))/g)]
        .map(match => match[1] ?? match[2] ?? match[3]);
}

export function assertRuntimeModulesPackaged(modules, extraSources) {
    const missing = modules
        .filter(module => !ENTRY_POINTS.has(module) && !extraSources.some(source =>
            module === source || module.startsWith(`${source}/`)));
    if (missing.length > 0)
        throw new Error(`Package omits runtime modules: ${missing.join(', ')}`);
}

export function assertExtensionPackage(entries, runtimeModules) {
    const files = entries.filter(entry => !entry.endsWith('/')).sort();
    const expected = [
        ...runtimeModules,
        'metadata.json',
        'schemas/org.gnome.shell.extensions.peekhassio.gschema.xml',
    ].sort();
    const allowed = [...expected, 'schemas/gschemas.compiled'];
    const unsafe = files.filter(file => file.startsWith('/') || file.split('/').includes('..'));
    if (unsafe.length > 0)
        throw new Error(`Package contains unsafe paths: ${unsafe.join(', ')}`);
    const missing = expected.filter(file => !files.includes(file));
    if (missing.length > 0)
        throw new Error(`Package omits required files: ${missing.join(', ')}`);
    const unexpected = files.filter(file => !allowed.includes(file));
    if (unexpected.length > 0)
        throw new Error(`Package contains unnecessary files: ${unexpected.join(', ')}`);
}
