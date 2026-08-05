import { URL } from 'node:url';
export function resolve(specifier, context, nextResolve) {
    if (specifier === 'gi://GLib')
        return { url: new URL('./glib.mjs', import.meta.url).href, shortCircuit: true };

    return nextResolve(specifier, context);
}
