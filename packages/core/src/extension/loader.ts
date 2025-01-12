import {
  ExtensionWebExports,
  DetectedExtension,
  ProcessedExtensions,
  WebpackModuleFunc
} from "@moonlight-mod/types";
import { readConfig } from "../config";
import Logger from "../util/logger";
import { registerPatch, registerWebpackModule } from "../patch";
import calculateDependencies from "../util/dependency";
import { createEventEmitter } from "../util/event";

const logger = new Logger("core/extension/loader");

async function loadExt(ext: DetectedExtension) {
  webPreload: {
    if (ext.scripts.web != null) {
      const source =
        ext.scripts.web + "\n//# sourceURL=file:///" + ext.scripts.webPath;
      const fn = new Function("require", "module", "exports", source);

      const module = { id: ext.id, exports: {} };
      fn.apply(window, [
        () => {
          logger.warn("Attempted to require() from web");
        },
        module,
        module.exports
      ]);

      const exports: ExtensionWebExports = module.exports;
      if (exports.patches != null) {
        let idx = 0;
        for (const patch of exports.patches) {
          if (Array.isArray(patch.replace)) {
            for (const replacement of patch.replace) {
              const newPatch = Object.assign({}, patch, {
                replace: replacement
              });

              registerPatch({ ...newPatch, ext: ext.id, id: idx });
              idx++;
            }
          } else {
            registerPatch({ ...patch, ext: ext.id, id: idx });
            idx++;
          }
        }
      }

      if (exports.webpackModules != null) {
        for (const [name, wp] of Object.entries(exports.webpackModules)) {
          if (wp.run == null && ext.scripts.webpackModules?.[name] != null) {
            const func = new Function(
              "module",
              "exports",
              "require",
              ext.scripts.webpackModules[name]!
            ) as WebpackModuleFunc;
            registerWebpackModule({
              ...wp,
              ext: ext.id,
              id: name,
              run: func
            });
          } else {
            registerWebpackModule({ ...wp, ext: ext.id, id: name });
          }
        }
      }
    }
  }

  nodePreload: {
    if (ext.scripts.nodePath != null) {
      try {
        const module = require(ext.scripts.nodePath);
        moonlightNode.nativesCache[ext.id] = module;
      } catch (e) {
        logger.error(`Failed to load extension "${ext.id}"`, e);
      }
    }
  }

  injector: {
    if (ext.scripts.hostPath != null) {
      try {
        require(ext.scripts.hostPath);
      } catch (e) {
        logger.error(`Failed to load extension "${ext.id}"`, e);
      }
    }
  }
}

/*
  This function resolves extensions and loads them, split into a few stages:

  - Duplicate detection (removing multiple extensions with the same internal ID)
  - Dependency resolution (creating a dependency graph & detecting circular dependencies)
  - Failed dependency pruning
  - Implicit dependency resolution (enabling extensions that are dependencies of other extensions)
  - Loading all extensions

  Instead of constructing an order from the dependency graph and loading
  extensions synchronously, we load them in parallel asynchronously. Loading
  extensions fires an event on completion, which allows us to await the loading
  of another extension, resolving dependencies & load order effectively.
*/
export async function loadExtensions(
  exts: DetectedExtension[]
): Promise<ProcessedExtensions> {
  const items = exts
    .map((ext) => {
      return {
        id: ext.id,
        data: ext
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  const [sorted, dependencyGraph] = calculateDependencies(
    items,

    function fetchDep(id) {
      return exts.find((x) => x.id === id) ?? null;
    },

    function getDeps(item) {
      return item.data.manifest.dependencies ?? [];
    },

    function getIncompatible(item) {
      return item.data.manifest.incompatible ?? [];
    }
  );
  exts = sorted.map((x) => x.data);

  logger.debug(
    "Implicit dependency stage - extension list:",
    exts.map((x) => x.id)
  );
  const config = readConfig();
  const implicitlyEnabled: string[] = [];

  function isEnabledInConfig(ext: DetectedExtension) {
    if (implicitlyEnabled.includes(ext.id)) return true;

    const entry = config.extensions[ext.id];
    if (entry == null) return false;

    if (entry === true) return true;
    if (typeof entry === "object" && entry.enabled === true) return true;

    return false;
  }

  function validateDeps(ext: DetectedExtension) {
    if (isEnabledInConfig(ext)) {
      const deps = dependencyGraph.get(ext.id)!;
      for (const dep of deps.values()) {
        validateDeps(exts.find((e) => e.id === dep)!);
      }
    } else {
      const dependsOnMe = Array.from(dependencyGraph.entries()).filter(
        ([, v]) => v?.has(ext.id)
      );

      if (dependsOnMe.length > 0) {
        logger.debug("Implicitly enabling extension", ext.id);
        implicitlyEnabled.push(ext.id);
      }
    }
  }

  for (const ext of exts) validateDeps(ext);
  exts = exts.filter((e) => isEnabledInConfig(e));

  return {
    extensions: exts,
    dependencyGraph
  };
}

export async function loadProcessedExtensions({
  extensions,
  dependencyGraph
}: ProcessedExtensions) {
  const eventEmitter = createEventEmitter();
  const finished: Set<string> = new Set();

  logger.debug(
    "Load stage - extension list:",
    extensions.map((x) => x.id)
  );

  async function loadExtWithDependencies(ext: DetectedExtension) {
    const deps = Array.from(dependencyGraph.get(ext.id)!);

    // Wait for the dependencies to finish
    const waitPromises = deps.map(
      (dep: string) =>
        new Promise<void>((r) => {
          function cb(eventDep: string) {
            if (eventDep === dep) {
              done();
            }
          }

          function done() {
            eventEmitter.removeEventListener("ext-ready", cb);
            r();
          }

          eventEmitter.addEventListener("ext-ready", cb);
          if (finished.has(dep)) done();
        })
    );

    if (waitPromises.length > 0) {
      logger.debug(
        `Waiting on ${waitPromises.length} dependencies for "${ext.id}"`
      );
      await Promise.all(waitPromises);
    }

    logger.debug(`Loading "${ext.id}"`);
    await loadExt(ext);

    finished.add(ext.id);
    eventEmitter.dispatchEvent("ext-ready", ext.id);
    logger.debug(`Loaded "${ext.id}"`);
  }

  webPreload: {
    for (const ext of extensions) {
      moonlight.enabledExtensions.add(ext.id);
    }
  }

  logger.debug("Loading all extensions");
  await Promise.all(extensions.map(loadExtWithDependencies));
  logger.info(`Loaded ${extensions.length} extensions`);
}
