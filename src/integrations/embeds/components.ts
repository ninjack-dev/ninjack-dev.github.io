import { BlueskyPost } from "@astro-community/astro-embed-bluesky";
import { Gist } from "@astro-community/astro-embed-gist";
import { LinkPreview } from "@astro-community/astro-embed-link-preview";
import { MastodonPost } from "@astro-community/astro-embed-mastodon";
import { Tweet } from "@astro-community/astro-embed-twitter";
import { Vimeo } from "@astro-community/astro-embed-vimeo";
import { YouTube } from "@astro-community/astro-embed-youtube";
import blueskyMatcher from "@astro-community/astro-embed-bluesky/matcher";
import gistMatcher from "@astro-community/astro-embed-gist/matcher";
import linkPreviewMatcher from "@astro-community/astro-embed-link-preview/matcher";
import mastodonMatcher from "@astro-community/astro-embed-mastodon/matcher";
import twitterMatcher from "@astro-community/astro-embed-twitter/matcher";
import vimeoMatcher from "@astro-community/astro-embed-vimeo/matcher";
import youtubeMatcher from "@astro-community/astro-embed-youtube/matcher";
import type { AstroComponentFactory } from "astro/runtime/server/index.js";

/** A URL matcher: returns an embed id (often the URL itself) or `undefined`. */
export type UrlMatcher = (url: string) => string | undefined;

/** One embed service: how to detect it and which component renders it. */
export interface EmbedRegistration {
  matcher: UrlMatcher;
  component: AstroComponentFactory;
}

/**
 * Registry slot shared between module graphs. The markdown processor runs in
 * a plain-Node context that cannot load `.astro` modules or node_modules
 * TypeScript, so the embed components cannot be imported from the plugin
 * itself. This module is loaded through the dev/build Vite graphs (the embeds
 * integration prepends an import of it to the content config module) and
 * publishes the compiled components where the plugin can reach them.
 */
declare global {
  var astroEmbeds: EmbedRegistration[] | undefined;
}

/**
 * The URL → component dispatch list, in priority order. The generic
 * link-preview matcher accepts any `https://` URL and must stay last,
 * otherwise it would shadow the service-specific matchers.
 */
const embeds: EmbedRegistration[] = [
  { matcher: blueskyMatcher, component: BlueskyPost },
  { matcher: gistMatcher, component: Gist },
  { matcher: twitterMatcher, component: Tweet },
  { matcher: vimeoMatcher, component: Vimeo },
  { matcher: youtubeMatcher, component: YouTube },
  { matcher: mastodonMatcher, component: MastodonPost },
  { matcher: linkPreviewMatcher, component: LinkPreview },
];

globalThis.astroEmbeds = embeds;
