#!/usr/bin/env node
/* eslint-disable no-console */
/* coverage ignore file */

import fs from 'node:fs/promises'
import path from 'node:path'

import colors from 'picocolors'

const ok = colors.green('✔')
const err = colors.red('✖')
const warn = colors.yellow('⚠')

function keyPair(key: string, value: string, warn: boolean = false): string {
  const val = warn ? colors.yellow(value) : colors.green(value)
  return `${colors.dim('"')}${colors.gray(key)}${colors.dim(': "')}${val}${colors.dim('"')}`
}

async function copyResource(source: string, target: string): Promise<void> {
  const directory = path.dirname(target)

  await fs.mkdir(directory, { recursive: true })

  const resource = path.resolve(import.meta.dirname, '../resources', source)
  try {
    await fs.copyFile(resource, target, fs.constants.COPYFILE_EXCL)
    console.log(`${ok} Copied ${colors.blue(target)}`)
  } catch (error: any) {
    if (error.code === 'EEXIST') {
      console.log(`${warn} Refusing to overwrite ${colors.blue(target)}`)
    } else {
      console.log(`${err} Could not copy ${colors.blue(target)}`)
      throw error
    }
  }
}

async function checkPackageJson(): Promise<void> {
  let json: Record<string, any> = {}
  try {
    json = JSON.parse(await fs.readFile('package.json', 'utf-8'))
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      console.log(`${err} No ${colors.blue('package.json')} found in the current directory`)
    } else {
      console.log(`${err} Error parsing ${colors.blue('package.json')} from the current directory`)
      throw error
    }
  }

  if (json.type !== 'module') {
    console.log(`${warn} Your ${colors.blue('package.json')} should contain ${keyPair('type', 'module', true)}`)
  } else {
    console.log(`${ok} Your ${colors.blue('package.json')} correctly contains ${keyPair('type', 'module', false)}`)
  }

  if (json.main !== 'out/main/index.js') {
    console.log(`${warn} Your ${colors.blue('package.json')} should contain ${keyPair('main', 'out/main/index.js', true)}`)
  } else {
    console.log(`${ok} Your ${colors.blue('package.json')} correctly contains ${keyPair('main', 'out/main/index.js', false)}`)
  }
}

async function main(): Promise<void> {
  console.log(colors.bold('Initializing a new Vite + Electron project...'))
  console.log()

  await checkPackageJson()

  await copyResource('env.d.ts', 'env.d.ts')
  await copyResource('tsconfig.json', 'tsconfig.json')
  await copyResource('tsconfig.app.json', 'tsconfig.app.json')
  await copyResource('tsconfig.node.json', 'tsconfig.node.json')
  await copyResource('vite.config.ts', 'vite.config.ts')

  await copyResource('index.html', 'index.html')
  await copyResource('index.css', 'src/renderer/index.css')
  await copyResource('index.ts', 'src/renderer/index.ts')

  await copyResource('preload.ts', 'src/preload/index.ts')
  await copyResource('main.ts', 'src/main/index.ts')
}

main().catch(console.error)
