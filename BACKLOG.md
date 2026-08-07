# Backlog

Items are ordered by the dependency sequence for the first usable release.

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

## Implement the Home Assistant WebSocket client

- Connect to each configured instance over its WebSocket endpoint.
- Authenticate with the corresponding Secret Service token.
- Use HTTPS/WSS by default and honor only explicitly configured local HTTP.
- Apply bounded connection and request timeouts.
- Validate every protocol message before exposing it to extension state.
- Handle unreachable hosts, authentication rejection, malformed messages, and
  cancellation without logging URLs, tokens, headers, or entity state.
- Keep transport and protocol boundaries deterministic and testable without a
  live Home Assistant server.

## Subscribe to configured entity states

- Request initial states for the entity IDs used by enabled configuration.
- Subscribe to state changes and update only affected entities and groups.
- Preserve configured entity and group order independently of message order.
- Apply unit overrides and otherwise use Home Assistant's unit of measurement.
- Define display behavior for unavailable, unknown, missing, and malformed
  entities.
- Share one connection and subscription set per configured instance.

## Model runtime and stale state

- Derive immutable view state from configuration and validated Home Assistant
  events.
- Preserve the last known values during temporary disconnections.
- Mark interrupted or outdated values as stale without presenting them as
  current.
- Keep one instance's failure isolated from groups belonging to other
  instances.
- Cover transitions for connecting, ready, stale, authentication failure, and
  recovery.

## Render groups in the GNOME top bar

- Add compact group pills in configured order.
- Show the group name followed by ordered entity values and units.
- Keep labels readable for empty, missing, unavailable, and stale values.
- Update existing actors instead of rebuilding the complete panel for every
  entity event.
- Follow GNOME Shell 50 and GNOME HIG conventions, including accessibility and
  keyboard behavior.
- Capture screenshots or a short recording for visual review.

## Open configured dashboards

- Open the group's dashboard URL when its pill is activated.
- Resolve the configured path against the assigned instance URL using the
  existing validated URL boundary.
- Route activation through a synchronous signal callback and tested error
  boundary.
- Show a user-visible error, with a logging fallback, when launching fails.

## Reconnect resiliently

- Reconnect automatically after network interruption or Home Assistant restart.
- Use bounded exponential backoff with jitter and avoid retry storms.
- Stop retries for authentication failures until credentials change.
- Resubscribe and reconcile current state after reconnecting.
- Cancel connections, requests, subscriptions, timers, and retries during
  `disable()`.

## Complete the extension lifecycle

- Initialize all Shell-process state in `enable()`.
- Make `disable()` and re-enable safe after partial startup and runtime errors.
- React to relevant configuration changes without requiring a Shell restart.
- Remove actors, signals, GLib sources, network work, and references on disable.
- Verify that preferences-process modules never enter the Shell process and
  Shell-only modules never enter preferences.

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

- Update the README so implemented and planned behavior are clearly separated.
- Document configuration, token storage, local HTTP risks, troubleshooting,
  installation, and uninstall behavior.
- Review runtime dependencies, permissions, stored data, and extension review
  requirements.
- Add release notes and rollback guidance.
- Perform a final clean package install and GNOME Shell 50 acceptance pass.
