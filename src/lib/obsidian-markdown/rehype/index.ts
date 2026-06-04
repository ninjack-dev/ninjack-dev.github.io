import type { Handlers } from 'mdast-util-to-hast';
import { blockLinkHandler } from './block-links.ts';
import { calloutHandler } from './callouts.ts';
import { wikiEmbedHandler } from './wiki-embeds.ts';
import { wikiLinkHandler } from './wiki-links.ts';

export const obsidianHandlers: Handlers = {
  obsidianWikiLink: wikiLinkHandler,
  obsidianEmbed: wikiEmbedHandler,
  obsidianCallout: calloutHandler,
  obsidianBlockLink: blockLinkHandler,
};
