// The panel's own text in English and Traditional Chinese. No herdr imports, so `node --test` runs it.
// Change names, proposers, file names and command lines are data and never pass through here.

export const STRINGS = {
  en: {
    active: "Active",
    parked: "Parked",
    archived: "Archived",
    sortModified: "Modified",
    sortCreated: "Created",
    sortName: "Name",
    allAuthors: "All",
    filter: "Filter changes…",
    refresh: "Refresh",
    loading: "Loading…",
    updatedAt: "Updated {time}",
    noFolder: "This space has no folder yet.",
    noSpectra: "No Spectra here: {dir} doesn't exist.",
    configWarning: ".spectra.yaml: {reason}; using openspec instead.",
    notString: "\"spec_dir\" is not a string",
    empty: "\"spec_dir\" is empty",
    outside: "\"spec_dir\" points outside the project",
    scanFailed: "Scan failed: {reason}",
    emptyGroup: "No changes.",
    noMatch: "No matching changes.",
    copyName: "Copy name",
    copied: "Copied {text}",
    copyFailed: "Could not copy: {reason}",
    sentTo: "Typed into {terminal}; press Enter to run it.",
    noTerminal: "No terminal to type into; copied {text} instead.",
    sendFailed: "Could not type into {terminal}: {reason}",
    missingFile: "{file} is gone.",
    toPane: "Open beside",
    reload: "Reload",
    switchLabel: "中",
  },
  "zh-TW": {
    active: "進行中",
    parked: "暫存",
    archived: "已封存",
    sortModified: "修改時間",
    sortCreated: "建立時間",
    sortName: "名稱",
    allAuthors: "全部",
    filter: "篩選 change…",
    refresh: "重新整理",
    loading: "讀取中…",
    updatedAt: "更新於 {time}",
    noFolder: "目前的 space 還沒有資料夾。",
    noSpectra: "這裡沒有 Spectra：找不到 {dir}。",
    configWarning: ".spectra.yaml：{reason}，改用 openspec。",
    notString: "\"spec_dir\" 不是字串",
    empty: "\"spec_dir\" 是空的",
    outside: "\"spec_dir\" 指到專案外面",
    scanFailed: "掃描失敗：{reason}",
    emptyGroup: "沒有 change。",
    noMatch: "沒有符合的 change。",
    copyName: "複製名稱",
    copied: "已複製 {text}",
    copyFailed: "無法複製：{reason}",
    sentTo: "已打進 {terminal}，按 Enter 執行。",
    noTerminal: "沒有可以輸入的 terminal，已改為複製 {text}。",
    sendFailed: "無法輸入到 {terminal}：{reason}",
    missingFile: "{file} 已經不在了。",
    toPane: "開在旁邊",
    reload: "重新載入",
    switchLabel: "EN",
  },
};

export const LANGUAGES = Object.keys(STRINGS);

// "zh…" gives Traditional Chinese, anything else English.
export const pickLanguage = (tag) => (/^zh/i.test(String(tag ?? "").trim()) ? "zh-TW" : "en");

// The system language from `defaults read -g AppleLanguages` (macOS) or `$LANG`.
export function languageFromDetection(platform, res) {
  if (!res || res.code !== 0) return "en";
  if (platform === "macos") {
    const m = /"?([A-Za-z]{2,3}[-_A-Za-z0-9]*)"?/.exec(res.stdout.replace(/^\s*\(\s*/, ""));
    return pickLanguage(m?.[1]);
  }
  return pickLanguage(res.stdout);
}

// The shared choice when valid, else the detected one.
export const chooseLanguage = (sharedValue, detected) => (LANGUAGES.includes(sharedValue) ? sharedValue : detected ?? "en");

export function t(lang, key, params = {}) {
  const table = STRINGS[lang] ?? STRINGS.en;
  const text = table[key] ?? STRINGS.en[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (_m, name) => (name in params ? String(params[name]) : `{${name}}`));
}
