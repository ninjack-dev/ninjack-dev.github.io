# globplus

globplus is an Astro loader which is designed[^1] to be a drop-in replacement for the first-party [`glob`](https://docs.astro.build/en/reference/content-loader-reference/#glob-loader) loader, but expanded upon to provide a hook-based interface modeled around [Astro's own integration API](https://docs.astro.build/en/reference/integrations-reference/); this provides trivial access to every stage of `glob`'s lifecycle without requiring a custom loader outright. It is being dogfood-ed heavily in this repository, providing functionality such as:

- Ontology-based metadata extraction, categorizing posts into categories, sub-categories and series (with specific content on index pages) based on directory layout
- AST-based digest hashing via [`sync-meta.ts`](../../sync-meta.ts), allowing for precise control of when the `updated` date metadata is to be changed

> [!WARNING]
> `globplus` and adjacent/consuming modules were written almost entirely by LLMs early in my exploration of the tooling. As a result, the code is unfettered garbage, and it remains unstable until a planned, focused rewrite.

## Usage

If you have written Astro integrations, then globplus will feel very familiar. For a complete list of hooks, see [`types.ts`](./types.ts). There is also a first-party set of `gp:markdown:` hooks (heavily WIP).

TODO:

- Fill out hook list (with descriptions) when stable; mimic [Astro hook docs](https://docs.astro.build/en/reference/integrations-reference/#hooks).

### Custom Integrations

For an example custom integration, see `./integrations/markdown`.

---

[^1]: Behavior parity has not been confirmed; it was an emphatic requirement in my feature spec, but given the dubious nature of the implementation, my confidence is low. While I noticed no differences in my own site between `glob` and `globplus` with simple usage, there's simply too much internal logic to effectively confirm 1:1 behaivor without extensive unit testing, which is out of scope at the moment. This is on my todo-list once site-specific features are in place.
