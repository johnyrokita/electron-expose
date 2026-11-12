#!/usr/bin/env node
import {
  generateElectronExpose,
  listElectronExposeRoutes,
  watchElectronExpose,
} from "./generator.js"
import { initElectronExpose } from "./init.js"
import pc from "picocolors"

const USAGE = `${pc.bold("Usage:")}
  electron-expose init [--write] [--yes] [--root src] [--config electron-expose.config.ts]
  electron-expose generate [--watch] [--config electron-expose.config.ts]
  electron-expose list [--config electron-expose.config.ts]`

function readArg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag)
  return index === -1 ? undefined : process.argv[index + 1]
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag)
}

async function main() {
  const command = process.argv[2]
  const configPath = readArg("--config")

  if (command === "generate") {
    if (hasFlag("--watch")) {
      await watchElectronExpose({ configPath })
      console.log(pc.dim("Watching for changes..."))
      return
    }

    await generateElectronExpose({ configPath })
    return
  }

  if (command === "list") {
    await listElectronExposeRoutes({ configPath })
    return
  }

  if (command === "init") {
    const yes = hasFlag("--yes") || hasFlag("-y")
    const write = hasFlag("--write") || yes
    await initElectronExpose({
      configPath: configPath ?? "electron-expose.config.ts",
      root: readArg("--root"),
      write,
      patchTsconfig: hasFlag("--tsconfig") || write,
      interactive: !yes && !hasFlag("--write") && !hasFlag("--no-interactive"),
    })
    return
  }

  if (!command || command === "--help" || command === "-h") {
    console.log(USAGE)
    return
  }

  console.error(`${pc.red("Unknown command")} "${command}"\n\n${USAGE}`)
  process.exit(1)
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exit(1)
})
