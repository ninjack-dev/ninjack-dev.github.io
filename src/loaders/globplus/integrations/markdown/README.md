# `gp:markdown` integration

> [!warning]
> The design here is very WIP.

First-party globplus hook set that exposes two markdown render-stage hooks:

- `gp:markdown:mdast:postProcess` - inspect and mutate the parsed MDAST (post-parse, pre-HAST).
- `gp:markdown:hast:postProcess` - mutate the HAST (post-conversion).

Register `markdownHooks` in a `globplus` collection's `integrations` array to enable them. It installs bridge transformers into the collection's markdown processor; peers (e.g. `syncMeta`) implement the hooks.

## Supported processors

The bridges are spliced into `config.markdown.processor` via a small processor-adapter layer (`processors.ts`):

- **`unified()`** (remark/rehype) — supported, plan to export directly with ``
- **Sätteri** (`@astrojs/markdown-satteri`, made default in Astro 7) is a planned extension. See the commented recipe in `processors.ts`.

An **unsupported processor** disables `gp:markdown:*` hooks for the collection with a warning; the config is left untouched.

## Adding a processor

Add a branch to `bridgeProcessor` in `processors.ts`. The branch detects its processor kind (via that processor's own `is...Processor` guard; Astro's Unified processor exports `isUnifiedProcessor`, for example) and rebuilds it through its factory, spreading the existing resolved `options` and appending the two `StageBridges`. Rebuilding via the factory is, unfortunately, required: processors (supposedly) capture their plugins lazily, so spreading/cloning the processor object does not pick up appended plugins.
