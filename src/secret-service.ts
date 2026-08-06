import Gio from 'gi://Gio';
import Secret from 'gi://Secret';

import type { CredentialBackend } from './credential-store.js';

Gio._promisify(Secret, 'password_clear', 'password_clear_finish');
Gio._promisify(Secret, 'password_lookup', 'password_lookup_finish');
Gio._promisify(Secret, 'password_store', 'password_store_finish');

const SCHEMA = Secret.Schema.new(
    'eu.de-gouveia.Peekhassio.HomeAssistant',
    Secret.SchemaFlags.NONE,
    { instance: Secret.SchemaAttributeType.STRING },
);

function attributes(instanceId: string): { [key: string]: string } {
    return { instance: instanceId };
}

export class SecretServiceBackend implements CredentialBackend {
    async has(instanceId: string): Promise<boolean> {
        return await Secret.password_lookup(SCHEMA, attributes(instanceId), null) !== null;
    }

    async load(instanceId: string): Promise<string | null> {
        return await Secret.password_lookup(SCHEMA, attributes(instanceId), null);
    }

    async store(instanceId: string, token: string): Promise<boolean> {
        return await Secret.password_store(
            SCHEMA,
            attributes(instanceId),
            Secret.COLLECTION_DEFAULT,
            `Peekhassio Home Assistant token (${instanceId})`,
            token,
            null,
        );
    }

    async clear(instanceId: string): Promise<void> {
        await Secret.password_clear(SCHEMA, attributes(instanceId), null);
    }
}
