import type { Handle } from 'mdast-util-to-hast';

export const wikiEmbedHandler: Handle = (_state, _node) => {
  // TODO: convert ObsidianEmbed node to appropriate HAST element
  //       image embeds → <img>; page embeds → inline HAST from transcluded content
  return undefined;
};
