# Electron environment for Vite

> **... A word of caution!**
>
> This project mainly explores the new Vite environments. While it's
> functional — providing hot reload for main, preload, and renderer scripts —
> it might not work in all scenarios.
>
> Feedback, patches, and contributions are always welcome!

This package provides opinionated helpers to build and run Electron apps with
Vite. It exports a dev environment that launches Electron during `vite` dev,
plus small helpers to set up "main", "preload", and "renderer" environments,
and a wrapper to define a complete Vite config with sensible defaults.

- [Super quick-start](#super-quick-start)
- [Configuring Vite](#configuring-vite)
- [Reference and API](./API.md)
- [License (MIT)](./LICENSE.md)



## Super quick-start

If you want a quick-start template, the easiest way to start is to create a
new project, install this package, and run the `vite-electron-init` script:

```bash
# Create a new project repo
mkdir my-electron-project
cd my-electron-project

# Initialize a simple package
npm init -y
# Ensure ESM and set Electron's main entry point
npm pkg set type=module main="out/main/index.js"

# Install this little package
npm install '@usrz/vite-electron'

# Scaffold the basic structure from our template
npx vite-electron-init

# Enjoy!
npx vite
```



## Configuring Vite

Using this is as easy as providing a default configuration in `vite.config.ts`:

```ts
import { defineElectronConfig } from '@usrz/vite-electron'

export default defineElectronConfig({
  clearScreen: false,
  plugins: [ vue() ],
  /* ... */
})
```

The defaults for your project are configured as follows:

- the main script lives in `./src/main/index.ts`
- the preload script lives in `./src/preload/index.ts`
- the renderer script lives in `./src/renderer/index.ts`
- the HTML entry file is `./index.html`
- all build output is written to `./out`

To enable hot reload, the `ELECTRON_RENDERER_URL` environment variable is
provided to the main script. When creating a window, a minimal setup looks like
this:

```ts
const mainWindow = new BrowserWindow({
  webPreferences: {
    // This is our preload script, resolved relative to this file
    preload: path.join(import.meta.dirname, '../preload/index.js'),
  },
})

// Use the Vite dev server URL if it exists, for development, otherwise load
// the local "index.html" file, resolved relative to this file
if (process.env['ELECTRON_RENDERER_URL']) {
  await mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
} else {
  await mainWindow.loadFile(path.join(import.meta.dirname, '../renderer/index.html'))
}
```

More details are available in the [reference and API](./API.md) documentation.
