## Why

Spectra moves parked changes into the git directory, so they are invisible in a file tree, and the JetBrains plugin idea-spectra-viewer that lists them only helps inside an IDE. People who work in the Herdr desktop app (herdr-app) need the same overview of Active, Parked and Archived changes, with one-click `/spectra-*` commands, beside the terminals where their agents run.

## What Changes

- New herdr-app mod `spectra-viewer` (folder mods/spectra-viewer) with three roles chosen by `props().role`: the change panel (no role), a tab-bar toggle button (`"button"`), and a Markdown document viewer (`"viewer"`).
- The panel follows the active space's focused folder, resolves the project's spec directory from `.spectra.yaml` the way Spectra does, and lists Active, Parked and Archived changes with task progress, proposer, sorting, name filter and author filter.
- Expanding a change offers buttons that type `/spectra-discuss|apply|ingest|archive|commit <change>` at the target terminal's prompt without pressing Enter, a copy-name button, and its Markdown artifacts, which open in a reusable document window or a pane.
- New layout `layouts/spectra-viewer.json`: a copy of Herdr app 0.1.16's `main` layout with a Spectra button beside the tab bar and a `spectra` block in the right panel stack; the panel can also pop out into a floating window.
- English and Traditional Chinese interface text.
- New `scripts/install.sh` that copies the mod and layout into `~/.config/herdr-app/` and refuses to overwrite folders or layouts it did not install; `npm test` unit tests for the pure logic.

## Capabilities

### New Capabilities

- `change-panel`: discovering a project's Spectra changes and showing them in a panel, button and floating window — project and spec directory resolution, the three groups, progress, proposer, sorting, filtering, refresh and interface language.
- `change-actions`: acting on a listed change — typing a Spectra command into a terminal, copying the change name, and viewing its Markdown artifacts.

### Modified Capabilities

(none)

## Impact

- New files: mods/spectra-viewer/main.js, mods/spectra-viewer/logic.js, mods/spectra-viewer/i18n.js, mods/spectra-viewer/mod.json, mods/spectra-viewer/spectra.svg, layouts/spectra-viewer.json, scripts/install.sh, test/logic.test.js, package.json, README.md, RECIPE.md, preview.png, LICENSE.
- Runtime dependencies on the person's machine (or the space's machine): `git`, `sh`, `find`, `stat`, `awk`, `test`, `hc`, and a clipboard program (`pbcopy`, `wl-copy`, `xclip` or `xsel`). No network access.
- Writes only into `~/.config/herdr-app/` (on install) and the shared value `workspace.panels` and `spectra-viewer.lang`.
