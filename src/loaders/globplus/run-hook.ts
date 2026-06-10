import type { AstroIntegrationLogger } from "astro";
import type { GlobPlusIntegration } from "./types.ts";

/**
 * Modeled on Astro's `runHookInternal` (`integrations/hooks.ts`): forks a
 * per-integration logger, optional-calls the hook, and warns when a hook runs
 * slowly. Unlike Astro's version, globplus hooks may return a value (e.g.
 * `gp:entry:resolveId`), so the result is propagated to the caller.
 */

const SLOW_HOOK_MS = 3000;

// Per-integration loggers, cached like Astro's `Loggers` WeakMap.
const loggers = new WeakMap<GlobPlusIntegration, AstroIntegrationLogger>();

function getLogger(
  integration: GlobPlusIntegration,
  logger: AstroIntegrationLogger,
): AstroIntegrationLogger {
  const existing = loggers.get(integration);
  if (existing) return existing;
  const forked = logger.fork(integration.name);
  loggers.set(integration, forked);
  return forked;
}

async function withSlowHookWarning<T>({
  name,
  hookName,
  hookFn,
  logger,
}: {
  name: string;
  hookName: string;
  hookFn: () => T | Promise<T>;
  logger: AstroIntegrationLogger;
}): Promise<T> {
  const timeout = setTimeout(() => {
    logger.info(`Waiting for integration "${name}", hook "${hookName}"...`);
  }, SLOW_HOOK_MS);
  try {
    return await hookFn();
  } catch (err) {
    logger.error(`An unhandled error occurred while running the "${hookName}" hook`);
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Run a single hook on a single integration if present. The `logger` injected
 * into `params` is the integration's forked logger.
 */
async function runHookInternal<THook extends keyof GlobPlus.IntegrationHooks>({
  integration,
  hookName,
  logger,
  params,
}: {
  integration: GlobPlusIntegration;
  hookName: THook;
  logger: AstroIntegrationLogger;
  params: () => Omit<Parameters<GlobPlus.IntegrationHooks[THook]>[0], "logger">;
}): Promise<ReturnType<GlobPlus.IntegrationHooks[THook]> | undefined> {
  const hook = integration.hooks?.[hookName];
  if (!hook) return undefined;
  const integrationLogger = getLogger(integration, logger);
  // Pin the generic: inferring it from `hookFn`'s `() => T | Promise<T>` shape
  // collapses T to the awaited form (e.g. `string | void` for `resolveId`), which
  // is then not assignable to the generic `ReturnType<…[THook]>` return.
  return withSlowHookWarning<ReturnType<GlobPlus.IntegrationHooks[THook]>>({
    name: integration.name,
    hookName,
    logger: integrationLogger,
    hookFn: () => {
      // Caller's params() supplies every field except `logger`; inject the forked logger.
      const hookParams = {
        ...params(),
        logger: integrationLogger,
      } as Parameters<GlobPlus.IntegrationHooks[THook]>[0];
      const run = hook as (
        p: Parameters<GlobPlus.IntegrationHooks[THook]>[0],
      ) => ReturnType<GlobPlus.IntegrationHooks[THook]>;
      return run(hookParams);
    },
  });
}

/**
 * Run a hook across every integration in the registry, in order. Returns the
 * collected results (skipping integrations that don't implement the hook).
 */
export async function runHook<THook extends keyof GlobPlus.IntegrationHooks>({
  integrations,
  hookName,
  logger,
  params,
}: {
  integrations: GlobPlusIntegration[];
  hookName: THook;
  logger: AstroIntegrationLogger;
  params: () => Omit<Parameters<GlobPlus.IntegrationHooks[THook]>[0], "logger">;
}): Promise<Array<ReturnType<GlobPlus.IntegrationHooks[THook]>>> {
  const results: Array<ReturnType<GlobPlus.IntegrationHooks[THook]>> = [];
  for (const integration of integrations) {
    const result = await runHookInternal({
      integration,
      hookName,
      logger,
      params,
    });
    if (result !== undefined) {
      results.push(result as ReturnType<GlobPlus.IntegrationHooks[THook]>);
    }
  }
  return results;
}
