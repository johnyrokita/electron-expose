#!/usr/bin/env node
import { generateElectronExpose } from "./generator.js"
import { initElectronExpose } from "./init.js"
import pc from "picocolors"

function readArg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag)
  return index === -1 ? undefined : process.argv[index + 1]
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag)
}

async function main() {
  const command = process.argv[2]

  if (command === "generate") {
    await generateElectronExpose({
      configPath: readArg("--config") ?? "electron-expose.config.ts",
    })
    return
  }

  if (command === "init") {
    const yes = hasFlag("--yes") || hasFlag("-y")
    const write = hasFlag("--write") || yes
    await initElectronExpose({
      configPath: readArg("--config") ?? "electron-expose.config.ts",
      root: readArg("--root"),
      write,
      patchTsconfig: hasFlag("--tsconfig") || write,
      interactive: !yes && !hasFlag("--write") && !hasFlag("--no-interactive"),
    })
    return
  }

  if (!command || command === "--help" || command === "-h") {
    console.log(`${pc.bold("Usage:")}
  electron-expose init [--write] [--yes] [--root src] [--config electron-expose.config.ts]
  electron-expose generate [--config electron-expose.config.ts]`)
    process.exit(0)
  }

  {
    console.log(`${pc.red("Unknown command")} "${command}"

${pc.bold("Usage:")}
  electron-expose init [--write] [--yes] [--root src] [--config electron-expose.config.ts]
  electron-expose generate [--config electron-expose.config.ts]`)
    process.exit(command ? 1 : 0)
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exit(1)
})
