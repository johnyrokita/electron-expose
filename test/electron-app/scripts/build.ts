import fs from "node:fs/promises"
import path from "node:path"
import { build } from "esbuild"

const appRoot = path.resolve("test/electron-app")
const dist = path.join(appRoot, "dist")

await fs.rm(dist, { recursive: true, force: true })
await fs.mkdir(dist, { recursive: true })

await Promise.all([
  build({
    entryPoints: [path.join(appRoot, "src/main/main.ts")],
    bundle: true,
    platform: "node",
    target: "node22",
    format: "cjs",
    outfile: path.join(dist, "main.cjs"),
    external: ["electron"],
  }),
  build({
    entryPoints: [path.join(appRoot, "src/main/preload.ts")],
    bundle: true,
    platform: "node",
    target: "node22",
    format: "cjs",
    outfile: path.join(dist, "preload.cjs"),
    external: ["electron"],
  }),
  build({
    entryPoints: [path.join(appRoot, "src/renderer/renderer.ts")],
    bundle: true,
    platform: "browser",
    target: "es2022",
    format: "iife",
    outfile: path.join(dist, "renderer.js"),
  }),
])

await Promise.all([
  fs.copyFile(
    path.join(appRoot, "src/renderer/index.html"),
    path.join(dist, "index.html"),
  ),
  fs.copyFile(
    path.join(appRoot, "src/renderer/style.css"),
    path.join(dist, "style.css"),
  ),
])

console.log(
  `Built Electron calculator app in ${path.relative(process.cwd(), dist)}`,
)
