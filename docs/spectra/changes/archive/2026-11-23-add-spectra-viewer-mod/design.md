## Context

herdr-app mods are JavaScript Views drawn with gpui-kit; they have no Node APIs, no `stat`, and `fs/promises` only works on this computer. A space can live on another machine, where only `exec(..., { on })`, `readTextFile(..., { on })` and `hc` reach. The sibling project herdr-mod-issue-launcher already established the shape this mod follows: pure `logic.js` tested with `node --test`, `i18n.js`, `main.js` as the View, a cloned `main` layout with a tab-bar button and a right-panel block, and a copying `install.sh`. The feature set comes from the JetBrains plugin idea-spectra-viewer and its earlier TypeScript TUI port herdr-spectra-viewer (for the Herdr TUI plugin system).

## Goals / Non-Goals

**Goals:**

- Same discovery rules as idea-spectra-viewer: spec dir from `.spectra.yaml`, Active / Parked / Archived, task progress ignoring fenced code, proposer name only, worktree-aware parked folder.
- Work identically on local and remote spaces.
- Send `/spectra-*` commands to the person's terminal without submitting them.
- Stay live without polling hard: watch local folders, slow timer for the rest.

**Non-Goals:**

- A right-click context menu (commands are inline buttons on the expanded change).
- Multi-select copy of several change names.
- Changing changes: no park/unpark, no running the Spectra CLI, no editing artifacts.
- A combined layout holding both the Issues and Spectra buttons.

## Decisions

### One shell script scans everything

The scan is a single `exec("sh", ["-c", SCAN_SCRIPT, …])` that prints `\036`-prefixed records: change folders, Markdown files with mtimes (`stat -c` on GNU, `stat -f` on BSD, through `find -exec … +`), and the text of every `tasks.md` and `.openspec.yaml` through `awk`, ending with an `E` record. `parseScan` in `logic.js` turns it into the three groups. Alternatives: `fs/promises` (no `stat`, local only) or one `readTextFile` per file (hundreds of round trips for a large archive, and still no mtimes).

### Parked folder from git's common dir

`git rev-parse --path-format=absolute --show-toplevel --git-common-dir` gives the project root and the shared git directory in one call, so worktrees find `spectra-app/changes` without parsing `.git` files and `commondir` by hand.

### Spec dir decided by configuration only

`resolveSpecDir` reads top-level `spec_dir` from `.spectra.yaml` with a small scalar parser (no YAML library in mods) and falls back to `openspec`; it never inspects which folders exist, matching Spectra. Unusable values (absolute, `..` escape, empty, non-scalar) warn and fall back.

### Typing commands with hc keys

`hc send` always presses Enter. `hc keys <terminal> <key>…` with one key name per character leaves the line at the prompt. Only letters, digits and `-_./` (plus space) are mapped; anything else is copied to the clipboard instead, so no unexpected key sequence reaches a terminal.

### Target terminal

The focused terminal pane; when a mod pane has focus, the shown tab's first agent; else its first terminal. A layout terminal block (focused terminal with no pane) is not targeted.

### Keep the project while a mod pane is focused

A mod pane has no folder, so `location()` returns null and the panel keeps its last project. Without this, opening a document beside a terminal made the panel jump to the space folder.

### Document viewer as a keyed window

Artifacts open in one window keyed `spectra-viewer-doc`, so a second click replaces the first instead of piling up panes; the window can move the document into a pane with `pane.split`.

## Implementation Contract

- Behavior: see specs `change-panel` and `change-actions`.
- Interfaces: `props().role` ∈ {absent, `"button"`, `"viewer"`}; viewer props `{ role: "viewer", file: <absolute path>, on: <machine or null> }`. Shared keys `workspace.panels` (gains `spectra`) and `spectra-viewer.lang` (`"en"` / `"zh-TW"`). localStorage keys per copy: `sort`, `author`, `collapsed`, `expanded`, `detectedLang`.
- `SCAN_SCRIPT` arguments: `$1` = `<spec dir>/changes`, `$2` = parked folder or `""`. Output records: `\036D <group> <dir>`, `\036M <epoch seconds> <path>`, `\036T <path>` followed by file lines, `\036E`.
- Failure modes: a scan without the `E` record shows "Scan failed: <first stderr line>" and keeps nothing stale from another project; a missing spec dir shows the no-Spectra message; copy and send failures show error toasts; a missing document shows "<file> is gone."
- Acceptance: `npm test` passes; `herdr-app check ~/.config/herdr-app/mods/spectra-viewer` prints `check passed`; manual checks listed in RECIPE.md "Done when".
- Scope: the files named in the proposal's Impact; nothing in Herdr's shipped mods or layouts.

## Risks / Trade-offs

- [`layouts/.state/` is Herdr's private file] → read-only, only for the button highlight; a format change leaves the button unhighlighted, not broken.
- [The layout is a snapshot of `main` 0.1.16] → later `main` changes don't reach it; RECIPE.md says how to re-derive it.
- [Remote spaces are not watched] → they refresh on the 30-second timer and on the refresh button.
- [Many archived changes make one large scan output] → output is bounded by exec's 8 MiB limit; not measured on a large project (measure with `time` on a repo with hundreds of archived changes).
