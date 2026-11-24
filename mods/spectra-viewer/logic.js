// Spectra Viewer's pure logic: no herdr imports, so `node --test` runs it.
// main.js holds the state, the exec calls and the rendering.

export const MOD = "spectra-viewer";
export const GROUPS = ["active", "parked", "archived"];
export const DEFAULT_SPEC_DIR = "openspec";
export const COMMANDS = [
  ["discuss", "/spectra-discuss"],
  ["apply", "/spectra-apply"],
  ["ingest", "/spectra-ingest"],
  ["archive", "/spectra-archive"],
  ["commit", "/spectra-commit"],
];
export const SORTS = ["modified", "created", "name"];

// ---------- paths ----------

// Joins and normalises POSIX paths: "a/b/../c" -> "a/c". Keeps a leading "/".
export function joinPath(...parts) {
  const joined = parts.filter((p) => p !== "" && p != null).join("/");
  const abs = joined.startsWith("/");
  const out = [];
  for (const seg of joined.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (out.length && out[out.length - 1] !== "..") out.pop();
      else if (!abs) out.push("..");
      continue;
    }
    out.push(seg);
  }
  return (abs ? "/" : "") + out.join("/");
}

export const baseName = (p) => String(p ?? "").replace(/\/+$/, "").split("/").pop() ?? "";

// ---------- .spectra.yaml ----------

// The value of a top-level `key:` scalar in simple YAML: quotes and trailing comments removed.
// undefined when the key is absent, null when present but not a plain scalar.
export function yamlScalar(text, key) {
  if (typeof text !== "string") return undefined;
  const re = new RegExp(`^${key}:(.*)$`);
  for (const line of text.split(/\r?\n/)) {
    const m = re.exec(line);
    if (!m) continue;
    let v = m[1].trim();
    if (v.startsWith('"') || v.startsWith("'")) {
      const q = v[0];
      const end = v.indexOf(q, 1);
      return end > 0 ? v.slice(1, end) : null;
    }
    v = v.replace(/\s+#.*$/, "").trim();
    if (v === "" || v === "|" || v === ">" || v.startsWith("[") || v.startsWith("{")) return v === "" ? "" : null;
    return v;
  }
  return undefined;
}

// Where a project's specs live, as Spectra decides it: `spec_dir` in `.spectra.yaml`, else `openspec`.
// It never looks at which folders exist. Returns { directory, warning }.
export function resolveSpecDir(root, configText) {
  const legacy = joinPath(root, DEFAULT_SPEC_DIR);
  const refuse = (reason) => ({ directory: legacy, warning: { reason } });
  const value = yamlScalar(configText, "spec_dir");
  if (value === undefined) return { directory: legacy, warning: null };
  if (value === null) return refuse("notString");
  if (value.trim() === "") return refuse("empty");
  const resolved = joinPath(root, value.trim());
  const base = joinPath(root);
  if (value.trim().startsWith("/") || (resolved !== base && !resolved.startsWith(base + "/"))) return refuse("outside");
  return { directory: resolved, warning: null };
}

// ---------- tasks.md and .openspec.yaml ----------

const CHECKBOX = /^[-*+]\s+\[(.)\]/;
const FENCE = /^(`{3,}|~{3,})/;

// { complete, total } from tasks.md, ignoring checkboxes inside fenced code; null when none count.
export function parseTaskProgress(text) {
  if (typeof text !== "string") return null;
  let total = 0, complete = 0, fence = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimStart();
    const f = FENCE.exec(line);
    if (f) {
      if (fence === null) fence = f[1][0];
      else if (f[1][0] === fence) fence = null;
      continue;
    }
    if (fence !== null) continue;
    const m = CHECKBOX.exec(line);
    if (!m) continue;
    if (m[1] === " ") total += 1;
    else if (m[1] === "x" || m[1] === "X") { total += 1; complete += 1; }
  }
  return total === 0 ? null : { complete, total };
}

export function deriveStatus(progress) {
  if (!progress || progress.total === 0) return "draft";
  if (progress.complete === 0) return "notStarted";
  if (progress.complete === progress.total) return "complete";
  return "inProgress";
}

// "2026-11-23" from `created: 2026-11-23` or `created: 2026-11-23T10:00:00Z`.
export function parseCreatedAt(value) {
  if (typeof value !== "string") return null;
  const m = /^(\d{4}-\d{2}-\d{2})(T|$)/.exec(value.trim());
  return m ? m[1] : null;
}

// The name part of `created_by: Name <mail@x>`; the address is dropped.
export function parseProposer(value) {
  if (typeof value !== "string") return null;
  const lt = value.indexOf("<");
  const name = (lt >= 0 ? value.slice(0, lt) : value).trim();
  return name || null;
}

export function parseMetadata(text) {
  return { createdAt: parseCreatedAt(yamlScalar(text, "created")), proposer: parseProposer(yamlScalar(text, "created_by")) };
}

// ---------- scanning ----------

// One shell run lists every change folder, its Markdown files with their mtimes, and the text of
// tasks.md and .openspec.yaml. It runs the same on this computer and on a space's machine.
// Args: $1 changes dir, $2 parked dir ("" when there is no git dir).
// Records start with \036 (RS) so file text can't be mistaken for one.
export const SCAN_SCRIPT = [
  'RS=$(printf "\\036")',
  'if stat -c %Y / >/dev/null 2>&1; then fmt="${RS}M %Y %n"; flag=-c; else fmt="${RS}M %m %N"; flag=-f; fi',
  // $1 group, $2 folder holding change folders. Active skips its archive/ folder.
  'scan() {',
  '  [ -d "$2" ] || return 0',
  '  for d in "$2"/*/; do [ -d "$d" ] || continue; d=${d%/}; [ "$1" = active ] && [ "${d##*/}" = archive ] && continue; printf "%sD %s %s\\n" "$RS" "$1" "$d"; done',
  '  find "$2" -path "$2/archive" -prune -o -path "$2/*/*" -type f -name "*.md" -exec stat "$flag" "$fmt" {} + 2>/dev/null',
  '  find "$2" -path "$2/archive" -prune -o -path "$2/*/*" -type f \\( -name tasks.md -o -name .openspec.yaml \\) -exec awk -v rs="$RS" \'FNR==1{print rs "T " FILENAME} {print}\' {} + 2>/dev/null',
  '}',
  'scan active "$1"',
  'scan archived "$1/archive"',
  '[ -n "$2" ] && scan parked "$2"',
  'printf "%sE\\n" "$RS"',
].join("\n");

// Turns SCAN_SCRIPT's output into { active, parked, archived } lists of changes.
export function parseScan(stdout) {
  const RS = "\u001e";
  const dirs = new Map(); // dir -> change
  const files = []; // [path, mtime]
  const texts = new Map(); // path -> text
  let complete = false;
  let current = null; // path whose text lines are being collected
  let lines = [];
  const flush = () => {
    if (current !== null) texts.set(current, lines.join("\n"));
    current = null;
    lines = [];
  };
  for (const line of String(stdout ?? "").split("\n")) {
    if (!line.startsWith(RS)) {
      if (current !== null) lines.push(line);
      continue;
    }
    flush();
    const kind = line[1], rest = line.slice(3);
    if (kind === "D") {
      const sp = rest.indexOf(" ");
      const group = rest.slice(0, sp), dir = rest.slice(sp + 1);
      if (GROUPS.includes(group)) dirs.set(dir, { group, name: baseName(dir), directory: dir });
    } else if (kind === "M") {
      const sp = rest.indexOf(" ");
      const mtime = Number(rest.slice(0, sp));
      files.push([rest.slice(sp + 1), Number.isFinite(mtime) ? mtime * 1000 : null]);
    } else if (kind === "T") {
      current = rest;
    } else if (kind === "E") {
      complete = true;
    }
  }
  flush();
  // Each file goes to every change folder above it: one pass over the files instead of one per
  // change, which a project with hundreds of archived changes made too slow for Herdr's engine.
  const byDir = new Map();
  for (const file of files) {
    for (let i = file[0].indexOf("/", 1); i !== -1; i = file[0].indexOf("/", i + 1)) {
      const dir = file[0].slice(0, i);
      if (!dirs.has(dir)) continue;
      if (!byDir.has(dir)) byDir.set(dir, []);
      byDir.get(dir).push(file);
    }
  }
  const out = { active: [], parked: [], archived: [], complete };
  for (const change of dirs.values()) {
    const prefix = change.directory + "/";
    const mine = byDir.get(change.directory) ?? [];
    const artifacts = [...new Set(mine.map(([p]) => p.slice(prefix.length)))].sort(compareArtifacts);
    const times = mine.map(([, t]) => t).filter((t) => t !== null);
    const progress = parseTaskProgress(texts.get(prefix + "tasks.md") ?? null);
    const meta = parseMetadata(texts.get(prefix + ".openspec.yaml") ?? null);
    out[change.group].push({
      ...change,
      artifacts,
      progress,
      status: deriveStatus(progress),
      createdAt: meta.createdAt,
      proposer: meta.proposer,
      modifiedAt: times.length ? Math.max(...times) : null,
    });
  }
  return out;
}

// proposal, design, tasks first (Spectra's reading order), then the rest as strings.
const ARTIFACT_ORDER = ["proposal.md", "design.md", "tasks.md"];
export function compareArtifacts(a, b) {
  const ia = ARTIFACT_ORDER.indexOf(a), ib = ARTIFACT_ORDER.indexOf(b);
  if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  return a < b ? -1 : a > b ? 1 : 0;
}

// ---------- sorting and filtering ----------

const byName = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
// Newest first; unknown dates always last; ties by name.
export function sortChanges(list, sort) {
  const key = sort === "created" ? (c) => (c.createdAt ? Date.parse(c.createdAt) : null)
    : sort === "modified" ? (c) => c.modifiedAt : null;
  if (!key) return [...list].sort(byName);
  return [...list].sort((a, b) => {
    const ka = key(a), kb = key(b);
    if (ka === null && kb === null) return byName(a, b);
    if (ka === null) return 1;
    if (kb === null) return -1;
    return kb - ka || byName(a, b);
  });
}

// Case-insensitive name filter plus an optional proposer; "" / null means no filter.
export function filterChanges(list, text, author) {
  const q = String(text ?? "").trim().toLowerCase();
  return list.filter((c) => (!q || c.name.toLowerCase().includes(q)) && (!author || c.proposer === author));
}

// Every proposer across the groups, sorted, without duplicates.
export function proposers(data) {
  const set = new Set();
  for (const g of GROUPS) for (const c of data?.[g] ?? []) if (c.proposer) set.add(c.proposer);
  return [...set].sort((a, b) => a.localeCompare(b));
}

// "3" without a filter, "1/3" while one hides some.
export const groupCount = (shown, total, filtering) => (filtering ? `${shown}/${total}` : String(total));

export const toggle = (list, item) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);
export const changeKey = (c) => `${c.group}/${c.name}`;

// ---------- sending a command ----------

export const commandLine = (command, name) => `${command} ${name}`;

// `hc keys` names for typing text without pressing Enter: one key per character.
// null when the text has a character that isn't safe to press as a key name.
export function keyNames(text) {
  const out = [];
  for (const ch of String(text)) {
    if (ch === " ") out.push("space");
    else if (/^[a-z0-9]$/.test(ch) || ch === "-" || ch === "/" || ch === "_" || ch === ".") out.push(ch);
    else if (/^[A-Z]$/.test(ch)) out.push(`shift+${ch.toLowerCase()}`);
    else return null;
  }
  return out;
}

// The terminal a command goes to: the focused terminal pane in the shown tab, else the shown tab's
// first agent, else the shown tab's first terminal. null when there is none.
export function targetTerminal({ focused, panes, agents }) {
  if (focused?.terminal && focused.pane) return focused.terminal;
  const tab = focused?.tab;
  const agent = (agents ?? []).find((a) => a.tab === tab);
  if (agent) return agent.address;
  const pane = (panes ?? []).find((p) => p.tab === tab && p.terminal);
  return pane?.terminal ?? null;
}

// The program that writes text to the clipboard, as `sh -c <script> sh <text>`.
export function copyScript(platform) {
  if (platform === "macos") return 'printf %s "$1" | pbcopy';
  return 'if command -v wl-copy >/dev/null 2>&1; then printf %s "$1" | wl-copy; elif command -v xclip >/dev/null 2>&1; then printf %s "$1" | xclip -selection clipboard; else printf %s "$1" | xsel --clipboard --input; fi';
}

// ---------- layout: button, panel, window ----------

export const PANEL_CHILD = "spectra";

// Herdr's tab bar remembers each space's panel only for ids in shared "workspace.panels".
export const withSpectraPanel = (list) => {
  const current = Array.isArray(list) ? list : ["files", "changes"];
  return current.includes(PANEL_CHILD) ? current : [...current, PANEL_CHILD];
};
export const panelOn = (hidden, active) => hidden === false && active === PANEL_CHILD;
// layout() reports the stack's active child but not the panel's shown/hidden click, so toggle.
export const panelToggle = (active) =>
  active === PANEL_CHILD
    ? [["layout.toggle", { id: "panel" }]]
    : [["layout.select", { stack: "panel-body", child: PANEL_CHILD }], ["layout.show", { id: "panel" }]];
// The panel's shown/hidden click from layouts/.state/<layout>.json; the file's value when never clicked.
export const panelHidden = (stateText, fileHidden) => {
  if (stateText == null) return fileHidden;
  try {
    return JSON.parse(stateText)?.nodes?.panel?.hidden ?? fileHidden;
  } catch {
    return null;
  }
};
export const WINDOW = { mod: MOD, kind: "window", key: MOD, keep: true, width: 400, height: 0.8 };
export const popOutCommands = () => [["layout.hide", { id: "panel" }]];
export const dockBackCommands = () => panelToggle(null);
export const canDock = (panelBody) => (panelBody?.children ?? []).some((c) => c.id === PANEL_CHILD);

export function findNode(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

// The document viewer: one window, replaced in place when another artifact opens.
export const viewerWindow = (file, on) => ({
  mod: MOD, kind: "window", key: `${MOD}-doc`, width: 0.5, height: 0.85,
  props: { role: "viewer", file, on: on ?? null },
});
