# change-panel Specification

## Purpose

The change panel shows the Spectra changes of the project the person is working in inside the Herdr desktop app, as a right-side panel, a tab-bar toggle button and a floating window. It reads the project's files directly, so parked changes hidden in the git directory are visible without the Spectra app.

## Requirements

### Requirement: Project follows the focused folder

The panel SHALL take its project from the active space's focused terminal pane folder, else the focused terminal's folder, else the space folder, on the space's machine. The project root SHALL be the git top level of that folder, or the folder itself outside git. While a mod pane has focus the panel SHALL keep the project it already shows. The panel SHALL rescan when the project root or machine changes, and SHALL NOT rescan when focus moves within the same project.

#### Scenario: Switching spaces switches projects

- **WHEN** the person switches from a space in repo A to a space in repo B
- **THEN** within about one second the panel lists repo B's changes and its title shows B's folder name

#### Scenario: Focusing a document pane keeps the project

- **WHEN** a spectra-viewer document pane beside the terminal takes focus
- **THEN** the panel keeps listing the same project's changes


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
### Requirement: Spec directory from configuration

The panel SHALL use the top-level `spec_dir` value of the project root's `.spectra.yaml`, resolved against the root, and SHALL use `openspec` when the file or key is absent, without looking at which folders exist. An absolute value, a value escaping the root, an empty value or a non-scalar value SHALL show a one-line warning and fall back to `openspec`. When the resolved folder does not exist the panel SHALL say there is no Spectra there and list no groups.

#### Scenario: Configured spec dir

- **WHEN** `.spectra.yaml` contains `spec_dir: docs/spectra`
- **THEN** Active changes come from `docs/spectra/changes/`

##### Example: Resolution

| `.spectra.yaml` | Spec dir | Warning |
| --- | --- | --- |
| absent | `openspec` | none |
| `spec_dir: docs/spectra` | `docs/spectra` | none |
| `spec_dir: "docs/x" # note` | `docs/x` | none |
| `spec_dir: ../elsewhere` | `openspec` | points outside the project |
| `spec_dir:` | `openspec` | empty |


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
### Requirement: Three groups of changes

The panel SHALL list Active changes (folders in `<spec dir>/changes/` except `archive`), Parked changes (folders in `<git common dir>/spectra-app/changes/`, so worktrees share them) and Archived changes (folders in `<spec dir>/changes/archive/`), each under a collapsible header with its count. Archived SHALL be collapsed the first time. Collapsed groups and expanded changes SHALL be remembered per panel copy.

#### Scenario: Parked change in a worktree

- **WHEN** the project is a git worktree and a change was parked from the main checkout
- **THEN** the change appears under Parked


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
### Requirement: Change details

Each change row SHALL show its name, its proposer and its task progress. Progress SHALL count `- [ ]` and `- [x]`/`- [X]` lines (also with `*` or `+`) in `tasks.md` outside fenced code blocks, shown as `done/total` and colored by status (all done, some done, none done); a change without counted tasks SHALL show no progress. The proposer SHALL be the text of `created_by` in `.openspec.yaml` before any `<`, and nothing when that is empty. Artifacts SHALL be every `*.md` file beneath the change, listed as relative paths with `proposal.md`, `design.md`, `tasks.md` first and the rest in string order.

#### Scenario: Fenced checkboxes are not counted

- **WHEN** `tasks.md` has `- [x] a`, `- [ ] b`, `- [ ] c` and a fenced block containing `- [ ] not counted`
- **THEN** the row shows `1/3`

#### Scenario: Proposer without the address

- **WHEN** `.openspec.yaml` has `created_by: Demo Person <demo@example.com>`
- **THEN** the row shows `Demo Person`


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
### Requirement: Sorting and filtering

The panel SHALL sort each group by modification time (newest Markdown file, the default), creation date (`created` in `.openspec.yaml`), or name. Date sorts SHALL put the newest first, unknown dates last, and ties in name order. A text box SHALL filter change names case-insensitively in every group; with more than one proposer, author chips SHALL filter by proposer. While filtering, group counts SHALL read `shown/total`. Sorting and filtering SHALL NOT rescan the file system.

#### Scenario: Filtered count

- **WHEN** Active has three changes and the filter text matches one of them
- **THEN** the Active header reads `Active (1/3)`


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
### Requirement: Staying current

The panel SHALL scan on start, every 30 seconds, on the refresh button, and for local projects whenever the spec folder or the parked folder changes. While a scan runs the refresh button SHALL read Loading… and further requests SHALL queue one more scan. A scan that does not finish SHALL show "Scan failed:" with the first error line.

#### Scenario: New change appears without clicking

- **WHEN** a new folder with a `proposal.md` is created under the local project's `changes/`
- **THEN** it appears under Active within a few seconds


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
### Requirement: Panel placement

The `spectra-viewer` layout SHALL be Herdr's `main` layout with a Spectra button right of the tab bar and a `spectra` block in the right panel stack. The button SHALL show the panel on Spectra, or toggle the panel when Spectra is already shown, and SHALL be highlighted while the panel shows Spectra. The docked panel SHALL offer ⧉ to pop out into a floating window; the window SHALL offer ⇲ to dock back (only in a layout with the Spectra block) and ✕ to close. The panel SHALL be openable without the layout through `mod.open {name: "spectra-viewer"}`.

#### Scenario: Pop out and dock back

- **WHEN** the person clicks ⧉ on the docked panel and then ⇲ on the window
- **THEN** the right panel hides and the window opens, then the window closes and the right panel shows Spectra again


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
### Requirement: Interface language

The panel SHALL show its own text in Traditional Chinese when the system language starts with `zh` and in English otherwise, and a title-bar chip SHALL switch the shared value `spectra-viewer.lang`, which every copy follows. Change names, paths and proposers SHALL NOT be translated.

#### Scenario: Switching language

- **WHEN** the person clicks the EN chip in a Chinese panel
- **THEN** every open copy shows English text, including the filter placeholder

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