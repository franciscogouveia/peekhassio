# Peekhassio 1.0.2

Peekhassio 1.0.2 is a maintenance release of the feature-complete GNOME Shell
extension for viewing selected Home Assistant entity states in the top bar.

## Changes since 1.0.1

- Prevent GNOME Shell from deadlocking when Peekhassio is disabled while a
  Home Assistant connection is active.
- Retain WebSocket lifecycle ownership until libsoup finishes its asynchronous
  close operation.
- Release panel and preferences widget state explicitly during teardown.
- Add native GJS regression coverage for WebSocket and cancellation lifecycle
  behavior.
- Add Shexli package analysis to tagged and manually dispatched GitHub release
  workflows.

## Compatibility

- GNOME Shell 50 only.
- Configuration schema version 1.
- No configuration migration is required from 1.0.0 or 1.0.1.

## Security and stored data

- Long-lived access tokens remain in GNOME Secret Service, not GSettings.
- This release does not change permissions, network destinations,
  authentication, configuration storage, or stored-data formats.
- Upgrading or reinstalling preserves configuration and tokens.

## Upgrade and rollback

Install the 1.0.2 archive over the existing extension. To roll back, install a
previously validated archive with configuration schema version 1. Secret
Service tokens remain outside the extension archive.

## Known limitations

- Entity IDs are configured manually; entity discovery is not implemented.
- Only GNOME Shell 50 has been tested and is declared compatible.
- Nested `dbus-run-session` development sessions use isolated dconf and keyring
  environments.
- Native GNOME Shell lifecycle acceptance remains a manual release gate.

## Acceptance evidence

The cancellation fix at commit `5a94bad` was accepted on GNOME Shell 50. Rapid
disable and re-enable cycles with an active Home Assistant connection no longer
freeze GNOME Shell. Automated tests, coverage, packaging, and Shexli validation
also pass for the release candidate.
