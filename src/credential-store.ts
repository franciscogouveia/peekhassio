export interface CredentialBackend {
    has(instanceId: string): Promise<boolean>;
    load(instanceId: string): Promise<string | null>;
    store(instanceId: string, token: string): Promise<boolean>;
    clear(instanceId: string): Promise<void>;
}

export class CredentialStore {
    readonly #backend: CredentialBackend;

    constructor(backend: CredentialBackend) {
        this.#backend = backend;
    }

    async hasToken(instanceId: string): Promise<boolean> {
        try {
            return await this.#backend.has(instanceId);
        }
        catch {
            throw new Error('Could not read the access token from Secret Service.');
        }
    }

    async loadToken(instanceId: string): Promise<string> {
        try {
            const token = await this.#backend.load(instanceId);
            if (token === null || token.trim() === '')
                throw new Error();
            return token.trim();
        }
        catch {
            throw new Error('Could not read the access token from Secret Service.');
        }
    }

    async saveToken(instanceId: string, token: string): Promise<void> {
        if (token.trim() === '')
            throw new Error('Access token must not be blank.');
        try {
            if (!await this.#backend.store(instanceId, token.trim()))
                throw new Error();
        }
        catch {
            throw new Error('Could not save the access token in Secret Service.');
        }
    }

    async clearToken(instanceId: string): Promise<void> {
        try {
            await this.#backend.clear(instanceId);
        }
        catch {
            throw new Error('Could not remove the access token from Secret Service.');
        }
    }
}
