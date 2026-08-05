# Peekhassio

Peekhassio is a GNOME Shell extension for viewing Home Assistant entity states
directly in the GNOME top bar. It lets you peek at useful information without
opening the Home Assistant dashboard.

The name combines “peek” (to look into) with “Hassio” (a short name for Home
Assistant), while sounding like “Picasso.”

> [!IMPORTANT]
> Peekhassio is in its initial development stage. The functionality below
> describes the planned minimum viable product and is not implemented yet.

## Planned functionality

Peekhassio will organize selected Home Assistant entities into compact,
pill-like room groups on the top bar:

```text
[Bathroom 27°C 50%] [Living room 25°C 45%] [Bedroom 26°C 46%]
```

The first usable version will provide:

- User-defined rooms containing any Home Assistant entity states.
- Compact room pills showing the room name followed by values and units.
- Per-entity unit overrides. When no override is configured, Peekhassio uses
  the unit reported by Home Assistant.
- Manual ordering of rooms through the extension preferences.
- Support for multiple Home Assistant instances. Each room belongs to one
  configured instance, while the top bar may show rooms from several instances.
- A configurable Home Assistant dashboard or view URL for each room. Clicking
  a room pill opens that URL.
- Real-time values delivered through Home Assistant's authenticated
  [WebSocket API](https://developers.home-assistant.io/docs/api/websocket/).
- Automatic reconnection when an instance becomes unavailable. During an
  interruption, the last known values remain visible and are marked as stale.

## Configuration and security

Peekhassio's preferences will manage Home Assistant instances, rooms, entity
selection, unit overrides, display order, and room URLs. Each instance will
authenticate with a long-lived access token stored through GNOME Secret Service
rather than in plaintext configuration.

## Technical direction

Peekhassio initially targets GNOME Shell 50. The extension is written in strict
TypeScript and compiled to readable ES module JavaScript for GJS.

## Development

The local quality and build workflows require Node.js 24 and npm 11. Packaging,
installation, and live testing additionally require GNOME Shell 50 and its
`gnome-extensions` command.

```sh
npm ci
npm run check
```

`npm run check` runs strict type-checking, linting, tests with coverage above
80%, and a clean build. Generated extension files are written to `dist/`.
GitLab CI runs the same quality gate for merge requests and `main`, reports the
line coverage, and retains the generated `dist/` directory for one week.

On a GNOME development machine, package and install the extension with:

```sh
npm run package
npm run install:extension
```

The package and install commands cannot be validated on a host without GNOME
Shell tooling.

Peekhassio is licensed under [GPL-3.0-or-later](LICENSE).
