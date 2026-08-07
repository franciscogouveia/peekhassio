# Backlog

Peekhassio is feature-complete for its first release. Work before release is
limited to validation, security review, packaging, and release documentation.
New product ideas belong in a post-release milestone.

## Complete the GNOME Shell 50 acceptance pass

- Install the clean packaged archive rather than testing only `src/` or `dist/`.
- Configure multiple instances, tokens, groups, ordered entities, unit
  overrides, and dashboard paths.
- Verify initial values, live updates, receipt times, warnings, stale values,
  reconnection, and recovery.
- Exercise every group menu state and both Dashboard and Settings actions with
  mouse and keyboard input.
- Save instance, group, entity, and token changes while authenticated entity
  connections are active.
- Repeat enable, disable, and re-enable after live values appear.
- Test partial startup, unreachable Home Assistant, authentication rejection,
  malformed responses, and cancellation during disable.
- Treat Shell exits, coredumps, new warnings or critical messages, leaked
  timers, and lingering signal handlers as release failures.
- Capture the GNOME Shell version, packaged commit, commands, results, and
  visual evidence.

Use a nested Wayland session with its own Secret Service provider as documented
in the README. Also run persistence acceptance checks in a normal desktop
session because isolated devkit sessions do not share its dconf or keyring.

## Validate the distributable artifact

- Start from `npm ci` and a clean generated-artifact state.
- Run `npm test`, `npm run check`, and `npm run package`.
- Recursively verify that every relative runtime import exists in the archive.
- Confirm that generated JavaScript remains readable, unbundled ESM suitable
  for GJS and extensions.gnome.org review.
- Install the resulting archive on GNOME Shell 50 and open its preferences
  independently from the Shell process.
- Verify install, upgrade, disable, re-enable, and uninstall workflows.

## Complete security and stored-data review

- Confirm that tokens appear only in GNOME Secret Service and never in
  GSettings, configuration JSON, logs, archives, fixtures, or error messages.
- Save, replace, and remove tokens with a live GNOME keyring.
- Verify missing, locked, and unavailable Secret Service behavior.
- Confirm that every network and protocol error remains redacted.
- Review HTTPS defaults and the explicit warning for local HTTP connections.
- Document what uninstalling removes and what remains in GSettings or Secret
  Service.
- Review extension permissions, dependencies, runtime imports, and GNOME Shell
  extension-review requirements.

## Prepare the first release

- Choose the first release version and update version-bearing metadata
  consistently.
- Update the README only if acceptance testing changes supported behavior or
  installation guidance.
- Add release notes covering features, GNOME Shell compatibility, security,
  stored data, known limitations, upgrade behavior, and rollback guidance.
- Create the final archive from a clean checkout and record its checksum.
- Perform one final archive install and GNOME Shell 50 acceptance pass before
  publishing.

## Post-release engineering

### Improve automated native integration testing

- Evaluate a GJS/libsoup integration suite using a deterministic mocked Home
  Assistant WebSocket server.
- Evaluate a dedicated GNOME Shell 50 runner or VM for packaged extension
  lifecycle and native actor testing.
- Keep the documented manual acceptance gate until automated coverage can
  detect Shell crashes, coredumps, warnings, and leaked native resources.

### Investigate isolated devkit persistence

- Determine whether dconf writes are lost or intentionally isolated when the
  complete `dbus-run-session` development environment exits.
- Verify instances, groups, and entities across repeated devkit sessions.
- Add settings synchronization only if testing proves pending writes are lost;
  preserve existing error handling.
- Confirm separately that reinstalling the extension in a normal desktop
  session does not reset configuration.
