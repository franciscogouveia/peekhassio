# Peekhassio development

This guide covers local validation, GNOME Shell integration testing, and
debugging workflows. For the product overview, installation, and configuration
instructions, see the [README](../README.md).

## Prerequisites

Building Peekhassio requires Node.js 24, npm 11, `unzip`, and the
`gnome-extensions` command supplied by GNOME Shell tooling. Package, install,
and live Shell validation require a GNOME 50 development host.

Install the exact dependencies recorded in the lockfile:

```sh
npm ci
```

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
