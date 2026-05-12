import type { Plugin } from 'unified';
import type { Root } from 'mdast';
import { blockLinks } from './block-links.ts';
import { callouts } from './callouts.ts';
import { wikiEmbeds } from './wiki-embeds.ts';
import { wikiLinks } from './wiki-links.ts';

export const remarkObsidian: Plugin<[], Root> = function () {
  this.use(wikiLinks);
  this.use(wikiEmbeds);
  this.use(callouts);
  this.use(blockLinks);
};
