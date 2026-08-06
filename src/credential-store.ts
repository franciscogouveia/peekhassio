export interface CredentialBackend {
    has(instanceId: string): boolean;
    store(instanceId: string, token: string): boolean;
    clear(instanceId: string): void;
}

export class CredentialStore {
    readonly #backend: CredentialBackend;

    constructor(backend: CredentialBackend) {
        this.#backend = backend;
    }

    hasToken(instanceId: string): boolean {
        try {
            return this.#backend.has(instanceId);
        }
        catch {
            throw new Error('Could not read the access token from Secret Service.');
        }
    }

    saveToken(instanceId: string, token: string): void {
        if (token.trim() === '')
            throw new Error('Access token must not be blank.');
        try {
            if (!this.#backend.store(instanceId, token.trim()))
                throw new Error();
        }
        catch {
            throw new Error('Could not save the access token in Secret Service.');
        }
    }

    clearToken(instanceId: string): void {
        try {
            this.#backend.clear(instanceId);
        }
        catch {
            throw new Error('Could not remove the access token from Secret Service.');
        }
    }
}
