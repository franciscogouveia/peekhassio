# Repository Guidelines

## Project Overview

Peekhassio is a GNOME Shell extension that shows Home Assistant sensor data in
the GNOME top bar. The name is wordplay combining “peek” (to look into) and
“Hassio” (a short name for Home Assistant), while sounding like “Picasso.” The
extension lets users peek at sensor data without opening the Home Assistant
dashboard.

The repository is in its initial setup phase. Keep this document aligned with
the commands and structure that actually exist as the project grows. Do not
describe planned tooling as available until it has been added and verified.

The initial compatibility target is GNOME Shell 50. Do not claim support for a
GNOME Shell version unless it has been tested and is listed in `metadata.json`.

## Project Structure

The extension will use TypeScript as its source language and compile to
JavaScript that GJS can execute. Use the following layout when the project is
scaffolded:

- `src/` contains TypeScript source files, including the extension and any
  preferences entry points.
- `schemas/` contains GSettings schema XML files.
- `assets/` contains source-controlled icons and other static resources.
- `tests/` contains automated tests that do not require a live Shell session.
- `dist/` contains generated, installable JavaScript and packaged resources.

Treat `dist/`, compiled schemas, extension archives, coverage output, and
dependency directories as generated artifacts. Do not commit them unless a
future release process explicitly requires a tracked artifact.

## Build, Test, and Development Commands

There are no build, test, lint, package, or install commands yet. When the
extension is scaffolded, expose the canonical workflows as npm scripts so local
development and CI use the same entry points:

- `npm ci` installs the exact dependencies recorded in the lockfile.
- `npm run typecheck` performs a strict TypeScript check without emitting files.
- `npm run lint` checks source and test style without rewriting files.
- `npm run build` compiles TypeScript into readable ESM JavaScript under
  `dist/`.
- `npm test` runs the automated test suite.
- `npm run package` creates the extension archive from a clean build.
- `npm run install` installs the built extension for the current user.

Do not document a command here until its script exists and succeeds. Before
submitting a change, run every relevant command and report exactly what ran.

Test Shell integration in a nested Wayland session. GNOME Shell 49 and later
use `dbus-run-session gnome-shell --devkit --wayland`. Enable the installed
extension with `gnome-extensions enable <uuid>` and inspect Shell logs for
warnings and errors. Replace `<uuid>` with the UUID declared in
`metadata.json` once it exists.

## Coding Style and Naming Conventions

- Write strict TypeScript and compile it with `tsc`. Use `@girs` packages for
  GJS, GNOME Shell, and GI type information.
- Emit modern ES modules for GJS. Do not use CommonJS, Node.js runtime APIs, or
  browser-only APIs in extension code.
- Keep generated JavaScript readable and unminified. Do not bundle or obfuscate
  code submitted to extensions.gnome.org.
- Use four spaces for indentation, semicolons, single quotes, and trailing
  commas where the configured formatter or linter permits them.
- Use `PascalCase` for classes and GObject types, `camelCase` for variables and
  functions, and `UPPER_SNAKE_CASE` for module-level constants.
- Keep Shell-process code separate from preferences-process code. Never import
  `Gtk`, `Gdk`, or `Adw` into the Shell process, and never import `Clutter`,
  `Meta`, `St`, or `Shell` into the preferences process.
- Initialize runtime state in `enable()`. In `disable()`, disconnect signals,
  remove GLib sources, destroy widgets, cancel pending work, and release
  references so repeated enable/disable cycles remain safe.
- Prefer documented public GNOME Shell APIs. If a private Shell API is
  unavoidable, isolate it, explain why, and cover it with a compatibility test.
- Keep functions small, deterministic where possible, and focused on one
  meaningful responsibility. Keep code that changes together close together.
- Follow established development practices without over-engineering. Introduce
  an abstraction only when it removes real duplication, isolates a meaningful
  boundary, or makes behavior easier to test and understand.
- Keep comments focused on constraints and non-obvious intent rather than
  restating the code.

## Testing Guidelines

- Add automated coverage for parsing, state transformation, error handling, and
  other logic that can run without GNOME Shell.
- Maintain aggregate line and branch coverage above 80%. Coverage must come
  from meaningful assertions against business behavior, not tests written only
  to execute lines.
- Avoid over-mocking. Prefer real domain objects and deterministic boundaries,
  and include at least one counter-example for every changed behavior to prove
  that invalid or opposite cases are handled correctly.
- Exercise enable, disable, and re-enable behavior in a nested Shell session.
- Test Home Assistant being unreachable, authentication failing, responses
  being malformed, and requests being cancelled during disable.
- Verify preferences independently from the Shell process when preferences are
  introduced.
- Treat new Shell warnings, critical messages, leaked timers, and lingering
  signal handlers as failures.
- For UI changes, test the supported Shell version and include screenshots or a
  short recording in the merge request when visual behavior matters.

## Commit and Merge Request Guidelines

The main branch is `main`, and `origin` is the canonical remote. The repository
was bootstrapped with one initial commit directly on `main`; that is a one-time
exception. For every subsequent commit:

1. Update local knowledge of `origin/main`.
2. Create a fresh typed branch from `main`, such as `feat/panel-menu`,
   `fix/auth-error`, `docs/development-guide`, or `chore/tooling`.
3. Confirm the current branch is not `main` before committing.
4. Never push directly to `main`; submit a merge request instead.

Use Conventional Commits, for example `feat: add entity status menu` or
`fix: cancel requests when disabled`. Keep commits focused and avoid mixing
unrelated refactors with behavior changes.

Before every commit and push, run the complete test, lint, type-check, and
coverage workflows. All checks must pass, and aggregate line and branch
coverage must remain above 80%. If the repository does not yet provide one of
these workflows, document that limitation rather than claiming it passed, and
add the missing workflow before committing production code.

Keep each merge request at or below 400 changed lines, measured as additions
plus deletions across the complete diff, including tests and documentation.
Keep the change focused on a single purpose. If it would exceed 400 lines,
split it into independently safe, non-breaking iterations that keep the project
working and tests passing after every merge.

Merge requests must include the purpose, affected extension behavior, supported
GNOME Shell version, validation commands and results, and any rollout or
rollback notes. Include UI evidence for visual changes and call out changes to
permissions, network access, authentication, settings schemas, or stored data.

## Security and Configuration

- Never commit Home Assistant tokens, private keys, generated secrets, private
  instance URLs, or captured user data. Use documented local-only placeholders
  in examples and fixtures.
- Never print credentials, authorization headers, or sensitive entity state to
  Shell logs. Redact diagnostic output by default.
- When credential persistence is implemented, use GNOME Secret Service rather
  than plaintext files or GSettings values. GSettings may hold non-secret
  preferences such as display options or a user-approved instance URL.
- Use HTTPS for Home Assistant connections by default. Any insecure local HTTP
  option must be explicit and clearly communicated to the user.
- Validate remote data before presenting it in the Shell UI, use bounded
  timeouts, and ensure network work can be cancelled during `disable()`.
- Minimize dependencies and review lockfile changes. Extension runtime behavior
  must not download or execute third-party code.
- Follow the GNOME Shell extension review guidelines and GNOME Human Interface
  Guidelines for distributable changes.
