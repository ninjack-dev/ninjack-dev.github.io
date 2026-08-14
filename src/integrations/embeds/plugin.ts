import { experimental_AstroContainer as AstroContainer } from "astro/container";
import type { AstroComponentFactory } from "astro/runtime/server/index.js";
import type { Element, Root } from "hast";
import type { Node, Parent } from "unist";
import { visit } from "unist-util-visit";
import type { EmbedRegistration } from "./components.ts";

/**
 * Container shared across all renders in this process. Created lazily on
 * first use; `renderToString` is safe to call concurrently (per-call render
 * state).
 *
 * This module tree (integration + plugin) is evaluated inside the throwaway
 * Vite environment Astro uses to load `astro.config.ts`
 * (`core/config/vite-load.ts` closes its server right after the config is
 * imported), so the module runner that evaluated this code is already closed
 * by the time the content layer runs it. Static imports were resolved during
 * that evaluation, but any runtime `import()` would route through the closed
 * runner and throw "Vite module runner has been closed" — never add dynamic
 * imports in this file. Container rendering is safe here because
 * `AstroContainer.create()` at astro@7.1.3 is plain JS (a manifest + a
 * pipeline, no Vite graph); it is synchronous in practice, so the rejection
 * retry below is cheap defense-in-depth rather than a live code path.
 */
let containerPromise: Promise<AstroContainer> | undefined;

function getContainer(): Promise<AstroContainer> {
  containerPromise ??= AstroContainer.create().catch((error) => {
    containerPromise = undefined;
    throw error;
  });
  return containerPromise;
}

/**
 * Raw HTML node, not modeled by `@types/hast`: Astro's markdown pipeline
 * includes rehype-raw, which parses these into hast nodes later.
 */
interface Raw extends Node {
  type: "raw";
  value: string;
}

/**
 * The container emits the components' hoisted scripts and imported styles as
 * module references that only resolve inside a Vite graph; interactive wiring
 * and styles are injected page-wide by the embeds integration instead. Strip
 * local `<script>` tags and local stylesheet `<link>`s, keeping the static
 * embed shell. Remote stylesheets (e.g. the gist's githubassets CSS) are kept.
 */
function stripLocalAssets(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi, (link) =>
      /href=["']https?:\/\//i.test(link) ? link : "",
    );
}

/**
 * Return the anchor's href when `node` is a paragraph whose only child is a
 * link whose text equals its href (a bare URL on its own line in Markdown).
 */
function loneLinkUrl(node: Element): string | undefined {
  if (node.tagName !== "p" || node.children.length !== 1) return undefined;
  const child = node.children[0];
  if (child.type !== "element" || child.tagName !== "a") return undefined;
  const { href } = child.properties;
  if (typeof href !== "string" || !href.startsWith("http")) return undefined;
  if (child.children.length !== 1) return undefined;
  const text = child.children[0];
  if (text.type !== "text" || text.value !== href) return undefined;
  return href;
}

/** Resolve a URL to an embed registration + id, or `undefined` if none match. */
function matchEmbed(
  embeds: EmbedRegistration[],
  url: string,
): { embed: EmbedRegistration; id: string } | undefined {
  for (const embed of embeds) {
    const id = embed.matcher(url);
    if (id) return { embed, id };
  }
  return undefined;
}

/**
 * Rehype plugin that converts a lone URL in Markdown into a rich media embed.
 *
 * A paragraph whose only content is a bare URL is replaced with the matching
 * embed component, rendered server-side via the Astro container API:
 *
 * ```md
 * I saw this the other day:
 *
 * https://www.youtube.com/watch?v=Hoe-woAhq_k
 * ```
 *
 * The lone URL above renders as a `<lite-youtube>` player. Only URLs on their
 * own line are converted; URLs within a paragraph are left alone. Supported
 * services and matching behavior mirror the `astro-embed` collection (with the
 * generic link-preview fallback last). If an embed cannot be rendered (e.g. a
 * network-dependent service fails at build time), the plain link is kept.
 *
 * The embed components cannot be imported here: the markdown processor runs
 * in a plain-Node context, while `.astro` modules need Astro's Vite pipeline.
 * They are loaded and registered by `src/integrations/embeds/components.ts`
 * through the
 * dev/build Vite graphs (the embeds integration injects it into the content
 * config module, which loads before the content layer renders markdown); this
 * plugin reads that registry. When the registry is absent (no content sync
 * has run in this process), lone URLs are left as plain links.
 */
export function embedPlugin() {
  return async function transformer(tree: Root) {
    const embeds = globalThis.astroEmbeds;
    if (embeds === undefined) return;

    const targets: Array<{
      index: number;
      parent: Parent;
      component: AstroComponentFactory;
      id: string;
    }> = [];

    visit(tree, "element", (node, index, parent) => {
      const url = loneLinkUrl(node);
      if (url === undefined) return;
      const match = matchEmbed(embeds, url);
      if (match === undefined || parent === undefined || index === undefined) return;
      targets.push({ index, parent, component: match.embed.component, id: match.id });
    });

    if (targets.length === 0) return;
    const container = await getContainer();

    await Promise.all(
      targets.map(async ({ index, parent, component, id }) => {
        try {
          const html = await container.renderToString(component, {
            props: { id },
          });
          const cleaned = stripLocalAssets(html);
          if (cleaned.trim().length === 0) return;
          // `raw` nodes are parsed into the tree by the pipeline's rehype-raw.
          const raw: Raw = { type: "raw", value: cleaned };
          parent.children.splice(index, 1, raw);
        } catch (error) {
          // Rendering failed (e.g. a network-dependent service at sync time):
          // keep the plain link, but surface the failure. Embeds are baked
          // into the content store during sync, so this catch is the only
          // place a degraded build becomes observable.
          console.warn(
            `[embeds] failed to render embed for ${id}; keeping the plain link:`,
            error instanceof Error ? error.message : error,
          );
        }
      }),
    );
  };
}
