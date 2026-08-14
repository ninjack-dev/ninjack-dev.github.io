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
import { setEmbedRegistry, type EmbedRegistration } from "./registry.ts";

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

setEmbedRegistry(embeds);
