# Backlog

Peekhassio is feature-complete for its first release. Work before release is
limited to validation, security review, packaging, and release documentation.
New product ideas belong in a post-release milestone.

Version 1.0.0 and its release notes are prepared. The accepted feature build and
manual GNOME Shell 50 results are recorded in
[RELEASE_NOTES.md](RELEASE_NOTES.md). The GNOME Shell 50 acceptance pass is
complete.

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

- Review the prepared 1.0.0 release notes against the final accepted archive.
- Update the README only if final acceptance testing changes supported behavior
  or installation guidance.
- Create the final archive from a clean checkout and record its checksum.

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
