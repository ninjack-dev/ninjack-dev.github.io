import type { AstroIntegration, AstroIntegrationLogger } from "astro";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as pagefind from "pagefind";

// Very loosely adapted from https://github.com/withastro/starlight/blob/main/packages/starlight/integrations/pagefind.ts
// Very janky; uses some hacky Vite config overrides and manually wrapped responses to serve the Pagefind script in dev mode.
// No clue if there's a better way; specifying MIME_TYPES is probably stupid but I don't know of a first-party Astro/Vite API
// to just arbitrarily serve some external content. Maybe a custom Astro content loader? Whatever; it's self-contained and works.

const PAGEFIND_CLIENT = "/pagefind/pagefind.js";

// This is stupid.
const MIME_TYPES: Record<string, string> = {
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".wasm": "application/wasm",
};

const SERVER_HOOKS = ((outDir: URL | null = null) => {
  return {
    // Is this an unnecessary hack? Surely there's a nicer way to bundle this.
    "astro:config:setup": ({ updateConfig }) => {
      updateConfig({
        vite: {
          plugins: [
            {
              name: "pagefind-client",
              resolveId(id) {
                if (id === PAGEFIND_CLIENT) {
                  return { id, external: true };
                }
              },
            },
          ],
        },
      });
    },
    "astro:config:done": ({ config }) => {
      outDir = config.outDir;
    },
    "astro:server:setup": ({ server, logger }) => {
      const pagefindRoot = fileURLToPath(new URL("./pagefind/", outDir!));
      if (!existsSync(pagefindRoot)) {
        logger.warn("No search index found. Run a full build to generate one.");
      }

      server.middlewares.use("/pagefind", async (req, res, next) => {
        const urlPath = (req.url ?? "/").split("?")[0];
        const filePath = resolve(pagefindRoot, "." + urlPath);
        if (!filePath.startsWith(pagefindRoot)) return next();

        // Manual mime types in the year of our lord 2026. What has this world come to.
        try {
          const body = await readFile(filePath);
          res.setHeader("Content-Type", MIME_TYPES[extname(filePath)] ?? "not my problem");
          res.end(body);
        } catch {
          next();
        }
      });
    },
  } satisfies AstroIntegration["hooks"];
})();

export default function pagefindIntegration(): AstroIntegration {
  return {
    name: "pagefind",
    hooks: {
      ...SERVER_HOOKS,
      "astro:build:done": async ({ dir, logger }) => {
        await buildSearchIndex(dir, logger);
      },
    },
  };
}

async function buildSearchIndex(dir: URL, logger: AstroIntegrationLogger) {
  try {
    const now = performance.now();
    logger.info("Building search index with Pagefind...");

    const newIndexResponse = await pagefind.createIndex();

    const { index } = assertPagefindResponse<pagefind.NewIndexResponse>(newIndexResponse, logger);

    const indexingResponse = await index.addDirectory({
      path: fileURLToPath(dir),
    });
    const { page_count } = assertPagefindResponse<pagefind.IndexingResponse>(
      indexingResponse,
      logger,
    );

    logger.info(`Found ${page_count} HTML files.`);

    const writeFilesResponse = await index.writeFiles({
      outputPath: fileURLToPath(new URL("./pagefind/", dir)),
    });
    assertPagefindResponse<pagefind.WriteFilesResponse>(writeFilesResponse, logger);

    const pagefindTime = performance.now() - now;
    logger.info(
      `Finished building search index in ${
        pagefindTime < 750
          ? `${Math.round(pagefindTime)}ms`
          : `${(pagefindTime / 1000).toFixed(2)}s`
      }.`,
    );
  } catch (cause) {
    throw new Error("Failed to build Pagefind search index.", { cause });
  } finally {
    await pagefind.close();
  }
}

function assertPagefindResponse<T extends { errors: string[] }>(
  response: T,
  logger: AstroIntegrationLogger,
) {
  if (response.errors.length > 0) {
    for (const error of response.errors) {
      logger.error(`Pagefind error: ${error}`);
    }
    throw new Error("Pagefind response contained errors.");
  }
  return response as Required<T>;
}
