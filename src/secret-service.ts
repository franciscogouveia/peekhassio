import Secret from 'gi://Secret';

import type { CredentialBackend } from './credential-store.js';

const SCHEMA = Secret.Schema.new(
    'eu.de-gouveia.Peekhassio.HomeAssistant',
    Secret.SchemaFlags.NONE,
    { instance: Secret.SchemaAttributeType.STRING },
);

function attributes(instanceId: string): { [key: string]: string } {
    return { instance: instanceId };
}

export class SecretServiceBackend implements CredentialBackend {
    has(instanceId: string): boolean {
        return Secret.password_lookup_sync(SCHEMA, attributes(instanceId), null) !== null;
    }

    store(instanceId: string, token: string): boolean {
        return Secret.password_store_sync(
            SCHEMA,
            attributes(instanceId),
            Secret.COLLECTION_DEFAULT,
            `Peekhassio Home Assistant token (${instanceId})`,
            token,
            null,
        );
    }

    clear(instanceId: string): void {
        Secret.password_clear_sync(SCHEMA, attributes(instanceId), null);
    }
}
