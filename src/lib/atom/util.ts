import type { AtomOptions } from "./index.js";

/** Normalize URL to its canonical form */
export function createCanonicalURL(
  url: string,
  trailingSlash?: AtomOptions["trailingSlash"],
  base?: string,
): string {
  let pathname = url.replace(/\/index.html$/, "");
  if (!getUrlExtension(url)) {
    pathname = pathname.replace(/\/*$/, "/");
  }

  pathname = pathname.replace(/\/+/g, "/"); // remove duplicate slashes (URL() won't)

  const canonicalUrl = new URL(pathname, base).href;
  if (trailingSlash === false) {
    return canonicalUrl.replace(/\/*$/, "");
  }
  return canonicalUrl;
}

/** Check if a URL is already valid */
export function isValidURL(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {}
  return false;
}

function getUrlExtension(url: string) {
  const lastDot = url.lastIndexOf(".");
  const lastSlash = url.lastIndexOf("/");
  return lastDot > lastSlash ? url.slice(lastDot + 1) : "";
}
