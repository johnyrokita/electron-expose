export type ElectronExposeConfig = {
  root?: string
  include?: string | string[]
  exclude?: string | string[]
  routes?: string | string[]
  outDir?: string
  globalApiName?: string
  routePrefix?: string
  rendererGlobal?: string | false
  tsconfig?: string
}

export function defineConfig(
  config: ElectronExposeConfig = {},
): ElectronExposeConfig {
  return config
}

export function expose(): MethodDecorator
export function expose(name: string): MethodDecorator
export function expose(options: { name?: string }): MethodDecorator
export function expose(
  nameOrOptions?: string | { name?: string },
): MethodDecorator {
  void nameOrOptions
  return () => {}
}

type AnyFunction = (...args: never[]) => unknown

export function exposed<T extends AnyFunction>(fn: T): T
export function exposed<T extends AnyFunction>(name: string, fn: T): T
export function exposed<T extends AnyFunction>(
  options: { name?: string },
  fn: T,
): T
export function exposed<T extends AnyFunction>(
  nameOrOptionsOrFn: string | { name?: string } | T,
  maybeFn?: T,
): T {
  return (
    typeof nameOrOptionsOrFn === "function" ? nameOrOptionsOrFn : maybeFn
  ) as T
}
