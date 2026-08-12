# Peekhassio

Peekhassio is a GNOME Shell extension that displays selected Home Assistant
entity states directly in the GNOME top bar. It lets you peek at useful values
without opening the Home Assistant dashboard.

The name combines “peek” with “Hassio,” while sounding like “Picasso.”

Peekhassio 1.0.2 is feature-complete. It targets and has been manually tested
with GNOME Shell 50 only.

This GitHub repository is a public mirror of Peekhassio's source code. Report
bugs and feature requests by leaving a comment on Peekhassio's page on
[GNOME Shell Extensions](https://extensions.gnome.org/).

## Features

Peekhassio provides:

- Multiple Home Assistant instances, authenticated with long-lived access
  tokens.
- User-defined top-bar groups containing manually configured entity IDs.
- Ordered groups and entities.
- Optional per-entity unit overrides; otherwise Home Assistant's reported unit
  is used.
- Initial values and live updates through Home Assistant's authenticated
  [WebSocket API](https://developers.home-assistant.io/docs/api/websocket/).
- Isolation between instances, stale-value presentation, and automatic
  reconnection with bounded backoff.
- Immediate runtime updates after configuration or credential changes.
- Compact warning indicators with actionable details when an instance or entity
  is degraded.
- Group dropdowns showing full entity IDs, current or last-known values, and the
  time Peekhassio received each value.
- Icon actions for opening a group's configured Home Assistant dashboard and
  Peekhassio settings.

Group labels currently show the group name followed by its ordered entity
values and units:

```text
[Bathroom 27°C 50%] [Living room 25°C 45%]
```

The feature set intended for the first release is complete. Remaining release
validation and post-release engineering work are tracked in
[BACKLOG.md](BACKLOG.md).

See [RELEASE_NOTES.md](RELEASE_NOTES.md) for release contents, compatibility,
known limitations, upgrade behavior, and validation evidence.

## Requirements

- GNOME Shell 50
- A reachable Home Assistant instance
- A Home Assistant long-lived access token
- GNOME Secret Service, normally provided by GNOME Keyring

Building from source additionally requires Node.js 24, npm 11, `unzip`, and
the `gnome-extensions` command supplied by GNOME Shell tooling.

## Install from source

Clone the repository, then install the locked dependencies and the extension:

```sh
npm ci
npm run check
npm run install:extension
gnome-extensions enable peekhassio@de-gouveia.eu
```

Open the preferences with the Extensions application or:

```sh
gnome-extensions prefs peekhassio@de-gouveia.eu
```

The install command creates a clean extension archive before installing it for
the current user. A Shell session restart may be necessary when installing the
extension for the first time.

## Configure Peekhassio

1. Add a Home Assistant instance with a name, base URL, and long-lived access
   token.
2. Add a display group and assign it to an instance.
3. Use **Manage entities** on the group to add entity IDs in
   `domain.object_id` form.
4. Optionally override an entity's unit and reorder groups or entities.

Changes are saved immediately. Non-secret configuration is stored in GSettings;
access tokens are stored separately in GNOME Secret Service and never in the
configuration JSON.

Use an HTTPS base URL whenever possible. Configuring plain HTTP is allowed for
explicit local-network setups, but it does not protect credentials or Home
Assistant data in transit.

## Development and testing

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

## Troubleshooting

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

## Uninstall

Delete configured instances in preferences first if their stored tokens should
also be removed. Then disable and uninstall the extension:

```sh
gnome-extensions disable peekhassio@de-gouveia.eu
gnome-extensions uninstall peekhassio@de-gouveia.eu
```

Uninstalling the extension alone does not promise removal of GSettings data or
Secret Service items.

Peekhassio is licensed under [GPL-3.0-or-later](LICENSE).
