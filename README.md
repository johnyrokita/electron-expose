# electron-expose

Generate type-safe Electron IPC bridges from TypeScript decorators.

> Work in progress. The core generator works and the example app runs, but the
> API may still shift while the package settles.

```ts
import { expose } from "electron-expose"

export class CalculatorRoutes {
  @expose("math.calculate")
  calculate(a: number, b: number): number {
    return a + b
  }
}
```

```ts
import { exposed } from "electron-expose"

export const getVersion = exposed(
  "system.getVersion",
  async (): Promise<string> => {
    return app.getVersion()
  },
)
```

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
electron-expose init
```

Then mark routes in the main process:

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
electron-expose generate
```

`init` is interactive. It can create config, patch detected main/preload files,
and enable `experimentalDecorators` in `tsconfig.json`.

For CI or setup scripts:

```sh
electron-expose init --yes
```

## Wire It Up

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
generates routes for `@expose()` or `exposed(...)`. Generated/build folders,
declaration files, and `node_modules` are ignored automatically.

For custom layouts:

```ts
export default defineConfig({
  include: ["packages/main/src/**/*.ts"],
  exclude: ["**/*.spec.ts"],
})
```

## Route Shapes

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

See [docs/releasing.md](docs/releasing.md) for release instructions.

## License

MIT
