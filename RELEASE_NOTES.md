# Peekhassio 1.0.1

Peekhassio 1.0.1 is a maintenance release of the feature-complete GNOME Shell
extension for viewing selected Home Assistant entity states in the top bar.

## Changes since 1.0.0

- Correctly preserve nested runtime module paths in the packaged extension.
- Accept packages where GNOME tooling compiles the settings schema at install
  time rather than embedding a generated schema cache.
- Tighten extension lifecycle cleanup for GNOME review and repeated
  enable/disable safety.
- Reorganize source modules by feature and presentation responsibility without
  changing configuration or runtime behavior.
- Update GitHub release automation for Node.js 24-based actions.
- Add project screenshots and a GitHub social preview.

## Features

- Configure multiple Home Assistant instances with long-lived access tokens
  stored in GNOME Secret Service.
- Create ordered top-bar groups with ordered entity IDs and optional unit
  overrides.
- Receive initial state and live updates through Home Assistant's authenticated
  WebSocket API.
- Preserve last-known values during interruptions and reconnect with bounded
  exponential backoff.
- Show compact degraded-state indicators with actionable details.
- Inspect full entity IDs, values, and locally received timestamps from each
  group's dropdown.
- Open the configured Home Assistant dashboard or Peekhassio settings from the
  group menu.
- Apply configuration and credential changes without restarting GNOME Shell.

## Compatibility

- GNOME Shell 50 only.
- Configuration schema version 1.
- Home Assistant instances should use HTTPS. Explicit local HTTP configuration
  remains available with an in-product transport warning.

## Security and stored data

- Long-lived access tokens are stored in GNOME Secret Service, not GSettings.
- Non-secret instances, groups, entities, ordering, unit overrides, and
  dashboard paths are stored in GSettings.
- Runtime errors redact tokens, authorization data, URLs, and entity values.
- Removing an instance through preferences removes its stored token. Merely
  uninstalling the extension does not promise removal of GSettings or Secret
  Service data.

## Upgrade and rollback

Upgrading from 1.0.0 or reinstalling 1.0.1 preserves configuration and tokens.
No configuration migration is required.

To roll back, install a previously validated archive with the same
configuration schema version. Disable the extension first if a runtime problem
prevents normal replacement. Secret Service tokens remain outside the extension
archive and should not need to be entered again.

## Known limitations

- Entity IDs are configured manually; entity discovery is not implemented.
- Only GNOME Shell 50 has been tested and is declared compatible.
- Nested `dbus-run-session` development sessions use isolated dconf and keyring
  environments; persistence must be evaluated in a normal desktop session.
- Native GNOME Shell lifecycle acceptance remains a manual release gate.

## Acceptance evidence

The release-candidate build at commit
`d20b460` was accepted on GNOME Shell 50.
The acceptance pass confirmed:

- all automated checks and tests;
- extension packaging and installation;
- end-to-end live values;
- configuration edits while connected;
- enable and disable behavior;
- expected credential warning states;
- no Shell crashes or critical errors; and
- configuration and token persistence across installs and upgrades.
