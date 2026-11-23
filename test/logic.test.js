import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as L from "../mods/spectra-viewer/logic.js";
import { t, pickLanguage, chooseLanguage, languageFromDetection, STRINGS } from "../mods/spectra-viewer/i18n.js";

// ---------- spec dir ----------

test("spec_dir from .spectra.yaml, else openspec", () => {
  assert.deepEqual(L.resolveSpecDir("/p", null), { directory: "/p/openspec", warning: null });
  assert.deepEqual(L.resolveSpecDir("/p", "schema: x\n"), { directory: "/p/openspec", warning: null });
  assert.deepEqual(L.resolveSpecDir("/p", "spec_dir: docs/spectra\n"), { directory: "/p/docs/spectra", warning: null });
  assert.deepEqual(L.resolveSpecDir("/p", "spec_dir: \"docs/x\" # c\n"), { directory: "/p/docs/x", warning: null });
  assert.deepEqual(L.resolveSpecDir("/p", "spec_dir: specs # comment\n"), { directory: "/p/specs", warning: null });
  // Indented keys belong to another mapping.
  assert.deepEqual(L.resolveSpecDir("/p", "rules:\n  spec_dir: nope\n"), { directory: "/p/openspec", warning: null });
});

test("an unusable spec_dir warns and falls back", () => {
  assert.equal(L.resolveSpecDir("/p", "spec_dir: ../elsewhere\n").warning.reason, "outside");
  assert.equal(L.resolveSpecDir("/p", "spec_dir: /abs\n").warning.reason, "outside");
  assert.equal(L.resolveSpecDir("/p", "spec_dir:\n").warning.reason, "empty");
  assert.equal(L.resolveSpecDir("/p", "spec_dir: [a]\n").warning.reason, "notString");
  assert.equal(L.resolveSpecDir("/p", "spec_dir: ../elsewhere\n").directory, "/p/openspec");
});

test("joinPath normalises", () => {
  assert.equal(L.joinPath("/a/b", "../c"), "/a/c");
  assert.equal(L.joinPath("/a", "./b/", "c"), "/a/b/c");
  assert.equal(L.joinPath("/a", "../.."), "/");
});

// ---------- tasks and metadata ----------

test("task progress ignores fenced checkboxes", () => {
  const md = "- [x] a\n- [ ] b\n* [X] c\n```\n- [ ] no\n```\n~~~md\n- [x] no\n~~~\n  - [ ] nested\n- [-] other\n";
  assert.deepEqual(L.parseTaskProgress(md), { complete: 2, total: 4 });
  assert.equal(L.parseTaskProgress("# nothing\n"), null);
  assert.equal(L.parseTaskProgress(null), null);
});

test("status from progress", () => {
  assert.equal(L.deriveStatus(null), "draft");
  assert.equal(L.deriveStatus({ complete: 0, total: 2 }), "notStarted");
  assert.equal(L.deriveStatus({ complete: 1, total: 2 }), "inProgress");
  assert.equal(L.deriveStatus({ complete: 2, total: 2 }), "complete");
});

test("metadata: created date and proposer name without the address", () => {
  assert.deepEqual(L.parseMetadata("created: 2026-11-23\ncreated_by: Fri Pig <a@b.c>\n"), { createdAt: "2026-11-23", proposer: "Fri Pig" });
  assert.deepEqual(L.parseMetadata("created: '2026-01-02T03:04:05Z'\ncreated_by: \"<only@mail>\"\n"), { createdAt: "2026-01-02", proposer: null });
  assert.deepEqual(L.parseMetadata("created: soon\n"), { createdAt: null, proposer: null });
  assert.deepEqual(L.parseMetadata(null), { createdAt: null, proposer: null });
});

// ---------- the scan script against a real folder ----------

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "sv-"));
  const mk = (path, text) => {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  mk("openspec/changes/add-login/proposal.md", "# p\n");
  mk("openspec/changes/add-login/tasks.md", "- [x] a\n- [ ] b\n");
  mk("openspec/changes/add-login/.openspec.yaml", "created: 2026-11-01\ncreated_by: Ann <a@x>\n");
  mk("openspec/changes/add-login/specs/auth/spec.md", "# s\n");
  mkdirSync(join(root, "openspec/changes/empty-one"), { recursive: true });
  mk("openspec/changes/archive/2026-10-01-old/tasks.md", "- [x] a\n");
  mk("openspec/changes/archive/2026-10-01-old/design.md", "# d\n");
  mk("git/spectra-app/changes/parked-one/proposal.md", "# p\n");
  mk("git/spectra-app/changes/parked-one/.openspec.yaml", "created_by: Bob\n");
  return root;
}

test("scan lists active, archived and parked changes", () => {
  const root = fixture();
  try {
    const out = execFileSync("sh", ["-c", L.SCAN_SCRIPT, "sv", `${root}/openspec/changes`, `${root}/git/spectra-app/changes`], { encoding: "utf8" });
    const r = L.parseScan(out);
    assert.equal(r.complete, true);
    assert.deepEqual(r.active.map((c) => c.name).sort(), ["add-login", "empty-one"]);
    const login = r.active.find((c) => c.name === "add-login");
    assert.deepEqual(login.artifacts, ["proposal.md", "tasks.md", "specs/auth/spec.md"]);
    assert.deepEqual(login.progress, { complete: 1, total: 2 });
    assert.equal(login.status, "inProgress");
    assert.equal(login.proposer, "Ann");
    assert.equal(login.createdAt, "2026-11-01");
    assert.ok(login.modifiedAt > 0);
    const empty = r.active.find((c) => c.name === "empty-one");
    assert.deepEqual([empty.artifacts, empty.status, empty.modifiedAt], [[], "draft", null]);
    assert.deepEqual(r.archived.map((c) => [c.name, c.status, c.artifacts]), [["2026-10-01-old", "complete", ["design.md", "tasks.md"]]]);
    assert.deepEqual(r.parked.map((c) => [c.name, c.proposer, c.group]), [["parked-one", "Bob", "parked"]]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("scan without a parked folder or changes folder", () => {
  const r = L.parseScan(execFileSync("sh", ["-c", L.SCAN_SCRIPT, "sv", "/nonexistent/changes", ""], { encoding: "utf8" }));
  assert.deepEqual([r.active, r.parked, r.archived, r.complete], [[], [], [], true]);
  assert.equal(L.parseScan("").complete, false);
});

// ---------- sorting and filtering ----------

const c = (name, extra = {}) => ({ name, createdAt: null, modifiedAt: null, proposer: null, group: "active", ...extra });

test("sorting: newest first, unknown dates last, ties by name", () => {
  const list = [c("b", { modifiedAt: 1, createdAt: "2026-01-01" }), c("a"), c("c", { modifiedAt: 5 }), c("d", { modifiedAt: 1, createdAt: "2026-02-01" })];
  assert.deepEqual(L.sortChanges(list, "modified").map((x) => x.name), ["c", "b", "d", "a"]);
  assert.deepEqual(L.sortChanges(list, "created").map((x) => x.name), ["d", "b", "a", "c"]);
  assert.deepEqual(L.sortChanges(list, "name").map((x) => x.name), ["a", "b", "c", "d"]);
});

test("filter by name (case-insensitive) and author", () => {
  const list = [c("Add-Login", { proposer: "Ann" }), c("fix-bug", { proposer: "Bob" }), c("add-api")];
  assert.deepEqual(L.filterChanges(list, " add ", null).map((x) => x.name), ["Add-Login", "add-api"]);
  assert.deepEqual(L.filterChanges(list, "", "Bob").map((x) => x.name), ["fix-bug"]);
  assert.deepEqual(L.filterChanges(list, "add", "Ann").map((x) => x.name), ["Add-Login"]);
  assert.deepEqual(L.proposers({ active: list, parked: [c("x", { proposer: "Ann" })], archived: [] }), ["Ann", "Bob"]);
  assert.equal(L.groupCount(1, 3, true), "1/3");
  assert.equal(L.groupCount(3, 3, false), "3");
});

// ---------- sending ----------

test("command line as hc key names", () => {
  assert.deepEqual(L.keyNames(L.commandLine("/spectra-apply", "add-login2")),
    ["/", "s", "p", "e", "c", "t", "r", "a", "-", "a", "p", "p", "l", "y", "space", "a", "d", "d", "-", "l", "o", "g", "i", "n", "2"]);
  assert.deepEqual(L.keyNames("A_b.c"), ["shift+a", "_", "b", ".", "c"]);
  assert.equal(L.keyNames("a;rm"), null);
  assert.equal(L.keyNames("中文"), null);
});

test("target terminal: focused terminal, else the tab's agent, else its terminal", () => {
  const panes = [{ pane: "p1", tab: "T", terminal: "t1" }, { pane: "p2", tab: "T", terminal: null, mod: "x" }];
  const agents = [{ address: "t9", tab: "T" }];
  assert.equal(L.targetTerminal({ focused: { pane: "p1", terminal: "t1", tab: "T" }, panes, agents }), "t1");
  assert.equal(L.targetTerminal({ focused: { pane: "p2", terminal: null, tab: "T" }, panes, agents }), "t9");
  assert.equal(L.targetTerminal({ focused: { pane: "p2", terminal: null, tab: "T" }, panes, agents: [] }), "t1");
  // A layout terminal block: focused terminal without a pane.
  assert.equal(L.targetTerminal({ focused: { pane: null, terminal: "t5", tab: "U" }, panes, agents }), null);
  assert.equal(L.targetTerminal({ focused: null, panes, agents }), null);
});

// ---------- layout ----------

test("panel button and window commands", () => {
  assert.deepEqual(L.withSpectraPanel(undefined), ["files", "changes", "spectra"]);
  const list = ["files", "spectra"];
  assert.equal(L.withSpectraPanel(list), list);
  assert.deepEqual(L.panelToggle("spectra"), [["layout.toggle", { id: "panel" }]]);
  assert.deepEqual(L.panelToggle("files"), [["layout.select", { stack: "panel-body", child: "spectra" }], ["layout.show", { id: "panel" }]]);
  assert.equal(L.panelOn(false, "spectra"), true);
  assert.equal(L.panelOn(null, "spectra"), false);
  assert.equal(L.panelHidden(null, true), true);
  assert.equal(L.panelHidden('{"nodes":{"panel":{"hidden":false}}}', true), false);
  assert.equal(L.panelHidden("{bad", true), null);
  assert.equal(L.canDock({ children: [{ id: "files" }, { id: "spectra" }] }), true);
  assert.equal(L.canDock(null), false);
  assert.deepEqual(L.viewerWindow("/f.md", null).props, { role: "viewer", file: "/f.md", on: null });
});

// ---------- i18n ----------

test("languages", () => {
  assert.equal(pickLanguage("zh-Hant-TW"), "zh-TW");
  assert.equal(pickLanguage("en_US.UTF-8"), "en");
  assert.equal(languageFromDetection("macos", { code: 0, stdout: '(\n    "zh-Hant-TW",\n    en\n)\n' }), "zh-TW");
  assert.equal(languageFromDetection("linux", { code: 1, stdout: "" }), "en");
  assert.equal(chooseLanguage("zh-TW", "en"), "zh-TW");
  assert.equal(chooseLanguage("fr", "zh-TW"), "zh-TW");
  assert.equal(t("zh-TW", "updatedAt", { time: "1" }), "更新於 1");
  assert.deepEqual(Object.keys(STRINGS.en).sort(), Object.keys(STRINGS["zh-TW"]).sort());
});
