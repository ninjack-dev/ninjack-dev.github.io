## Pagefind

This site uses Pagefind to index search results. For [idiomatic programmatic access to the search API], it's required to import the built `pagefind.js` module; Vite is configured to pass references to this through, but TSC (and thus Astro) freaks out because 1) it's untyped, and 2) `/pagefind/pagefind.js` doesn't refer to anything. There's an [upstream issue](https://github.com/Pagefind/pagefind/issues/767) for this, but it's still WIP; fortunately, we can just pull down the WIP types. Unfortunately, there's no way to shim a module so that the lazily loaded module is typed correctly (not unless we manually destructure and re-export the type), so I've just specified `as PagefindInstance` where the API is imported.

Three changes should be made once type resolution gets first-party support:
- Remove [../scripts/download-pagefind-types.ts]
- Remove the `paths` entry for `/pagefind/pagefind.js` which currently points at the "empty" `index.d.ts` module
- Maybe remove the `as PagefindInstance` from [../src/pages/404.astro], in case the `import` is typed correctly.
