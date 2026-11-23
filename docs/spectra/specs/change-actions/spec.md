# change-actions Specification

## Purpose

Change actions let the person act on a change listed in the Spectra panel: hand a Spectra command to the terminal they are working in, copy the change name, and read the change's Markdown artifacts without leaving Herdr.

## Requirements

### Requirement: Typing a Spectra command

An expanded Active or Parked change SHALL offer `discuss`, `apply`, `ingest`, `archive` and `commit` buttons. Each SHALL type `/spectra-<command> <change name>` at the target terminal's prompt without pressing Enter, then focus that terminal. The target SHALL be the focused terminal pane; when no terminal pane has focus, the shown tab's first agent; else the shown tab's first terminal. Archived changes SHALL NOT offer these buttons.

#### Scenario: Command left at the prompt

- **WHEN** the person clicks `apply` on change `add-login` while a Claude Code pane is focused
- **THEN** that prompt contains `/spectra-apply add-login`, it is not submitted, and the pane has focus


<!-- @trace
source: add-spectra-viewer-mod
updated: 2026-11-23
code:
  - package.json
  - preview.png
  - mods/spectra-viewer/i18n.js
  - RECIPE.md
  - CLAUDE.md
  - mods/spectra-viewer/main.js
  - scripts/install.sh
  - layouts/spectra-viewer.json
  - mods/spectra-viewer/mod.json
  - mods/spectra-viewer/spectra.svg
  - LICENSE
  - README.md
  - mods/spectra-viewer/logic.js
  - .spectra.yaml
tests:
  - test/logic.test.js
-->

---
### Requirement: Fallback to the clipboard

When there is no target terminal, or the command line contains a character other than letters, digits, space and `-_./`, the button SHALL copy the command line to the clipboard instead of typing it and show a toast saying so.

#### Scenario: No terminal in the tab

- **WHEN** the shown tab holds only mod panes and the person clicks `discuss`
- **THEN** `/spectra-discuss <name>` is on the clipboard and a toast says it was copied


<!-- @trace
source: add-spectra-viewer-mod
updated: 2026-11-23
code:
  - package.json
  - preview.png
  - mods/spectra-viewer/i18n.js
  - RECIPE.md
  - CLAUDE.md
  - mods/spectra-viewer/main.js
  - scripts/install.sh
  - layouts/spectra-viewer.json
  - mods/spectra-viewer/mod.json
  - mods/spectra-viewer/spectra.svg
  - LICENSE
  - README.md
  - mods/spectra-viewer/logic.js
  - .spectra.yaml
tests:
  - test/logic.test.js
-->

---
### Requirement: Copying the change name

An expanded change SHALL offer a copy-name button that puts only the change name on the clipboard and shows a short success toast, or an error toast when copying fails.

#### Scenario: Copy name

- **WHEN** the person clicks copy name on `add-login`
- **THEN** the clipboard holds exactly `add-login`


<!-- @trace
source: add-spectra-viewer-mod
updated: 2026-11-23
code:
  - package.json
  - preview.png
  - mods/spectra-viewer/i18n.js
  - RECIPE.md
  - CLAUDE.md
  - mods/spectra-viewer/main.js
  - scripts/install.sh
  - layouts/spectra-viewer.json
  - mods/spectra-viewer/mod.json
  - mods/spectra-viewer/spectra.svg
  - LICENSE
  - README.md
  - mods/spectra-viewer/logic.js
  - .spectra.yaml
tests:
  - test/logic.test.js
-->

---
### Requirement: Viewing artifacts

Clicking an artifact SHALL open it rendered as Markdown in a document window that is reused for the next artifact. The window SHALL offer reload, a button that moves the document into a pane to the right of the focused pane, and ✕. A local document SHALL reload when its file changes. A file that no longer exists SHALL show "<file> is gone." instead of content.

#### Scenario: Second artifact replaces the first

- **WHEN** the person opens `proposal.md` and then `tasks.md`
- **THEN** one document window shows `tasks.md`

<!-- @trace
source: add-spectra-viewer-mod
updated: 2026-11-23
code:
  - package.json
  - preview.png
  - mods/spectra-viewer/i18n.js
  - RECIPE.md
  - CLAUDE.md
  - mods/spectra-viewer/main.js
  - scripts/install.sh
  - layouts/spectra-viewer.json
  - mods/spectra-viewer/mod.json
  - mods/spectra-viewer/spectra.svg
  - LICENSE
  - README.md
  - mods/spectra-viewer/logic.js
  - .spectra.yaml
tests:
  - test/logic.test.js
-->