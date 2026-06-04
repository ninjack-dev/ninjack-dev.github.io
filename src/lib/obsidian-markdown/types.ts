import type { Literal, Parent, RootContent } from 'mdast';

export interface ObsidianWikiLink extends Literal {
  type: 'obsidianWikiLink';
  target: string;
  alias?: string;
  heading?: string;
  blockId?: string;
}

export interface ObsidianEmbed extends Literal {
  type: 'obsidianEmbed';
  src: string;
  width?: number;
  height?: number;
}

export interface ObsidianCallout extends Parent {
  type: 'obsidianCallout';
  calloutType: string;
  title: string;
  foldable: boolean;
  defaultOpen: boolean;
  children: RootContent[];
}

declare module 'mdast' {
  interface RootContentMap {
    obsidianCallout: ObsidianCallout;
  }
  interface PhrasingContentMap {
    obsidianWikiLink: ObsidianWikiLink;
    obsidianEmbed: ObsidianEmbed;
  }
}
