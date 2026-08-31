# Peekhassio 1.0.5

Peekhassio 1.0.5 is a corrective maintenance release of the feature-complete
GNOME Shell extension for viewing selected Home Assistant entity states in the
top bar.

## Changes since 1.0.4

- Remove the version query from the Soup runtime import in response to GNOME
  Extensions review feedback.
- Track every active GLib timeout source and remove outstanding sources during
  extension disable and before replacing the scheduler on enable.
- Add focused GJS coverage for timeout cancellation, scheduler destruction,
  and attempts to schedule work after destruction.
- Validate Home Assistant protocol messages before passing them to connection
  and entity-state consumers.
- Split contributor documentation into a focused development guide and record
  follow-up work for resilient entity-state parsing.

## Compatibility

- GNOME Shell 50 only.
- Configuration schema version 1.
- No configuration migration is required from earlier 1.0 releases.

## Security and stored data

- Long-lived access tokens remain in GNOME Secret Service, not GSettings.
- This release does not change permissions, network destinations,
  authentication, configuration storage, or stored-data formats.
- Upgrading or reinstalling preserves configuration and tokens.

## Upgrade and rollback

Install the 1.0.5 archive over the existing extension. To roll back, install a
previously validated archive with configuration schema version 1. Secret
Service tokens remain outside the extension archive.

## Known limitations

- Entity IDs are configured manually; entity discovery is not implemented.
- Only GNOME Shell 50 has been tested and is declared compatible.
- Nested `dbus-run-session` development sessions use isolated dconf and keyring
  environments.
- Native GNOME Shell lifecycle acceptance remains a manual release gate.

## Acceptance evidence

The preferences UI and extension lifecycle were manually exercised on GNOME
Shell 50 during the 1.0.4 cycle: native tabs, configuration operations, entity
management, close and reopen behavior, and rapid extension disable and
re-enable cycles worked without Peekhassio exceptions, critical messages, or
crashes. The 1.0.5 corrections specifically address the Soup import and timeout
ownership feedback from GNOME Extensions review.

Automated type checking, linting, tests, coverage thresholds, clean packaging,
and package import validation pass for the release candidate.
