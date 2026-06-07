import { slugSegment } from "./ontology/index.ts";

/**
 * The `Tag` concept: normalize raw tag strings (plain or Obsidian wiki-link
 * form) to a canonical slug identity and a human-readable display label.
 *
 * Slugs via `slugSegment` (the same `github-slugger` the loader uses), so a
 * normalized tag matches a `Tags` collection entry id, which slugs its filename
 * the same way.
 *
 * Node compatible (no `Deno` namespace, no `jsr:@std/*`).
 */

/**
 * Strip a raw tag down to its canonical display target, before slugging.
 *
 * A tag may be a plain string (`NixOS`) or an Obsidian wiki link Obsidian may
 * path-prefix (`[[NixOS]]`, `[[Tags/NixOS]]`, `[[Tags/NixOS|NixOS]]`,
 * `[[Tags/NixOS.md]]`). The wiki-link form is purely cosmetic. Steps:
 *  1. trim whitespace,
 *  2. strip surrounding `[[ ]]` brackets,
 *  3. drop any `|alias` suffix (keep the link target),
 *  4. take the basename after the last `/`,
 *  5. strip a trailing `.md`.
 */
function cleanTag(raw: string): string {
  let value = raw.trim();
  if (value.startsWith("[[") && value.endsWith("]]")) {
    value = value.slice(2, -2);
  }
  const pipe = value.indexOf("|");
  if (pipe !== -1) value = value.slice(0, pipe);
  value = value.slice(value.lastIndexOf("/") + 1);
  if (value.toLowerCase().endsWith(".md")) value = value.slice(0, -3);
  return value.trim();
}

/**
 * Normalize a raw tag (any of the forms above) to its canonical slug. All of
 * `NixOS`, `[[NixOS]]`, `[[Tags/NixOS]]`, `[[Tags/NixOS|NixOS]]`, and
 * `[[Tags/NixOS.md]]` normalize to `nixos`. This slug is the tag's identity and
 * matches a `Tags` collection entry id (which slugs its filename the same way).
 */
export function normalizeTag(raw: string): string {
  return slugSegment(cleanTag(raw));
}

/**
 * A human-readable label for a raw tag: the cleaned target/basename with the
 * wiki-link cosmetics removed. The canonical display name should come from a
 * matching `Tags` entry when present; this is the fallback.
 */
export function displayTag(raw: string): string {
  return cleanTag(raw);
}
