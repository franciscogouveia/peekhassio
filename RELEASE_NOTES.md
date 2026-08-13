# Peekhassio 1.0.3

Peekhassio 1.0.3 is a maintenance release of the feature-complete GNOME Shell
extension for viewing selected Home Assistant entity states in the top bar.

## Changes since 1.0.2

- Remove Peekhassio's dependency on the deprecated `Adw.PreferencesWindow`
  API by returning a host-independent preferences widget.
- Preserve separate Instances and Groups tabs with current Libadwaita view
  switcher and view stack widgets.
- Expand preferences content to use the available window width and height.
- Present extension-owned preferences and alert dialogs relative to the
  returned widget.
- Add regression coverage that prevents the deprecated window-specific API
  from being reintroduced.

## Compatibility

- GNOME Shell 50 only.
- Configuration schema version 1.
- No configuration migration is required from 1.0.0, 1.0.1, or 1.0.2.

## Security and stored data

- Long-lived access tokens remain in GNOME Secret Service, not GSettings.
- This release does not change permissions, network destinations,
  authentication, configuration storage, or stored-data formats.
- Upgrading or reinstalling preserves configuration and tokens.

## Upgrade and rollback

Install the 1.0.3 archive over the existing extension. To roll back, install a
previously validated archive with configuration schema version 1. Secret
Service tokens remain outside the extension archive.

## Known limitations

- Entity IDs are configured manually; entity discovery is not implemented.
- Only GNOME Shell 50 has been tested and is declared compatible.
- Nested `dbus-run-session` development sessions use isolated dconf and keyring
  environments.
- Native GNOME Shell lifecycle acceptance remains a manual release gate.

## Acceptance evidence

The preferences migration was accepted on GNOME Shell 50. Manual testing
confirmed that both tabs open and switch correctly; instance, group, and entity
operations work; preferences close and reopen safely; and rapid extension
disable and re-enable cycles do not crash GNOME Shell. No JavaScript exception,
critical message, or Peekhassio-specific error was observed. The remaining
preferences-launch warnings came from GNOME Shell's deprecated preferences host;
XKB and IBus messages were unrelated to Peekhassio.

Automated type checking, linting, tests, coverage thresholds, clean packaging,
and package import validation also pass for the release candidate.
