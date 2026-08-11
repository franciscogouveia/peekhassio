# Backlog

Peekhassio is feature-complete. New product ideas belong in a post-release
milestone.

Version 1.0.1 and its release notes are prepared. The accepted build and manual
GNOME Shell 50 results are recorded in [RELEASE_NOTES.md](RELEASE_NOTES.md).

Release validation, packaging, GNOME review, and stored-data security checks are
complete. The distributable was installed and exercised on GNOME Shell 50,
including preferences, live values, configuration changes, credential states,
and repeated enable/disable behavior.

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
