const REQUIRED_TEXT_FIELDS = ['uuid', 'name', 'description', 'url'];

export function validateMetadata(metadata) {
    if (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata)) {
        return ['metadata must be an object'];
    }

    const errors = [];

    for (const field of REQUIRED_TEXT_FIELDS) {
        if (typeof metadata[field] !== 'string' || metadata[field].trim() === '') {
            errors.push(`${field} must be a non-empty string`);
        }
    }

    if (metadata.uuid !== 'peekhassio@de-gouveia.eu') {
        errors.push('uuid must be peekhassio@de-gouveia.eu');
    }

    if (metadata['settings-schema'] !== 'org.gnome.shell.extensions.peekhassio') {
        errors.push('settings-schema must be org.gnome.shell.extensions.peekhassio');
    }

    if (!Array.isArray(metadata['shell-version'])
        || metadata['shell-version'].length !== 1
        || metadata['shell-version'][0] !== '50') {
        errors.push('shell-version must contain only GNOME Shell 50');
    }

    return errors;
}

export function assertMetadata(metadata) {
    const errors = validateMetadata(metadata);

    if (errors.length > 0) {
        throw new Error(`Invalid metadata:\n- ${errors.join('\n- ')}`);
    }
}
