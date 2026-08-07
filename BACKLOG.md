# Backlog

Peekhassio has reached its initial MVP: configured Home Assistant entity values
are displayed in the GNOME top bar. Items are ordered by the next development
sequence; dashboard navigation is an enhancement rather than an MVP requirement.

## Document the MVP

- Update the README to describe the implemented extension rather than an
  initial-development project.
- Clearly separate current behavior, planned enhancements, and known
  development-environment limitations.
- Document configuration, Secret Service token storage, runtime status, local
  HTTP risks, installation, troubleshooting, and uninstall behavior.

## Polish top-bar group presentation

- Vertically center group labels within the GNOME top bar.
- Keep the group name and ordered entity values compact.
- Replace every value without an initial reading with `N/A`.
- Show a yellow warning icon beside the group name whenever the group is
  degraded, including authentication, connectivity, stale, missing, unknown,
  and unavailable conditions.
- Do not put verbose warning messages directly in the top bar.

## Track received value timestamps

- Record when Peekhassio receives each initial state or state-change event.
- Preserve the last received value and timestamp when Home Assistant becomes
  unreachable or the connection becomes stale.
- Use `N/A` for both value and timestamp until Peekhassio has received an
  initial value.
- Keep timestamps as runtime state; do not infer them from Home Assistant's
  `last_updated` field.

## Add a group details menu

- Open a dropdown below a group when its top-bar item is activated.
- Show the full warning message at the top whenever the group is degraded.
- List entities in configured order with their full entity ID, current or last
  known value, and the time Peekhassio received that value.
- Preserve last known entity details during outages and show `N/A` when no
  initial value has been received.
- Include a button that opens the group's configured dashboard URL.
- Resolve the configured path against the assigned instance URL through the
  existing validated URL boundary.
- Route menu activation and dashboard launch failures through synchronous
  signal callbacks and the tested Shell error boundary.
- Follow GNOME Shell 50 and GNOME HIG conventions, including accessibility and
  keyboard behavior, and capture visual evidence for review.

## Persist settings across devkit sessions

Investigate and fix configuration loss after stopping and restarting a nested
GNOME Shell session launched with:

```sh
dbus-run-session gnome-shell --devkit --wayland
```

Instances, groups, and entities are stored together in the
`configuration-json` GSettings key. Determine whether its pending dconf write is
lost when the temporary D-Bus session shuts down. If so, synchronize GSettings
after successful saves without weakening normal error handling.

Acceptance criteria:

- Configure an instance, group, and entity in a devkit session.
- Stop the complete nested session and start a new one.
- Confirm that the configuration remains unchanged.
- Cover successful synchronization and synchronization failures at the tested
  settings boundary.
- Confirm that reinstalling the extension does not reset the configuration.

## Validate Secret Service integration on GNOME 50

- Save, replace, and remove a token with a live GNOME keyring.
- Confirm that tokens persist across preferences and login sessions without
  appearing in GSettings, configuration JSON, or logs.
- Verify missing, locked, and unavailable Secret Service behavior.
- Document the expected limitations of isolated devkit D-Bus sessions.

## Expand native GNOME integration testing

- Exercise preferences dialogs and native widget signals on GNOME Shell 50.
- Cover successful actions, validation, cancellation, unexpected exceptions,
  and failed error reporting from the signal boundary.
- Exercise enable, disable, and re-enable with an authenticated Home Assistant
  connection after live entity values have appeared.
- Save instance, group, and entity changes while that connection is active and
  verify that runtime restart and native WebSocket teardown remain safe.
- Exercise dashboard activation in a devkit Wayland session.
- Treat new warnings, critical messages, leaked timers, and lingering signal
  handlers as failures, and inspect the journal and coredumps after each run.

## Validate the distributable artifact

- Build the extension archive from a clean dependency installation.
- Recursively verify every relative runtime import is included.
- Install the archive on GNOME Shell 50 rather than testing only `src/` or
  `dist/`.
- Open and interact with installed preferences and run the full Shell lifecycle.
- Record the exact supported Shell version in `metadata.json` only after the
  validation succeeds.

## Prepare the first release

- Review runtime dependencies, permissions, stored data, and extension review
  requirements.
- Add release notes and rollback guidance.
- Perform a final clean package install and GNOME Shell 50 acceptance pass.
