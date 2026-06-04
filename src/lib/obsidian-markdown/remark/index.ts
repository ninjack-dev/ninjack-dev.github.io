import type { Plugin } from 'unified';
import type { Root } from 'mdast';
import { transformWikiLinks } from './wiki-links.ts';
import { transformWikiEmbeds } from './wiki-embeds.ts';
import { transformCallouts } from './callouts.ts';
import { transformBlockLinks } from './block-links.ts';

export interface ObsidianPluginOptions {
  wikiLinkIndex?: Map<string, string>;
}

export const remarkObsidian: Plugin<[ObsidianPluginOptions?], Root> =
  (options) => (tree) => {
    transformWikiLinks(tree, options?.wikiLinkIndex);
    transformWikiEmbeds(tree);
    transformCallouts(tree);
    transformBlockLinks(tree);
  };
