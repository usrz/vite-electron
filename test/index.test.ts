import { createElectronClientEnvironment, createElectronMainEnvironment, createElectronPreloadEnvironment, defineElectronConfig } from '../src/index'

import type { ModuleFormat } from 'rollup'

describe('Electron Vite Configuration', () => {
  describe('defineElectronConfig(...)', () => {
    it('should export a somewhat opinionated configuration', () => {
      const config = defineElectronConfig({})

      expect(config).toEqual({
        base: './',
        build: {
          minify: false,
          modulePreload: false,
          reportCompressedSize: false,
        },
        environments: {
          client: {
            consumer: 'client',
            build: {
              rollupOptions: {
                input: 'index.html',
              },
              outDir: 'out/renderer',
            },
            dev: {
              createEnvironment: expect.toBeA('function'),
            },
          },
          main: {
            consumer: 'client',
            build: {
              lib: {
                entry: 'src/main/index',
                fileName: expect.toBeA('function'),
                formats: [ 'es' ],
              },
              rollupOptions: {
                external: expect.toBeA('function'),
              },
              outDir: 'out/main',
            },
          },
          preload: {
            consumer: 'client',
            build: {
              lib: {
                entry: 'src/preload/index',
                fileName: expect.toBeA('function'),
                formats: [ 'cjs' ],
              },

              rollupOptions: {
                external: expect.toBeA('function'),
              },
              outDir: 'out/preload',
            },
          },
        },
        builder: {
          buildApp: expect.toBeA('function'),
        },
      })
    })

    it('should use all sorts of configurations', async () => {
      const baseConfig = defineElectronConfig({
        build: { sourcemap: true },
        environments: {
          client: {
            build: { rollupOptions: { input: 'input.html' } },
          },
          main: {
            build: { lib: { entry: 'main.ts' } },
          },
          preload: {
            build: { lib: { entry: 'preload.ts' } },
          },
        },
      })

      const config = defineElectronConfig(baseConfig)
      expect((config as any).build?.sourcemap).toBeTrue()
      expect((config as any).environments?.client?.build?.rollupOptions?.input).toEqual('input.html')
      expect((config as any).environments?.preload?.build?.lib?.entry).toEqual('preload.ts')
      expect((config as any).environments?.main?.build?.lib?.entry).toEqual('main.ts')

      // Idempotent
      expect(defineElectronConfig(baseConfig)).toEqual(config)
      // Idempotent with function
      expect(defineElectronConfig(() => baseConfig)({
        command: 'build',
        mode: 'production',
      })).toEqual(config)
      // Idempotent with promises
      await expect(defineElectronConfig(Promise.resolve(baseConfig))).toBeResolvedWith(config)
      // Idempotent with async functions
      await expect(defineElectronConfig(async () => baseConfig)({
        command: 'build',
        mode: 'production',
      })).toBeResolvedWith(config)
    })
  })

  /* ======================================================================== */

  describe('createElectronMainEnvironment(...)', () => {
    it('should create the main environment configuration merging another', () => {
      const config = createElectronMainEnvironment({ build: { sourcemap: true } })

      expect(config).toEqual({
        consumer: 'client',
        build: {
          lib: {
            entry: 'src/main/index',
            fileName: expect.toBeA('function'),
            formats: [ 'es' ],
          },
          rollupOptions: {
            external: expect.toBeA('function'),
          },
          outDir: 'out/main',
          sourcemap: true,
        },
      })
    })

    it('should create the main environment configuration using paths', () => {
      const config = createElectronMainEnvironment('input', 'output')

      expect(config).toEqual({
        consumer: 'client',
        build: {
          lib: {
            entry: 'input',
            fileName: expect.toBeA('function'),
            formats: [ 'es' ],
          },
          rollupOptions: {
            external: expect.toBeA('function'),
          },
          outDir: 'output',
        },
      })
    })
  })

  /* ======================================================================== */

  describe('createElectronPreloadEnvironment(...)', () => {
    it('should create the preload environment configuration merging another', () => {
      const config = createElectronPreloadEnvironment({ build: { sourcemap: true } })

      expect(config).toEqual({
        consumer: 'client',
        build: {
          lib: {
            entry: 'src/preload/index',
            fileName: expect.toBeA('function'),
            formats: [ 'cjs' ],
          },
          rollupOptions: {
            external: expect.toBeA('function'),
          },
          outDir: 'out/preload',
          sourcemap: true,
        },
      })
    })

    it('should create the preload environment configuration using paths', () => {
      const config = createElectronPreloadEnvironment('input', 'output')

      expect(config).toEqual({
        consumer: 'client',
        build: {
          lib: {
            entry: 'input',
            fileName: expect.toBeA('function'),
            formats: [ 'cjs' ],
          },
          rollupOptions: {
            external: expect.toBeA('function'),
          },
          outDir: 'output',
        },
      })
    })
  })

  /* ======================================================================== */

  describe('createElectronClientEnvironment(...)', () => {
    it('should create the client environment configuration merging another', () => {
      const config = createElectronClientEnvironment({ build: { sourcemap: true } })

      expect(config).toEqual({
        consumer: 'client',
        build: {
          rollupOptions: {
            input: 'index.html',
          },
          outDir: 'out/renderer',
          sourcemap: true,
        },
        dev: {
          createEnvironment: expect.toBeA('function'),
        },
      })
    })

    it('should create the client renderer environment configuration using paths', () => {
      const config = createElectronClientEnvironment('input', 'output')

      expect(config).toEqual({
        consumer: 'client',
        build: {
          rollupOptions: {
            input: 'input',
          },
          outDir: 'output',
        },
        dev: {
          createEnvironment: expect.toBeA('function'),
        },
      })
    })
  })

  /* ======================================================================== */

  describe('utility functions', () => {
    it('should mark all modules as "external" in main/preload builds', () => {
      const mainExternal = (createElectronMainEnvironment() as any)
          .build?.rollupOptions?.external as (id: string) => boolean
      const preloadExternal = (createElectronPreloadEnvironment() as any)
          .build?.rollupOptions?.external as (id: string) => boolean

      expect(mainExternal).toBeA('function')
      expect(mainExternal).toStrictlyEqual(preloadExternal)

      expect(mainExternal('electron')).toBeTrue()
      expect(mainExternal('fs')).toBeTrue()
      expect(mainExternal('path')).toBeTrue()
      expect(mainExternal('some-module')).toBeTrue()

      expect(mainExternal('./relative')).toBeFalse()
      expect(mainExternal('../relative')).toBeFalse()
      expect(mainExternal('/absolute')).toBeFalse()
    })

    it('should rename all entries as simple ".js" files', () => {
      const mainFileName = (createElectronMainEnvironment() as any)
          .build?.lib?.fileName as (format: ModuleFormat, id: string) => string
      const preloadFileName = (createElectronPreloadEnvironment() as any)
          .build?.lib?.fileName as (format: ModuleFormat, id: string) => string

      expect(mainFileName).toBeA('function')
      expect(mainFileName).toStrictlyEqual(preloadFileName)

      expect(mainFileName('es', 'index')).toEqual('index.js')
      expect(mainFileName('cjs', 'index')).toEqual('index.js')

      expect(mainFileName('es', 'foo/bar/baz')).toEqual('foo/bar/baz.js')
      expect(mainFileName('cjs', 'foo/bar/baz')).toEqual('foo/bar/baz.js')
    })
  })
})
