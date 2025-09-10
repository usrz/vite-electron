# API Reference

* [`defineElectronConfig(...)`](#defineelectronconfig)
* [`createElectronClientEnvironment(...)`](#createelectronclientenvironment)
* [`createElectronMainEnvironment(...)`](#createelectronmainenvironment)
* [`createElectronPreloadEnvironment(...)`](#createelectronpreloadenvironment)
* [`ElectronDevEnvironment` class](#electrondevenvironment)

## `defineElectronConfig(...)`

Define the Vite configuration for an Electron project by merging opinionated
defaults with your config. Accepts any shape Vite supports: object, function,
async function, or promise.

#### Signature

```ts
defineElectronConfig(config: UserConfig): UserConfig
defineElectronConfig(config: Promise<UserConfig>): Promise<UserConfig>
defineElectronConfig(config: UserConfigFnObject): UserConfigFnObject
defineElectronConfig(config: UserConfigFnPromise): UserConfigFnPromise
defineElectronConfig(config: UserConfigFn): UserConfigFn
defineElectronConfig(config: UserConfigExport): UserConfigExport
```

#### Defaults merged into your config:

```js
{
  /* We always want imports to be relative, as we're normally serving files */
  base: './',

  build: {
    /* This eases up debugging in the `out` folder */
    minify: false,
    /* Module preloading is disabled by default, use `preload` */
    modulePreload: false,
    /* Files will be packed in an ASAR archive anyway, so... */
    reportCompressedSize: false,
  },

  /* The three environments for client (renderer), main and preload */
  environments: {
    client: createElectronClientEnvironment(),
    main: createElectronMainEnvironment(),
    preload: createElectronPreloadEnvironment(),
  },

  builder: {
    /* Build all environments by default same as running `vite build --app` */
    buildApp(... args) {},
  },
}
```

#### Example

```ts
import { defineElectronConfig } from '@usrz/vite-electron'

export default defineElectronConfig({
  clearScreen: false,
  plugins: [ /* ... */ ],
  /* Configure Vite as normal! */
})
```



## `createElectronClientEnvironment(...)`

Create a Vite environment for building Electron client/renderer code.

When called with two strings, `entry` will be injected as
`build.rollupOptions.input` and `outDir` will be injected as `build.outDir`.

#### Signature

```ts
createElectronClientEnvironment(entry?: string, outDir?: string): EnvironmentOptions
createElectronClientEnvironment(options?: EnvironmentOptions): EnvironmentOptions
```

#### Defaults merged into your config:

```js
{
  consumer: 'client',
  build: {
    rollupOptions: {
      input: 'index.html', /* ... or whatever you specify as `entry` */
    },
    outDir: 'out/renderer', /* ... or whatever you specify as `outDir` */
  },
  dev: {
    /* This will create the Electron dev environment for Vite, starting Electron
     * and providing hot-reload when the source files change... */
    createEnvironment(name, config, context) {
      return new ElectronDevEnvironment(name, config, context.ws)
    },
  },
}
```

#### Example

```ts
import { createElectronClientEnvironment } from '@usrz/vite-electron'
import { defineConfig } from 'vite'

export default defineConfig({
  /* ... all your normal Vite configurations */

  environments: {
    client: createElectronClientEnvironment(...),
    /* ... all your other Vite environments */
  },
})
```



## `createElectronMainEnvironment(...)`

Create a Vite environment for building Electron main process code.

When called with two strings, `entry` will be injected as `build.lib.entry` and
`outDir` will be injected as `build.outDir`.

#### Signature

```ts
createElectronMainEnvironment(entry?: string, outDir?: string): EnvironmentOptions
createElectronMainEnvironment(options?: EnvironmentOptions): EnvironmentOptions
```

#### Defaults merged into your config:

```js
{
  consumer: 'client',
  build: {
    lib: {
      formats: [ 'es' ], /* always output EcmaScript modules */
      entry: 'src/main/index', /* ... or whatever you specify as `entry` */
      fileName: (...) { ... }, /* output all files with the `js` extension */
    },
    rollupOptions: {
      external: (...) { ... }, /* externalizes all `node_module` libraries */
    },
    outDir: 'out/main', /* ... or whatever you specify as `outDir` */
  },
},
```

#### Example

```ts
import { createElectronMainEnvironment } from '@usrz/vite-electron'
import { defineConfig } from 'vite'

export default defineConfig({
  /* ... all your normal Vite configurations */

  environments: {
    main: createElectronMainEnvironment(...),
    /* ... all your other Vite environments */
  },
})
```



## `createElectronPreloadEnvironment(...)`

Create a Vite environment for building Electron preload process code.

When called with two strings, `entry` will be injected as `build.lib.entry` and
`outDir` will be injected as `build.outDir`.

#### Signature

```ts
createElectronPreloadEnvironment(entry?: string, outDir?: string): EnvironmentOptions
createElectronPreloadEnvironment(options?: EnvironmentOptions): EnvironmentOptions
```

#### Defaults merged into your config:

```js
{
  consumer: 'client',
  build: {
    lib: {
      formats: [ 'cjs' ], /* Compile as CJS, Electron will stub a "require" */
      entry: 'src/preload/index', /* ... or whatever you specify as `entry` */
      fileName: (...) { ... }, /* output all files with the `js` extension */
    },
    rollupOptions: {
      external: (...) { ... }, /* externalizes all `node_module` libraries */
    },
    outDir: 'out/preload', /* ... or whatever you specify as `outDir` */
  },
},
```

#### Example

```ts
import { createElectronPreloadEnvironment } from '@usrz/vite-electron'
import { defineConfig } from 'vite'

export default defineConfig({
  /* ... all your normal Vite configurations */

  environments: {
    preload: createElectronPreloadEnvironment(...),
    /* ... all your other Vite environments */
  },
})
```


## ElectronDevEnvironment

A Vite dev environment that serves the renderer and launches an Electron process
that points at the dev server. Restarts Electron after non-renderer builds
complete.

The child process receives `ELECTRON_RENDERER_URL` to locate the dev server. Use
this in your Electron app to load the renderer during development.

#### Example

```ts
/** Create the browser window */
function createWindow() {
  const mainWindow = new BrowserWindow({
    /* All your normal window configurations go here... */
    webPreferences: {
      /* Provide the `preload` script to the browser window */
      preload: path.join(import.meta.dirname, '../preload/index.js'),
    },
  });

  /* You might want to implement some extra checks here to make absolutely sure
   * you're running in development, environment variables are dangerous!!! */
  if (process.env['ELECTRON_RENDERER_URL']) {
    /* Load the hot-reloading version of the renderer code from Vite */
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    /* Load the statically-built version of the code included in your app */
    mainWindow.loadFile(path.join(import.meta.dirname, '../renderer/index.html'))
  }
}
```
