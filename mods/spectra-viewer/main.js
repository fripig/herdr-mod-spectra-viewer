import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, TextView } from "gpui-base";
import {
  spaces, panes, focused, agents, exec, hc, readTextFile, watchFolder, run, notify, theme, props,
  openOverlay, closeOverlay, layout, shared, setShared, appHome, checking, window as appWindow,
} from "herdr";
import * as L from "./logic.js";
import { languageFromDetection, chooseLanguage, t as tr } from "./i18n.js";

const LANG_KEY = "spectra-viewer.lang";
const FALLBACK_MS = 30 * 1000;
const ICON = "mods/spectra-viewer/spectra.svg";

// The window drags on any press a control doesn't stop.
const stop = (_e, cx) => cx.stop_propagation();
const errorLine = (text) => String(text ?? "").split("\n").map((l) => l.trim()).find(Boolean) ?? "";
const pad = (n) => String(n).padStart(2, "0");
const clock = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

async function detectLanguage() {
  const platform = appWindow()?.platform;
  const res = await (platform === "macos"
    ? exec("defaults", ["read", "-g", "AppleLanguages"], { timeout: 5000 })
    : exec("sh", ["-c", 'printf %s "$LANG"'], { timeout: 5000 })).catch(() => null);
  return languageFromDetection(platform, res);
}

// Where the person is working, as the shipped files and changes mods find it. null while a mod pane
// (a document viewer, say) has focus: it has no folder, so the panel keeps the project it shows.
function location() {
  const space = spaces().find((s) => s.active), f = focused();
  const pane = f?.pane ? panes().find((p) => p.pane === f.pane) : null;
  if (pane && !pane.terminal) return null;
  const on = f?.pane === null ? (f.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : space?.machine ?? null;
  return { cwd: pane?.cwd || f?.cwd || space?.folder || null, on };
}

const panelActive = () => L.findNode(layout(), "panel-body")?.active ?? null;

async function readPanelHidden() {
  const fileHidden = L.findNode(layout(), "panel")?.hidden ?? false;
  const name = shared("layout");
  if (typeof name !== "string") return null;
  try {
    return L.panelHidden(await readTextFile(`${appHome()}/layouts/.state/${name}.json`), fileHidden);
  } catch {
    return null;
  }
}

function load(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}
function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Per-copy convenience only.
  }
}

// The project of a folder: its git top level and common git dir (worktrees share it), else the folder.
async function resolveProject(cwd, on) {
  const r = await exec("git", ["rev-parse", "--path-format=absolute", "--show-toplevel", "--git-common-dir"], { cwd, on }).catch(() => null);
  if (r?.code === 0) {
    const [root, gitDir] = r.stdout.trim().split("\n");
    if (root) return { root, gitDir: gitDir || null };
  }
  return { root: cwd, gitDir: null };
}

export default class SpectraViewer extends View {
  init(_props, cx) {
    const role = props()?.role;
    this.detected = load("detectedLang", "en");
    if (!checking()) cx.spawn(async (cx) => {
      this.detected = await detectLanguage();
      save("detectedLang", this.detected);
      cx.notify();
    });
    if (role === "button") return this.initButton(cx);
    if (role === "viewer") return this.initViewer(cx);

    this.project = null; // { key, root, on, specDir, parkedDir, warning, exists }
    this.data = null; // { active, parked, archived }
    this.error = null;
    this.fetchedAt = null;
    this.loading = false;
    this.queued = null;
    this.where = null;
    this.watching = null;
    this.sort = load("sort", "modified");
    this.author = load("author", null);
    this.collapsed = load("collapsed", ["archived"]);
    this.expanded = load("expanded", []);
    this.filter = "";
    this.makeInput();
    if (checking()) return;
    this.refresh(cx, true);
    cx.timer.every(FALLBACK_MS, (cx) => this.refresh(cx, true));
    // A change of folder or machine re-checks the project and rescans only when it changed.
    cx.timer.every(1000, (cx) => {
      const here = location();
      if (here && `${here.on ?? ""}\n${here.cwd ?? ""}` !== this.where) this.refresh(cx, false);
    });
  }

  initButton(cx) {
    const panels = shared("workspace.panels");
    const next = L.withSpectraPanel(panels);
    if (next !== panels) setShared("workspace.panels", next);
    this.panelHidden = null;
    this.panelActive = panelActive();
    // Layout clicks don't re-render a mod: check the panel twice a second and redraw on change.
    const check = (cx) => cx.spawn(async (cx) => {
      const hidden = await readPanelHidden();
      const active = panelActive();
      if (hidden !== this.panelHidden || active !== this.panelActive) {
        this.panelHidden = hidden;
        this.panelActive = active;
        cx.notify();
      }
    });
    check(cx);
    cx.timer.every(500, check);
  }

  initViewer(cx) {
    this.text = null;
    this.missing = false;
    this.loadDoc(cx);
    const { file, on } = props() ?? {};
    if (!file || on || checking()) return;
    const dir = file.slice(0, file.lastIndexOf("/")) || "/";
    cx.spawn(async (cx) => {
      try {
        for (;;) {
          const changed = await watchFolder(dir);
          if (changed.some((p) => p === file || p === dir)) this.loadDoc(cx);
        }
      } catch {
        // No watch: the reload button still works.
      }
    });
  }

  loadDoc(cx) {
    const { file, on } = props() ?? {};
    if (!file) return;
    cx.spawn(async (cx) => {
      const text = await readTextFile(file, { on: on ?? null }).catch(() => null);
      this.text = text;
      this.missing = text === null;
      cx.notify();
    });
  }

  // The filter box, its placeholder in the interface language (rebuilt, keeping the text, when that changes).
  makeInput() {
    this.inputLang = this.lang();
    this.input = InputState.new({ placeholder: tr(this.inputLang, "filter"), value: this.filter });
    this.input.on("change", (_e, cx) => { this.filter = this.input.value(); cx.notify(); });
  }

  lang() {
    return chooseLanguage(shared(LANG_KEY), this.detected);
  }

  // force: rescan even when the project is the same (start-up, timer, watch, the refresh button).
  refresh(cx, force) {
    if (this.loading) {
      this.queued = Boolean(this.queued) || force;
      return;
    }
    this.loading = true;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        await this.fetch(cx, force);
      } catch (err) {
        this.error = err?.message ?? String(err);
      } finally {
        this.loading = false;
        cx.notify();
        if (this.queued !== null) {
          const again = this.queued;
          this.queued = null;
          this.refresh(cx, again);
        }
      }
    });
  }

  async fetch(cx, force) {
    const here = location() ?? this.lastLocation;
    if (!here) return;
    this.lastLocation = here;
    const { cwd, on } = here;
    this.where = `${on ?? ""}\n${cwd ?? ""}`;
    this.noFolder = !cwd;
    if (!cwd) {
      this.project = null;
      this.data = null;
      return;
    }
    const { root, gitDir } = await resolveProject(cwd, on);
    const key = `${on ?? ""}\n${root}`;
    if (key === this.project?.key && !force) return;
    if (key !== this.project?.key) {
      this.data = null;
      this.error = null;
      this.fetchedAt = null;
    }
    const config = await readTextFile(`${root}/.spectra.yaml`, { on }).catch(() => null);
    const { directory: specDir, warning } = L.resolveSpecDir(root, config);
    const parkedDir = gitDir ? `${gitDir}/spectra-app/changes` : "";
    const test = await exec("test", ["-d", specDir], { on }).catch(() => null);
    const exists = test?.code === 0;
    this.project = { key, root, on, specDir, parkedDir, warning, exists };
    if (!exists) {
      this.data = null;
      this.error = null;
      cx.notify();
      return;
    }
    const res = await exec("sh", ["-c", L.SCAN_SCRIPT, "spectra-viewer", `${specDir}/changes`, parkedDir], { on, timeout: 30000 });
    const data = L.parseScan(res.stdout);
    if (!data.complete) throw new Error(errorLine(res.stderr) || `exit ${res.code}`);
    this.data = data;
    this.error = null;
    this.fetchedAt = clock(new Date());
    this.watch(cx);
  }

  // Local projects rescan when their spec folder or parked folder changes; remote ones use the timer.
  watch(cx) {
    const project = this.project;
    if (!project || project.on || this.watching === project.key) return;
    this.watching = project.key;
    for (const dir of [project.specDir, project.parkedDir].filter(Boolean)) {
      cx.spawn(async (cx) => {
        try {
          while (this.project?.key === project.key) {
            await watchFolder(dir);
            if (this.project?.key === project.key) this.refresh(cx, true);
          }
        } catch {
          // A missing parked folder can't be watched; the timer covers it.
        }
        if (this.watching === project.key) this.watching = null;
      });
    }
  }

  copy(text, cx) {
    const lang = this.lang();
    cx.spawn(async () => {
      try {
        const res = await exec("sh", ["-c", L.copyScript(appWindow()?.platform), "copy", text], { timeout: 5000 });
        if (res.code !== 0) throw new Error(errorLine(res.stderr) || `exit ${res.code}`);
        notify({ level: "success", title: tr(lang, "copied", { text }), timeout: 2500 });
      } catch (err) {
        notify({ level: "error", title: tr(lang, "copyFailed", { reason: err?.message ?? String(err) }) });
      }
    });
  }

  // Types the command at the target terminal's prompt without pressing Enter.
  send(command, change, cx) {
    const line = L.commandLine(command, change.name);
    const terminal = L.targetTerminal({ focused: focused(), panes: panes(), agents: agents() });
    const keys = L.keyNames(line);
    const lang = this.lang();
    if (!terminal || !keys) {
      this.copy(line, cx);
      if (!terminal) notify({ level: "info", title: tr(lang, "noTerminal", { text: line }), timeout: 4000 });
      return;
    }
    cx.spawn(async () => {
      try {
        const res = await hc(["keys", terminal, ...keys]);
        if (res.code !== 0) throw new Error(errorLine(res.stderr) || errorLine(res.stdout) || `exit ${res.code}`);
        run("pane.focus", { terminal });
      } catch (err) {
        notify({ level: "error", title: tr(lang, "sendFailed", { terminal, reason: err?.message ?? String(err) }) });
      }
    });
  }

  openArtifact(change, rel) {
    openOverlay(L.viewerWindow(`${change.directory}/${rel}`, this.project?.on));
  }

  set(field, storageKey, value, cx) {
    this[field] = value;
    save(storageKey, value);
    cx.notify();
  }

  renderButton() {
    const t = theme();
    const on = L.panelOn(this.panelHidden, this.panelActive);
    return h_flex().size_full().pr(10).items_center().bg(t.chrome).border_b(1).border_color(t.border)
      .child(h_flex().id("panel-spectra").h(26).px(8).gap(5).flex_none().items_center().rounded(6).cursor_pointer()
        .text_size(12).bg(on ? t.selected : t.chrome).text_color(on ? t.foreground : t.muted)
        .hover((s) => s.bg(t.hover)).on_mouse_down("left", stop)
        .on_click(() => { for (const [name, args] of L.panelToggle(panelActive())) run(name, args); })
        .child(svg(ICON).size(14)).child("Spectra"));
  }

  renderViewer() {
    const t = theme();
    const lang = this.lang();
    const { file, on, overlay } = props() ?? {};
    const name = String(file ?? "").split("/").slice(-3).join("/");
    const icon = (id, label, onPress) =>
      div().id(id).px(6).rounded(4).cursor_pointer().text_color(t.muted).hover((s) => s.bg(t.hover).text_color(t.foreground))
        .on_mouse_down("left", stop).on_click(onPress).child(label);
    const title = h_flex().h(30).px(10).gap(6).flex_none().items_center().justify_between().bg(t.chrome).border_b(1).border_color(t.border)
      .child(div().flex_1().min_w(0).truncate().font_semibold().text_color(t.foreground).child(name))
      .child(h_flex().gap(2).flex_none()
        .child(icon("reload", tr(lang, "reload"), (_e, cx) => this.loadDoc(cx)))
        .when(Boolean(overlay), (el) => el
          .child(icon("to-pane", tr(lang, "toPane"), () => {
            run("pane.split", { direction: "right", mod: L.MOD, props: { role: "viewer", file, on: on ?? null } });
            closeOverlay(overlay);
          }))
          .child(icon("close", "✕", () => closeOverlay(overlay)))));
    const body = this.missing
      ? div().text_color(t.dim).child(tr(lang, "missingFile", { file: name }))
      : this.text === null
        ? div().text_color(t.dim).child(tr(lang, "loading"))
        : TextView.markdown(`doc-${file}`, this.text);
    return v_flex().size_full().bg(t.surface).text_size(13).text_color(t.foreground)
      .child(title)
      .child(v_flex().id("doc").flex_1().min_h(0).px(16).py(12).overflow_y_scrollbar().on_mouse_down("left", stop).child(body));
  }

  render() {
    const role = props()?.role;
    if (role === "button") return this.renderButton();
    if (role === "viewer") return this.renderViewer();

    const t = theme();
    const lang = this.lang();
    if (lang !== this.inputLang) this.makeInput();
    const say = (key, params) => tr(lang, key, params);
    const project = this.project;
    const data = this.data;
    const overlay = props()?.overlay;
    const runAll = (commands) => { for (const [name, args] of commands) run(name, args); };
    const filtering = Boolean(this.filter.trim()) || Boolean(this.author);
    const authors = data ? L.proposers(data) : [];
    const author = authors.includes(this.author) ? this.author : null;

    const chip = (id, label, onPress, opts = {}) =>
      div().id(id).flex_none().px(6).py(1).rounded(5).cursor_pointer()
        .bg(opts.on ? t.selected : t.raised).text_color(opts.dim ? t.muted : t.foreground)
        .hover((s) => s.bg(t.hover))
        .on_mouse_down("left", stop)
        .on_click((_e, cx) => onPress(cx))
        .child(label);
    const icon = (id, label, onPress) =>
      div().id(id).px(4).rounded(4).cursor_pointer().text_color(t.muted).hover((s) => s.bg(t.hover))
        .on_mouse_down("left", stop).on_click(onPress).child(label);

    const title = h_flex().h(30).px(10).flex_none().items_center().justify_between().bg(t.chrome).border_b(1).border_color(t.border)
      .child(h_flex().gap(6).min_w(0).items_center()
        .child(div().flex_none().font_semibold().text_color(t.foreground).child("Spectra"))
        .when(Boolean(project), (el) => el.child(div().min_w(0).truncate().text_color(t.dim).child(L.baseName(project.root)))))
      .child(h_flex().gap(2).flex_none()
        .child(icon("lang", say("switchLabel"), () => setShared(LANG_KEY, lang === "en" ? "zh-TW" : "en")))
        .when(!overlay, (el) => el.child(icon("pop-out", "⧉", () => { runAll(L.popOutCommands()); openOverlay(L.WINDOW); })))
        .when(Boolean(overlay) && L.canDock(L.findNode(layout(), "panel-body")), (el) => el.child(icon("dock-back", "⇲", () => { runAll(L.dockBackCommands()); closeOverlay(overlay); })))
        .when(Boolean(overlay), (el) => el.child(icon("close", "✕", () => closeOverlay(overlay)))));

    const sortLabel = { modified: "sortModified", created: "sortCreated", name: "sortName" };
    const header = v_flex().gap(6).flex_none()
      .child(h_flex().gap(6).items_center()
        .child(div().text_color(t.dim).child(this.fetchedAt ? say("updatedAt", { time: this.fetchedAt }) : this.loading ? say("loading") : ""))
        .child(chip("refresh", this.loading ? say("loading") : say("refresh"), (cx) => { if (!this.loading) this.refresh(cx, true); })))
      .child(div().id("filter").h(28).px(8).flex().items_center().rounded(6).border_1().border_color(t.border).bg(t.background).cursor_text()
        .on_mouse_down("left", stop)
        .child(Input.new(this.input).flex_1().h_full().text_size(12.5).text_color(t.foreground)))
      .child(h_flex().gap(4).children(L.SORTS.map((s) =>
        chip(`sort-${s}`, say(sortLabel[s]), (cx) => this.set("sort", "sort", s, cx), { on: this.sort === s, dim: this.sort !== s }))))
      .when(authors.length > 1, (el) => el.child(h_flex().gap(4).flex_wrap()
        .child(chip("author-all", say("allAuthors"), (cx) => this.set("author", "author", null, cx), { on: !author, dim: Boolean(author) }))
        .children(authors.map((a) => chip(`author-${a}`, a, (cx) => this.set("author", "author", a, cx), { on: author === a, dim: author !== a })))));

    const messages = [];
    if (this.noFolder) messages.push(div().text_color(t.muted).child(say("noFolder")));
    if (project?.warning) messages.push(div().text_color(t.blocked).child(say("configWarning", { reason: say(project.warning.reason) })));
    if (project && !project.exists) messages.push(div().text_color(t.muted).child(say("noSpectra", { dir: project.specDir.slice(project.root.length + 1) || project.specDir })));
    if (this.error) messages.push(div().text_color(t.ansi1).child(say("scanFailed", { reason: this.error })));

    const progressColor = { complete: t.done, inProgress: t.working, notStarted: t.muted, draft: t.dim };
    const row = (c) => {
      const key = L.changeKey(c);
      const open = this.expanded.includes(key);
      const commands = c.group === "archived" ? [] : L.COMMANDS;
      return v_flex().gap(3)
        .child(h_flex().id(`change-${key}`).gap(6).items_center().min_w(0).px(2).rounded(4).cursor_pointer()
          .hover((s) => s.bg(t.hover))
          .on_mouse_down("left", stop)
          .on_click((_e, cx) => this.set("expanded", "expanded", L.toggle(this.expanded, key), cx))
          .child(div().w(12).flex_none().text_color(t.muted).child(open ? "▾" : "▸"))
          .child(div().flex_1().min_w(0).truncate().text_color(t.foreground).child(c.name))
          .when(Boolean(c.proposer), (el) => el.child(div().flex_none().text_color(t.dim).child(c.proposer)))
          .when(Boolean(c.progress), (el) => el.child(div().flex_none().text_color(progressColor[c.status] ?? t.muted)
            .child(`${c.progress.complete}/${c.progress.total}`))))
        .when(open, (el) => el
          .child(h_flex().pl(18).gap(4).flex_wrap()
            .children(commands.map(([id, command]) => chip(`cmd-${id}-${key}`, id, (cx) => this.send(command, c, cx))))
            .child(chip(`copy-${key}`, say("copyName"), (cx) => this.copy(c.name, cx), { dim: true })))
          .children(c.artifacts.map((rel) =>
            div().id(`doc-${key}/${rel}`).pl(18).rounded(4).cursor_pointer().truncate().text_color(t.muted)
              .hover((s) => s.bg(t.hover).text_color(t.foreground))
              .on_mouse_down("left", stop)
              .on_click(() => this.openArtifact(c, rel))
              .child(`📄 ${rel}`))));
    };

    const group = (g) => {
      const all = data[g];
      const shown = L.sortChanges(L.filterChanges(all, this.filter, author), this.sort);
      const folded = this.collapsed.includes(g);
      return v_flex().gap(4)
        .child(h_flex().id(`group-${g}`).gap(6).items_center().cursor_pointer()
          .on_mouse_down("left", stop)
          .on_click((_e, cx) => this.set("collapsed", "collapsed", L.toggle(this.collapsed, g), cx))
          .child(div().w(12).text_color(t.muted).child(folded ? "▸" : "▾"))
          .child(div().font_semibold().text_color(g === "archived" ? t.dim : t.foreground)
            .child(`${say(g)} (${L.groupCount(shown.length, all.length, filtering)})`)))
        .when(!folded && shown.length === 0, (el) => el.child(div().pl(18).text_color(t.dim).child(say(filtering && all.length ? "noMatch" : "emptyGroup"))))
        .when(!folded, (el) => el.children(shown.map(row)));
    };

    return v_flex().size_full().bg(t.surface).text_size(13).text_color(t.foreground)
      .child(title)
      .child(v_flex().id("body").flex_1().min_h(0).p(10).gap(10).overflow_y_scrollbar()
        .child(header)
        .children(messages)
        .children(data ? L.GROUPS.map(group) : []));
  }
}
