#!/usr/bin/env bash
# Copy the spectra-viewer mod and its layout into herdr-app. Re-run after every
# change: the copy is what reloads the running mod. herdr-app refuses modules
# that resolve outside its mods folder, so symlinks into this repo can't be used.
#
# A layout edited in herdr-app's folder since the last install is not
# overwritten: copy the edits into this repo's layouts/ first, or pass --force
# to overwrite it anyway (the edited file is kept as <name>.bak-<time>).
set -euo pipefail

force=false
for arg in "$@"; do
  case "$arg" in
    --force) force=true ;;
    *) echo "usage: $0 [--force]" >&2; exit 2 ;;
  esac
done

repo="$(cd "$(dirname "$0")/.." && pwd)"
src="$repo/mods/spectra-viewer"
home="${HERDR_APP_HOME:-$HOME/.config/herdr-app}"
dest="$home/mods/spectra-viewer"
manifest="$dest/.installed-from"
# "<layout name> <sha256>" per installed layout, to notice edits made after installing.
hashes="$dest/.installed-layouts"

# Files herdr-app writes into every mod folder itself.
app_owned() { case "$1" in jsconfig.json|*.d.ts) return 0 ;; esac; return 1; }
# What the last install recorded (empty when there is none or it came from elsewhere).
installed=""
if [ -f "$manifest" ] && [ "$(head -n 1 "$manifest")" = "$src" ]; then installed="$(tail -n +2 "$manifest")"; fi
recorded() { printf '%s\n' "$installed" | grep -qxF "$1"; }
sha() { if command -v shasum >/dev/null; then shasum -a 256 "$1"; else sha256sum "$1"; fi | cut -d' ' -f1; }
recorded_sha() { [ -f "$hashes" ] && awk -v n="$1" '$1 == n { print $2 }' "$hashes" || true; }
# True when the installed layout differs from what the last install wrote (or, for installs
# from before hashes were kept, from this repo's copy).
edited() {
  local name="$1" installed_file="$home/layouts/$1" expected
  [ -f "$installed_file" ] || return 1
  expected="$(recorded_sha "$name")"
  if [ -z "$expected" ]; then
    [ -f "$repo/layouts/$name" ] || return 1
    expected="$(sha "$repo/layouts/$name")"
  fi
  [ "$(sha "$installed_file")" != "$expected" ] && { [ ! -f "$repo/layouts/$name" ] || [ "$(sha "$installed_file")" != "$(sha "$repo/layouts/$name")" ]; }
}

# Check everything before changing anything.
# Earlier installs: one symlink to the folder, or a folder of symlinks into $src.
if [ -L "$dest" ] && [ "$(readlink "$dest")" != "$src" ]; then
  echo "refusing: $dest is a symlink to $(readlink "$dest")" >&2; exit 1
fi
if [ -e "$dest" ] && [ ! -L "$dest" ]; then
  [ -d "$dest" ] || { echo "refusing: $dest exists and is not a folder" >&2; exit 1; }
  if [ ! -f "$manifest" ] || [ "$(head -n 1 "$manifest")" != "$src" ]; then
    for entry in "$dest"/* "$dest"/.[!.]*; do
      [ -e "$entry" ] || [ -L "$entry" ] || continue
      name="$(basename "$entry")"
      if app_owned "$name" && [ ! -L "$entry" ]; then continue; fi
      case "$(readlink "$entry" 2>/dev/null)" in
        "$src"/*) ;;
        *) echo "refusing: $dest was not installed from $src ($name)" >&2; exit 1 ;;
      esac
    done
  fi
fi
for layout in "$repo"/layouts/*.json; do
  [ -f "$layout" ] || continue
  name="$(basename "$layout")"
  if [ -e "$home/layouts/$name" ] && ! recorded "layout:$name"; then
    echo "refusing: $home/layouts/$name exists and was not installed from $repo" >&2; exit 1
  fi
done
# Layouts this install would overwrite or remove that were edited since the last install.
changed=()
while IFS= read -r entry; do
  case "$entry" in layout:*) edited "${entry#layout:}" && changed+=("${entry#layout:}") ;; esac
done <<<"$installed"
if [ "${#changed[@]}" -gt 0 ]; then
  if ! $force; then
    for name in "${changed[@]}"; do
      echo "refusing: $home/layouts/$name was edited since the last install." >&2
      echo "  Copy your edits into $repo/layouts/$name, or re-run with --force to overwrite it (your edit is kept as $name.bak-<time>)." >&2
    done
    exit 1
  fi
  stamp="$(date +%Y%m%d-%H%M%S)"
  for name in "${changed[@]}"; do
    cp "$home/layouts/$name" "$home/layouts/$name.bak-$stamp"
    echo "kept your edited layout as $home/layouts/$name.bak-$stamp"
  done
fi

[ -L "$dest" ] && rm "$dest"
mkdir -p "$dest" "$home/layouts"

# What this install puts in place: mod files by name, layouts as layout:<name>.
files=()
for file in "$src"/*; do
  name="$(basename "$file")"
  [ -f "$file" ] || continue
  app_owned "$name" && continue
  files+=("$name")
done
for layout in "$repo"/layouts/*.json; do
  [ -f "$layout" ] && files+=("layout:$(basename "$layout")")
done
wanted() { printf '%s\n' "${files[@]}" | grep -qxF "$1"; }

# Remove only what the last install put there and this one doesn't (and old symlinks).
# Files that stay are overwritten in place, so a layout in use never disappears.
printf '%s\n' "$installed" | while IFS= read -r entry; do
  [ -n "$entry" ] && ! wanted "$entry" || continue
  case "$entry" in
    layout:*) rm -f "$home/layouts/${entry#layout:}" ;;
    *) rm -f "$dest/$entry" ;;
  esac
done
for entry in "$dest"/*; do [ -L "$entry" ] && rm "$entry"; done

for entry in "${files[@]}"; do
  case "$entry" in
    layout:*) cp "$repo/layouts/${entry#layout:}" "$home/layouts/${entry#layout:}" ;;
    *) cp "$src/$entry" "$dest/$entry" ;;
  esac
done
{ echo "$src"; printf '%s\n' "${files[@]}"; } > "$manifest"
: > "$hashes"
for entry in "${files[@]}"; do
  case "$entry" in layout:*) echo "${entry#layout:} $(sha "$home/layouts/${entry#layout:}")" >> "$hashes" ;; esac
done
echo "installed ${#files[@]} files: $src -> $dest"
