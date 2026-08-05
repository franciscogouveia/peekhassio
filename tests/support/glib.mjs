import { URL } from 'node:url';
class Uri {
    #url;

    constructor(url) {
        this.#url = url;
    }

    static parse(value) {
        return new Uri(new URL(value));
    }

    static resolve_relative(baseUrl, path) {
        return new URL(path, baseUrl).href;
    }

    get_fragment() {
        return this.#url.hash === '' ? null : this.#url.hash.slice(1);
    }

    get_host() {
        return this.#url.hostname === '' ? null : this.#url.hostname;
    }

    get_query() {
        return this.#url.search === '' ? null : this.#url.search.slice(1);
    }

    get_scheme() {
        return this.#url.protocol.slice(0, -1);
    }
}
export default {
    Uri,
    UriFlags: { NONE: 0 },
};
