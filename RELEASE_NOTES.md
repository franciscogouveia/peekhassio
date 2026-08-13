# Peekhassio 1.0.4

Peekhassio 1.0.4 is a corrective maintenance release of the feature-complete
GNOME Shell extension for viewing selected Home Assistant entity states in the
top bar.

## Changes since 1.0.3

- Use the `fillPreferencesWindow()` entry point required for GNOME Shell 45+
  and resolve EGO review warning `EGO-C45-001`.
- Restore native `Adw.PreferencesPage` tabs managed by the GNOME preferences
  host.
- Preserve the active preferences tab when configuration changes rebuild its
  contents, including when display groups are reordered.
- Remove the custom view switcher, view stack, and nested scrolling layout.
- Add regression coverage for the supported entry point, native tabs, and
  active-tab preservation.

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

Install the 1.0.4 archive over the existing extension. To roll back, install a
previously validated archive with configuration schema version 1. Secret
Service tokens remain outside the extension archive.

## Known limitations

- Entity IDs are configured manually; entity discovery is not implemented.
- Only GNOME Shell 50 has been tested and is declared compatible.
- Nested `dbus-run-session` development sessions use isolated dconf and keyring
  environments.
- Native GNOME Shell lifecycle acceptance remains a manual release gate.

## Acceptance evidence

The preferences UI was manually exercised on GNOME Shell 50 during the 1.0.3
cycle: native tabs, configuration operations, entity management, close and
reopen behavior, and rapid extension disable and re-enable cycles worked
without Peekhassio exceptions, critical messages, or crashes. The 1.0.4
correction specifically addresses the EGO upload warning and the reported tab
selection regression after reordering display groups.

Automated type checking, linting, tests, coverage thresholds, clean packaging,
and package import validation pass for the release candidate.
