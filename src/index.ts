import { spawn } from 'node:child_process'

import colors from 'picocolors'
import split2 from 'split2'
import {
  createBuilder,
  createLogger,
  defineConfig,
  DevEnvironment,
  mergeConfig,
} from 'vite'

import type { ChildProcess } from 'node:child_process'
import type { RollupError, RollupWatcher } from 'rollup'
import type {
  ConfigEnv,
  EnvironmentOptions,
  FSWatcher,
  LogErrorOptions,
  Logger,
  LogOptions,
  ResolvedConfig,
  UserConfig,
  UserConfigExport,
  UserConfigFn,
  UserConfigFnObject,
  UserConfigFnPromise,
  ViteBuilder,
  ViteDevServer,
  WebSocketServer,
} from 'vite'

/* ========================================================================== *
 * ELECTRON ENVIRONMENT                                                       *
 * ========================================================================== */

/** Create a logger for Electron, used for wrapping builder, envs, ... */
function createElectronLogger(config: ResolvedConfig): Logger {
  /* Create the root logger with our prefix "[electron]" */
  const logger = createLogger(config.logLevel, {
    allowClearScreen: false,
    customLogger: config.logger,
  })

  /* Wrap the root logger to always add timestamps and remove new lines */
  return {
    info: (msg: string, options?: LogOptions) => {
      msg = msg
          .replace('\nwatching for file', '... watching for file')
          .replace('\nbuild started', '... build started')
      logger.info(msg, { ...options, timestamp: true })
    },
    warn: (msg: string, options?: LogOptions) => logger.warn(msg, { ...options, timestamp: true }),
    error: (msg: string, options?: LogErrorOptions) => logger.error(msg, { ...options, timestamp: true }),
    warnOnce: (msg: string, options?: LogOptions) => logger.warnOnce(msg, { ...options, timestamp: true }),
    hasErrorLogged: (error: Error | RollupError) => logger.hasErrorLogged(error),
    clearScreen: () => void 0,
    get hasWarned() {
      return logger.hasWarned
    },
  }
}

/* ========================================================================== */

/** A builder that can be destroyed */
interface DestroyableViteBuilder extends ViteBuilder {
  destroy(): Promise<void>
}

/** Create our Electron builder, building all client environments *but* renderer  */
async function createElectronBuilder(
    customLogger: Logger,
    clientEnvironment: string,
    onBuildComplete?: () => void,
): Promise<DestroyableViteBuilder> {
  /* Create the builder, watching for changes */
  const builder = await createBuilder({
    customLogger,
    build: {
      watch: {
        buildDelay: 250,
        clearScreen: false,
      },
    },
  })

  /* Collect all the watchers from Rollup */
  const watchers: Record<string, RollupWatcher> = {}
  for (const [ name, environment ] of Object.entries(builder.environments)) {
    if (name === clientEnvironment) continue
    if (environment.config.consumer !== 'client') continue

    /* Wait on the *first* build to complete before resolving the watcher */
    const watcher = await builder.build(environment) as RollupWatcher
    watchers[name] = await new Promise((resolve, reject) => {
      watcher.onCurrentRun('event', async (event) => {
        if (event.code === 'ERROR') reject(event.error)
        else if (event.code === 'END') resolve(watcher)
      })
    })
  }

  /* Use the watchers gathered above to call our "onBuildComplete()" */
  let runningBuilds = 0
  for (const [ environment, watcher ] of Object.entries(watchers)) {
    watcher.on('event', (event) => {
      if (event.code === 'ERROR') {
        const error = event.error
        customLogger.error(`Error compiling\n${error.stack || error}`, { environment, error })
      } else if (event.code === 'START') {
        runningBuilds++
      } else if (event.code === 'END') {
        runningBuilds--
        if (runningBuilds === 0) onBuildComplete?.()
      }
    })
  }

  /* Return the builder, with a destroy method to close all watchers */
  return Object.assign(builder, {
    async destroy(): Promise<void> {
      await Promise.all(Object.values(watchers).map((watcher) => {
        watcher.removeListenersForCurrentRun()
        watcher.removeAllListeners()
        watcher.close()
      }))
    },
  })
}

/* ========================================================================== */

/** The Electron dev environment */
export class ElectronDevEnvironment extends DevEnvironment {
  private rootLogger: Logger
  private builder?: DestroyableViteBuilder
  private childProcess?: ChildProcess
  private server?: ViteDevServer

  constructor(
      name: string,
      config: ResolvedConfig,
      transport?: WebSocketServer,
  ) {
    const logger = createElectronLogger(config)
    super(name, { ...config, logger }, { hot: true, transport })
    this.rootLogger = logger
  }

  /* ===== PRIVATE ========================================================== */

  /** Start and monitor the Electron process */
  private async startElectron(): Promise<void> {
    /* If we already have a child process, stop it first */
    await this.stopElectron()

    /* Resolve the local server URL to pass to Electron */
    const serverUrl = this.server?.resolvedUrls?.local[0]
    if (! serverUrl) throw new Error('Cannot start Electron: server URL not available')

    const input = this.config.build?.rollupOptions?.input || '' // no nulls
    const serverPath = typeof input === 'string' ? input : // simple strings
      Array.isArray(input) ? input[0] : Object.values(input)[0] // arrays or objects

    const url = new URL(serverPath || '', serverUrl).href

    /* Spawn the Electron process */
    const electronPath = (await import('electron')).default as any as string
    this.childProcess = await new Promise<ChildProcess>((resolve, reject) => {
      const child = spawn(electronPath, [ '.' ], {
        // Ensure our variable overrides any pre-existing value
        env: { ...process.env, ELECTRON_RENDERER_URL: url },
        stdio: [ 'ignore', 'pipe', 'pipe' ],
        windowsHide: true,
      })

      /* Pipe stdout and stderr to our logger */
      const logger = createLogger(this.config.logLevel, { prefix: '[electron]' })
      child.stdout.pipe(split2()).on('data', (line: string) => logger.warn(`${line}`, { timestamp: true }))
      child.stderr.pipe(split2()).on('data', (line: string) => logger.error(`${line}`, { timestamp: true }))

      /* Handle errors and resolve when spawned */
      child.on('error', (err) => reject(err))
      child.on('spawn', () => resolve(child))

    /* Spawning of the Electron process was successful */
    }).then((child) => {
      /* When the child process closes... */
      child.on('close', (code, signal) => {
        /* Definitely clear the child process unless reassigned */
        if (this.childProcess === child) delete this.childProcess

        /* When we die because of a signal, do not restart and exit with an error */
        if (signal) {
          this.logger.warn(`Electron process ${colors.dim(`(pid=${child.pid})`)} exited with signal ${signal}`)
          process.exitCode = 1
          this.server?.close()

        /* When we die with a non-zero code, do not restart and exit with an error */
        } else if (code !== 0) {
          this.logger.warn(`Electron process ${colors.dim(`(pid=${child.pid})`)} exited with code ${code}`)
          process.exitCode = code || 1
          this.server?.close()

        /* If we exited normally (the application was quit), and we still have a
         * server (this.close() was not yet called), then restart the server */
        } else if (this.server) {
          this.logger.info(`Electron process ${colors.dim(`(pid=${child.pid})`)} exited, goodbye...`)
          process.exitCode = 0
          this.server?.close()
        }
      })

      /* Return the child process */
      this.logger.info(`Electron process ${colors.dim(`(pid=${child.pid})`)} started:`)
      this.logger.info(`${colors.gray('ELECTRON_RENDERER_URL')}${colors.dim('=')}${colors.green(url)}`)
      return child
    })
  }

  /** Stop the Electron process */
  private async stopElectron(): Promise<void> {
    await new Promise<void>((resolve) => {
      if (! this.childProcess) return resolve()

      this.logger.warn(`Stopping Electron process ${colors.dim(`(pid=${this.childProcess.pid})`)}...`)
      this.childProcess.on('close', () => resolve())
      this.childProcess.kill('SIGTERM')
      delete this.childProcess
    })
  }

  private async stopBuilder(): Promise<void> {
    if (! this.builder) return

    // this.logger.info('Stopping Electron builder...')
    await this.builder.destroy()
    this.builder = undefined
  }

  /* ===== PUBLIC =========================================================== */

  async init(options?: {
    previousInstance?: DevEnvironment,
    watcher?: FSWatcher;
  }): Promise<void> {
    // this.logger.info('Initializing Electron environment...')

    /* Stop the previous instance's Electron process and reassign builder */
    if (options?.previousInstance instanceof ElectronDevEnvironment) {
      await options.previousInstance.stopElectron() // stop *electron* only
      await options.previousInstance.stopBuilder() // stop *builder* only
    }

    /* Recreate a new builder associated with this environment */
    let reloadTimeout: NodeJS.Timeout | undefined = undefined
    this.builder = await createElectronBuilder(this.rootLogger, this.name, () => {
      clearTimeout(reloadTimeout)
      reloadTimeout = setTimeout(() => this.startElectron().catch((error: any) => {
        this.logger.error(`Error restarting Electron\n${error.stack || error}`, { error })
        process.exitCode = 1
        this.server?.close()
      }), 500)
    })

    /* Initialize the base environment */
    await super.init(options)
  }

  async listen(server: ViteDevServer): Promise<void> {
    if (! server.httpServer) throw new Error('HTTP server not available')
    this.server = server

    server.httpServer.once('listening', () => {
      this.startElectron().catch((error) => {
        this.logger.error(`Error starting Electron\n${error.stack || error}`, { error: error })
        delete this.server // clear state... we won't be going on!
        process.exitCode = 1
        server.close()
      })
    })

    await super.listen(server)
  }

  async close(): Promise<void> {
    delete this.server // prevent restarts & terminations while closing
    await this.stopElectron()
    await this.stopBuilder()
    await super.close()
  }
}

/* ========================================================================== *
 * CONFIGURATION HELPERS                                                      *
 * ========================================================================== */

/** The default configuration for library environments */
const libDefaults: EnvironmentOptions = {
  /* This is for our client "Electron" (not SSR) */
  consumer: 'client',

  /* Build defaults */
  build: {
    lib: {
      /* This should always be overridden */
      entry: 'index',
      /* We support ESM for main, CJS for preload, always write a "js" file */
      fileName: (_format, name) => `${name}.js`,
    },
    rollupOptions: {
      /* We always externalize dependencies */
      external: (id, _parent, isResolved) => {
        if (isResolved) return false // do not externalize if already resolved
        if (id.startsWith('/')) return false // do not externalize absolute paths
        if (id.startsWith('.')) return false // do not externalize relative paths
        return true // any other module is external
      },
    },
  },
}

/* ===== MAIN ENVIRONMENT =================================================== */

/** The default configuration for the main scripts */
const mainDefaults: EnvironmentOptions = mergeConfig(libDefaults, {
  build: {
    lib: {
      formats: [ 'es' ],
      entry: 'src/main/index',
    },
    outDir: 'out/main',
  },
} satisfies EnvironmentOptions)

/**
 * Create an environment for building Electron main process code.
 *
 * @param entry The entry file for the main process (default: `src/main/index`)
 * @param outDir The output directory for the built files (default: `out/main`)
 * @returns The environment configuration
 */
export function createElectronMainEnvironment(entry?: string, outDir?: string): EnvironmentOptions

/**
 * Create an environment for building Electron main process code.
 *
 * @param options The environment options to merge with the defaults.
 * @returns The environment configuration
 */
export function createElectronMainEnvironment(options?: EnvironmentOptions): EnvironmentOptions

/* Overloaded implementation */
export function createElectronMainEnvironment(
    entryOrOptions: string | EnvironmentOptions = 'src/main/index',
    outDir: string = 'out/main',
): EnvironmentOptions {
  return mergeConfig(mainDefaults, typeof entryOrOptions === 'string' ? {
    build: {
      lib: { entry: entryOrOptions },
      outDir: outDir,
    },
  } : entryOrOptions)
}

/* ===== PRELOAD ENVIRONMENT ================================================ */

/** The default configuration for the preload scripts */
const preloadDefaults: EnvironmentOptions = mergeConfig(libDefaults, {
  build: {
    lib: {
      formats: [ 'cjs' ],
      entry: 'src/preload/index',
    },
    outDir: 'out/preload',
  },
} satisfies EnvironmentOptions)

/**
 * Create an environment for building Electron preload scripts.
 *
 * @param entry The entry file for the preload script (default: `src/preload/index`)
 * @param outDir The output directory for the built files (default: `out/preload`)
 * @returns The environment configuration
 */
export function createElectronPreloadEnvironment(entry?: string, outDir?: string): EnvironmentOptions

/**
 * Create an environment for building Electron preload scripts.
 *
 * @param options The environment options to merge with the defaults.
 * @returns The environment configuration
 */
export function createElectronPreloadEnvironment(options?: EnvironmentOptions): EnvironmentOptions

/* Overloaded implementation */
export function createElectronPreloadEnvironment(
    entryOrOptions: string | EnvironmentOptions = 'src/preload/index',
    outDir: string = 'out/preload',
): EnvironmentOptions {
  return mergeConfig(preloadDefaults, typeof entryOrOptions === 'string' ? {
    build: {
      lib: { entry: entryOrOptions },
      outDir: outDir,
    },
  } : entryOrOptions)
}

/* ===== CLIENT / RENDERER ENVIRONMENT ====================================== */

/** The default configuration for the client/renderer scripts */
const clientDefaults: EnvironmentOptions = {
  build: {
    rollupOptions: {
      input: 'index.html',
    },
    outDir: 'out/renderer',
  },
  dev: {
    createEnvironment: (name, config, context) => {
      return new ElectronDevEnvironment(name, config, context.ws)
    },
  },
}

/**
 * Create the client dev environment for serving the Electron renderer scripts.
 *
 * @param entry The HTML entry for the renderer (default: `index.html`)
 * @param outDir The output directory for built assets (default: `out/renderer`)
 * @returns The environment configuration
 */
export function createElectronClientEnvironment(entry?: string, outDir?: string): EnvironmentOptions

/**
 * Create the client dev environment for serving the Electron renderer scripts.
 *
 * @param options The environment options to merge with the defaults.
 * @returns The environment configuration
 */
export function createElectronClientEnvironment(options?: EnvironmentOptions): EnvironmentOptions

/* Overloaded implementation */
export function createElectronClientEnvironment(
    entryOrOptions: string | EnvironmentOptions = 'index.html',
    outDir: string = 'out/renderer',
): EnvironmentOptions {
  return mergeConfig(clientDefaults, typeof entryOrOptions === 'string' ? {
    build: {
      rollupOptions: {
        input: entryOrOptions,
      },
      outDir: outDir,
    },
  } : entryOrOptions)
}

/* ===== FULL CONFIGURATION ================================================= */

/** The default configuration for the client/renderer scripts */
const electronDefaults: UserConfig = {
  base: './', // we load from files, always use relative paths

  build: {
    minify: false, // do not minify by default, makes debugging harder
    modulePreload: false, // do not use module preload by default
    reportCompressedSize: false, // they'll be ASAR-ed anyway
  },

  environments: {
    client: createElectronClientEnvironment(), // the renderer environment
    main: createElectronMainEnvironment(), // the main process environment
    preload: createElectronPreloadEnvironment(), // the preload environment
  },

  builder: {
    async buildApp(builder) { // build all environments sequentially
      for (const environment of Object.values(builder.environments)) {
        await builder.build(environment)
      }
    },
  },
}

/** Define the Vite configuration for Electron, using opinionated defaults */
export function defineElectronConfig(config: UserConfig): UserConfig
/** Define the Vite configuration for Electron, using opinionated defaults */
export function defineElectronConfig(config: Promise<UserConfig>): Promise<UserConfig>
/** Define the Vite configuration for Electron, using opinionated defaults */
export function defineElectronConfig(config: UserConfigFnObject): UserConfigFnObject
/** Define the Vite configuration for Electron, using opinionated defaults */
export function defineElectronConfig(config: UserConfigFnPromise): UserConfigFnPromise
/** Define the Vite configuration for Electron, using opinionated defaults */
export function defineElectronConfig(config: UserConfigFn): UserConfigFn
/** Define the Vite configuration for Electron, using opinionated defaults */
export function defineElectronConfig(config: UserConfigExport): UserConfigExport

/* Overloaded implementation */
export function defineElectronConfig(config: UserConfigExport = {}): UserConfigExport {
  const result = defineConfig(config)

  /* Functions get called, then fed back to "defineElectronConfig(...)" */
  if (typeof result === 'function') {
    return (env: ConfigEnv) => defineElectronConfig(result(env)) as UserConfig | Promise<UserConfig>

  /* Promises get awaited, then fed back to "defineElectronConfig(...)" */
  } else if (('then' in result) && (typeof result.then === 'function')) {
    return result.then((config) => defineElectronConfig(config))

  /* Objects get merged with our defaults */
  } else {
    return mergeConfig(electronDefaults, result)
  }
}

/* ========================================================================== *
 * CONFIG                                                                     *
 * ========================================================================== */

export default defineElectronConfig({
  clearScreen: false,
})
