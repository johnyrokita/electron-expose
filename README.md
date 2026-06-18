# electron-expose

[![NPM Version](https://img.shields.io/npm/v/electron-expose)](https://www.npmjs.com/package/electron-expose)
[![NPM License](https://img.shields.io/npm/l/electron-expose)](https://github.com/johnyrokita/electron-expose/blob/main/LICENSE)
[![NPM Downloads](https://img.shields.io/npm/d18m/electron-expose)](https://www.npmjs.com/package/electron-expose)

Generate type-safe Electron IPC bridges from decorated TypeScript functions.

Electron IPC usually means keeping channel names, main handlers, preload
bridges, shared types, and renderer calls in sync. `electron-expose` generates
that bridge from the functions you expose in code, so the renderer gets a typed
`window.api` without the repeated wiring.

One goal: make Electron IPC boring.

## Why

- No manual `ipcMain.handle(...)` and `ipcRenderer.invoke(...)` pairing
- No hand-maintained renderer API types
- No repeating the same method shape across main, preload, and renderer
- Type-safe `window.api.*` calls generated from exposed functions

Mark class methods with decorators:

```ts
import { expose } from "electron-expose"

export class CalculatorRoutes {
  @expose("math.calculate")
  calculate(a: number, b: number): number {
    return a + b
  }
}
```

Or expose standalone functions:

```ts
import { exposed } from "electron-expose"

export const getVersion = exposed(
  "system.getVersion",
  async (): Promise<string> => {
    return app.getVersion()
  },
)
```

Then call the generated API from the renderer:

```ts
const answer = await window.api.math.calculate(2, 3)
const version = await window.api.system.getVersion()
```

## Install

```sh
pnpm add electron-expose
```

## Quick Start

Initialize the project:

```sh
pnpm electron-expose init
```

Then expose functions in the main process:

```ts
import { expose } from "electron-expose"

export class CalculatorRoutes {
  @expose("math.calculate")
  calculate(a: number, b: number): number {
    return a + b
  }
}
```

Generate the Electron bridge:

```sh
pnpm electron-expose generate
```

To inspect discovered functions without writing generated files:

```sh
pnpm electron-expose list
```

`init` is interactive. It can create config, patch detected main/preload files,
and enable `experimentalDecorators` in `tsconfig.json`.

For CI or setup scripts:

```sh
pnpm electron-expose init --yes
```

## Plumb It In

Main process:

```ts
import { registerElectronExposeRoutes } from "./generated/electron-expose/main"

registerElectronExposeRoutes()
```

Preload:

```ts
import { exposeElectronApi } from "./generated/electron-expose/preload"

exposeElectronApi()
```

Renderer:

```ts
await window.api.math.calculate(2, 3)
```

## Config

Most projects can start with an empty config:

```ts
import { defineConfig } from "electron-expose"

export default defineConfig()
```

Common options:

```ts
import { defineConfig } from "electron-expose"

export default defineConfig({
  root: "src",
  outDir: "src/generated/electron-expose",
  globalApiName: "api",
  routePrefix: "electron-expose",
  rendererGlobal: "src/renderer/global.d.ts",
})
```

By default, `electron-expose` scans `root` for `*.ts` and `*.tsx`, then only
generates bridge entries for `@expose()` or `exposed(...)`.
Generated/build folders, declaration files, and `node_modules` are ignored
automatically.

For custom layouts:

```ts
export default defineConfig({
  include: ["packages/main/src/**/*.ts"],
  exclude: ["**/*.spec.ts"],
})
```

## Exposing Functions

Class methods use decorators:

```ts
export class UserRoutes {
  @expose("users.get")
  getUser(id: string): Promise<User> {
    return userService.getUser(id)
  }
}
```

Classes must be exported and currently need a zero-argument constructor.
Decorators are used as build-time markers for `electron-expose generate`; they
are not runtime registration logic.

TypeScript does not allow decorators on top-level functions, so standalone
functions use `exposed(...)`:

```ts
import { exposed } from "electron-expose"

export const ping = exposed("system.ping", (): string => "pong")
```

## Contributing

Issues, bug reports, and focused pull requests are welcome.

Before opening a pull request, run:

```sh
pnpm run check
pnpm run build
```
