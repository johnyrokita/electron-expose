/**
 * Configuration for `electron-expose`.
 */
export type ElectronExposeConfig = {
  /**
   * Directory used to build the default source glob.
   *
   * When omitted, `electron-expose` looks for `src`, then `app`, then
   * `electron`, and falls back to the project root.
   */
  root?: string

  /**
   * Source file glob or globs to scan for `@expose()` decorators and
   * `exposed(...)` functions.
   *
   * When set, this overrides the default glob derived from `root`.
   */
  include?: string | string[]

  /**
   * Additional glob or globs to ignore while scanning source files.
   *
   * Declaration files, generated output, build folders, and `node_modules` are
   * ignored automatically.
   */
  exclude?: string | string[]

  /**
   * Alias for `include`.
   *
   * Prefer `include` for new configs.
   */
  routes?: string | string[]

  /**
   * Directory where generated main, preload, and type files are written.
   *
   * @default "src/generated/electron-expose"
   */
  outDir?: string

  /**
   * Name of the API exposed on `window` in the renderer process.
   *
   * @default "api"
   */
  globalApiName?: string

  /**
   * Prefix used for generated Electron IPC channel names.
   *
   * @default "electron-expose"
   */
  routePrefix?: string

  /**
   * Path for the generated renderer global declaration file.
   *
   * Set to `false` to skip generating the renderer global declaration.
   *
   * @default "src/renderer/global.d.ts"
   */
  rendererGlobal?: string | false

  /**
   * TypeScript config file used when reading source files.
   *
   * If omitted, `electron-expose` uses `tsconfig.json` when it exists.
   */
  tsconfig?: string
}

/**
 * Options for naming an exposed class method or standalone function.
 */
export type ExposeOptions = {
  /**
   * Dot-separated API key, such as `"system.getVersion"`.
   *
   * When omitted, `electron-expose` uses the class method name or exported
   * variable name.
   */
  name?: string
}

/**
 * Define an `electron-expose` config with TypeScript autocomplete and hover
 * documentation.
 */
export function defineConfig(
  config: ElectronExposeConfig = {},
): ElectronExposeConfig {
  return config
}

/**
 * Mark an exported class method for exposure to the renderer process.
 *
 * The containing class must be exported and currently needs a zero-argument
 * constructor.
 *
 * When no name is provided, the method name is used as the generated
 * `window.api` key.
 */
export function expose(): MethodDecorator
/**
 * Mark an exported class method for exposure to the renderer process.
 *
 * The containing class must be exported and currently needs a zero-argument
 * constructor.
 *
 * @param name Dot-separated API key, such as `"system.getVersion"`.
 */
export function expose(name: string): MethodDecorator
/**
 * Mark an exported class method for exposure to the renderer process.
 *
 * The containing class must be exported and currently needs a zero-argument
 * constructor.
 */
export function expose(options: ExposeOptions): MethodDecorator
export function expose(
  nameOrOptions?: string | ExposeOptions,
): MethodDecorator {
  void nameOrOptions
  return () => {}
}

type AnyFunction = (...args: never[]) => unknown

/**
 * Mark an exported standalone function for exposure to the renderer process.
 *
 * The variable assigned to `exposed(...)` must be exported.
 *
 * When no name is provided, the exported variable name is used as the generated
 * `window.api` key.
 */
export function exposed<T extends AnyFunction>(fn: T): T
/**
 * Mark an exported standalone function for exposure to the renderer process.
 *
 * The variable assigned to `exposed(...)` must be exported.
 *
 * @param name Dot-separated API key, such as `"system.getVersion"`.
 * @param fn Function to expose.
 */
export function exposed<T extends AnyFunction>(name: string, fn: T): T
/**
 * Mark an exported standalone function for exposure to the renderer process.
 *
 * The variable assigned to `exposed(...)` must be exported.
 *
 * @param options Exposure options.
 * @param fn Function to expose.
 */
export function exposed<T extends AnyFunction>(options: ExposeOptions, fn: T): T
export function exposed<T extends AnyFunction>(
  nameOrOptionsOrFn: string | ExposeOptions | T,
  maybeFn?: T,
): T {
  return (
    typeof nameOrOptionsOrFn === "function" ? nameOrOptionsOrFn : maybeFn
  ) as T
}
