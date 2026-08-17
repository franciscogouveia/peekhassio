# Peekhassio development

This guide covers the source layout, local validation, GNOME Shell integration
testing, and debugging workflows. For the product overview, installation, and
configuration instructions, see the [README](../README.md).

## Prerequisites

Building Peekhassio requires Node.js 24, npm 11, `unzip`, and the
`gnome-extensions` command supplied by GNOME Shell tooling. Package, install,
and live Shell validation require a GNOME 50 development host.

Install the exact dependencies recorded in the lockfile:

```sh
npm ci
```

## Source architecture

Source modules are organized by feature and named for their architectural
role:

- `configuration.ts` defines domain validation and immutable model changes.
- `view-model.ts` derives presentation-only state without creating widgets.
- `preferences-view.ts` creates GTK/Adwaita widgets and binds their native
  signals to feature actions.
- `prefs.ts` is the preferences entry point and coordinator for storage,
  navigation, recovery, and shared error handling.
- `panel-view-model.ts` derives the top-bar and menu presentation state.
- `panel-shell-view.ts` creates the Shell widgets and binds their native
  signals.
- `panel-controller.ts` owns panel reconciliation, actions, and widget
  lifecycle.
- `extension.ts` and `runtime/` coordinate the Shell process; panel modules
  remain under `groups/` and never import preferences-process libraries.

This is a feature-oriented separation of model, view model, view, and
coordination responsibilities, not a claim that every feature implements a
formal MVC framework.

## Build and validation

The primary local workflows are:

```sh
npm test
npm run check
npm run build
npm run package
```

`npm run check` performs strict type-checking, linting, and coverage validation.
Aggregate line, branch, and function coverage must remain above 80%. Generated
JavaScript is written to `dist/`; `npm run package` creates
`peekhassio@de-gouveia.eu.shell-extension.zip`.

Tags mirrored to GitHub trigger the GitHub Actions release workflow. It runs the
complete Node and GJS checks, packages the tagged commit, analyzes the archive
with a pinned Shexli version, creates a SHA-256 checksum, and publishes both
files in a GitHub Release. Rerunning the workflow replaces the existing release
assets instead of creating a duplicate release. The workflow can also be run
manually to validate checks, packaging, and Shexli without publishing a release.

## GNOME Shell integration testing

Test authenticated Shell integration in a nested GNOME 50 Wayland session with
a dedicated Secret Service provider:

```sh
dbus-run-session -- bash -c '
    keyring_dir=$(mktemp -d "${XDG_RUNTIME_DIR:-/tmp}/peekhassio-keyring.XXXXXX")
    gnome-keyring-daemon \
        --foreground \
        --components=secrets \
        --control-directory="$keyring_dir" &
    keyring_pid=$!

    trap "kill $keyring_pid 2>/dev/null" EXIT

    gnome-shell --devkit --wayland
'
```

The dedicated keyring makes token storage available inside the isolated D-Bus
session; it does not expose tokens from the normal desktop session. Configure
test credentials through the nested session's preferences. The session may
also use a different or temporary dconf environment, so persistent devkit
configuration behavior remains under investigation. Use a normal GNOME session
for persistence acceptance testing.

Before merging runtime changes, manually exercise enable, disable, re-enable,
configuration edits, and credential replacement after live values appear.
Treat Shell warnings, critical messages, or coredumps as failures.

## Debugging

If groups show an authentication error, confirm that every referenced instance
has its own token in preferences. Tokens are not shared between instances.

If storing or reading a token fails, verify that Secret Service is available in
the same D-Bus session:

```sh
gdbus call --session \
    --dest org.freedesktop.secrets \
    --object-path /org/freedesktop/secrets \
    --method org.freedesktop.DBus.Peer.Ping
```

Inspect Shell logs without printing tokens, URLs, authorization headers, or
entity state:

```sh
journalctl -f _COMM=gnome-shell
```

Release validation and post-release engineering work are tracked in
[BACKLOG.md](../BACKLOG.md).
