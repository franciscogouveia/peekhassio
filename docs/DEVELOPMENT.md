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

Build and install the extension for the current user before starting the nested
GNOME 50 Wayland session:

```sh
npm run install:extension
dbus-run-session -- bash -c '
    secret_service_control_dir=$(mktemp -d \
        "${XDG_RUNTIME_DIR:-/tmp}/peekhassio-secret-service.XXXXXX")
    gnome-keyring-daemon \
        --foreground \
        --components=secrets \
        --control-directory="$secret_service_control_dir" &
    keyring_pid=$!

    trap "kill $keyring_pid 2>/dev/null" EXIT

    gnome-shell --devkit --wayland
'
```

The extension remains installed in the current user's extension directory. The
nested session provides a separate Shell process in which to run it, so an
extension failure does not take down the host Shell session.

Open a terminal inside the nested session, then enable the installed extension
and open its preferences:

```sh
gnome-extensions enable peekhassio@de-gouveia.eu
gnome-extensions prefs peekhassio@de-gouveia.eu
```

Peekhassio needs access to Secret Service to store Home Assistant tokens. Secret
Service starts locked in the nested session, so trigger its unlock prompt by
opening an instance in Peekhassio preferences and trying to save a token. After
you authenticate, Peekhassio can access the stored token.

The session may also use a different or temporary dconf environment, so use a
normal GNOME session for persistence acceptance testing.

### Manual test checklist

Exercise enable, disable, re-enable, configuration edits, and credential
replacement after live values appear. Treat Shell warnings, critical messages,
or coredumps as failures.

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
