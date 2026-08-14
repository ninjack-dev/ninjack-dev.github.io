import type { AstroComponentFactory } from "astro/runtime/server/index.js";

/** A URL matcher: returns an embed id or `undefined`. */
export type UrlMatcher = (url: string) => string | undefined;

/** One embed service: how to detect it and which component renders it. */
export interface EmbedRegistration {
  matcher: UrlMatcher;
  component: AstroComponentFactory;
}

/**
 * The registry lives on process-global state because it must cross module
 * graphs. The rehype plugin runs in a plain-Node context that cannot load
 * `.astro` modules; the components are loaded through the dev/build Vite
 * graphs. Module-scoped state stays within one graph, so only the process
 * global can carry the registry between them. `Symbol.for` keeps the key
 * shared across module instances without polluting a readable global name.
 */
const KEY = Symbol.for("astro.embeds.registry");

export function setEmbedRegistry(embeds: EmbedRegistration[]): void {
  (globalThis as Record<PropertyKey, unknown>)[KEY] = embeds;
}

export function getEmbedRegistry(): EmbedRegistration[] | undefined {
  return (globalThis as Record<PropertyKey, unknown>)[KEY] as
    | EmbedRegistration[]
    | undefined;
}
