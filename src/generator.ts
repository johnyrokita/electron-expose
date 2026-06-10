import fsSync from "node:fs"
import fs from "node:fs/promises"
import path from "node:path"
import fg from "fast-glob"
import { createJiti } from "jiti"
import {
  Node,
  Project,
  SyntaxKind,
  type ArrowFunction,
  type ClassDeclaration,
  type FunctionExpression,
  type FunctionDeclaration,
  type ImportDeclaration,
  type MethodDeclaration,
  type VariableDeclaration,
} from "ts-morph"
import type { ElectronExposeConfig } from "./index.js"

type GenerateOptions = {
  configPath: string
  cwd?: string
}

type ResolvedElectronExposeConfig = Required<
  Pick<ElectronExposeConfig, "outDir" | "globalApiName" | "routePrefix">
> &
  ElectronExposeConfig

type ExposedRoute = {
  key: string
  sourcePath: string
  exportName: string
  kind: "function" | "method"
  className?: string
  memberName: string
  params: RouteParam[]
  returnType: string
  signatureText: string
  sourceImports: ImportDeclaration[]
  sourceLocalTypes: string[]
}

type RouteParam = {
  name: string
  type: string
  optional: boolean
}

type RouteDiscovery = {
  cwd: string
  include: string | string[]
  routeFiles: string[]
  routes: ExposedRoute[]
}

const DEFAULTS = {
  outDir: "src/generated/electron-expose",
  globalApiName: "api",
  routePrefix: "electron-expose",
} satisfies Required<
  Pick<ElectronExposeConfig, "outDir" | "globalApiName" | "routePrefix">
>

export async function generateElectronExpose(
  options: GenerateOptions,
): Promise<void> {
  const discovery = await discoverRoutes(options)
  const { cwd, routes } = discovery
  const config = await loadConfig(path.resolve(cwd, options.configPath))
  const resolved = { ...DEFAULTS, ...config }
  const outDir = path.resolve(cwd, resolved.outDir)

  assertRoutesFound(discovery)

  validateRoutes(routes)
  await fs.mkdir(outDir, { recursive: true })

  await Promise.all([
    fs.writeFile(
      path.join(outDir, "main.ts"),
      renderMain(routes, outDir, resolved),
      "utf8",
    ),
    fs.writeFile(
      path.join(outDir, "preload.ts"),
      renderPreload(resolved),
      "utf8",
    ),
    fs.writeFile(
      path.join(outDir, "types.ts"),
      renderTypes(routes, outDir),
      "utf8",
    ),
  ])

  if (resolved.rendererGlobal !== false) {
    const globalPath = path.resolve(
      cwd,
      resolved.rendererGlobal ?? "src/renderer/global.d.ts",
    )
    await fs.mkdir(path.dirname(globalPath), { recursive: true })
    await fs.writeFile(
      globalPath,
      renderGlobal(globalPath, outDir, resolved),
      "utf8",
    )
  }

  console.log(
    `Generated ${routes.length} route${routes.length === 1 ? "" : "s"} in ${path.relative(cwd, outDir)}`,
  )
}

export async function listElectronExposeRoutes(
  options: GenerateOptions,
): Promise<void> {
  const discovery = await discoverRoutes(options)

  if (discovery.routes.length === 0) {
    console.log(renderNoRoutesMessage(discovery))
    return
  }

  const rows = discovery.routes
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((route) => {
      const source = path.relative(discovery.cwd, route.sourcePath)
      return `${route.key}  ${renderRouteSignature(route)}  ${source}`
    })

  console.log(rows.join("\n"))
}

async function discoverRoutes(
  options: GenerateOptions,
): Promise<RouteDiscovery> {
  const cwd = options.cwd ?? process.cwd()
  const config = await loadConfig(path.resolve(cwd, options.configPath))
  const resolved = { ...DEFAULTS, ...config }
  const include = resolveInclude(cwd, resolved)
  const ignore = resolveExclude(cwd, resolved)
  const routeFiles = await fg(include, {
    cwd,
    absolute: true,
    ignore,
    onlyFiles: true,
  })

  const project = new Project({
    tsConfigFilePath: findTsconfig(cwd, resolved.tsconfig),
    skipAddingFilesFromTsConfig: true,
    compilerOptions: {
      experimentalDecorators: true,
    },
  })

  const routes = routeFiles.flatMap((file) =>
    scanSourceFile(project.addSourceFileAtPath(file)),
  )

  if (routes.length > 0) validateRoutes(routes)

  return { cwd, include, routeFiles, routes }
}

function assertRoutesFound(discovery: RouteDiscovery): void {
  if (discovery.routes.length > 0) return
  throw new Error(renderNoRoutesMessage(discovery))
}

function renderNoRoutesMessage(discovery: RouteDiscovery): string {
  const include = JSON.stringify(discovery.include)

  if (discovery.routeFiles.length === 0) {
    return `No source files matched ${include}.`
  }

  return [
    `No exposed routes found in ${discovery.routeFiles.length} matched source file${discovery.routeFiles.length === 1 ? "" : "s"}.`,
    `Matched ${include}, but did not find any @expose() decorators or exposed(...) functions.`,
  ].join("\n")
}

async function loadConfig(configPath: string): Promise<ElectronExposeConfig> {
  if (!fsSync.existsSync(configPath)) return {}
  const jiti = createJiti(import.meta.url)
  const mod = await jiti.import(configPath, { default: true })
  return mod as ElectronExposeConfig
}

function resolveInclude(
  cwd: string,
  config: ElectronExposeConfig,
): string | string[] {
  if (config.routes) return config.routes
  if (config.include) return config.include

  const root = config.root ?? detectSourceRoot(cwd)
  return `${trimTrailingSlash(root)}/**/*.{ts,tsx}`
}

function resolveExclude(cwd: string, config: ElectronExposeConfig): string[] {
  const configured = Array.isArray(config.exclude)
    ? config.exclude
    : config.exclude
      ? [config.exclude]
      : []
  const outDir = config.outDir ?? DEFAULTS.outDir
  const relativeOutDir = path
    .relative(cwd, path.resolve(cwd, outDir))
    .replaceAll(path.sep, "/")

  return [
    "**/*.d.ts",
    "**/node_modules/**",
    "**/dist/**",
    "**/build/**",
    "**/out/**",
    "**/.vite/**",
    `${trimTrailingSlash(relativeOutDir)}/**`,
    ...configured,
  ]
}

function detectSourceRoot(cwd: string): string {
  for (const candidate of ["src", "app", "electron"]) {
    if (fsSync.existsSync(path.join(cwd, candidate))) return candidate
  }

  return "."
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "")
}

function findTsconfig(cwd: string, configured?: string): string | undefined {
  const tsconfig = path.resolve(cwd, configured ?? "tsconfig.json")
  return fsSync.existsSync(tsconfig) ? tsconfig : undefined
}

function scanSourceFile(
  sourceFile: ReturnType<Project["addSourceFileAtPath"]>,
): ExposedRoute[] {
  const routes: ExposedRoute[] = []
  const sourceImports = sourceFile.getImportDeclarations()
  const sourceLocalTypes = [
    ...sourceFile.getTypeAliases(),
    ...sourceFile.getInterfaces(),
    ...sourceFile.getEnums(),
  ]
    .filter((declaration) => declaration.isExported())
    .map((declaration) => declaration.getName())

  for (const declaration of sourceFile.getVariableDeclarations()) {
    const exposed = getExposedFunction(declaration)
    if (!exposed) continue
    if (
      !declaration
        .getFirstAncestorByKind(SyntaxKind.VariableStatement)
        ?.isExported()
    ) {
      throw new Error(
        `${sourceFile.getFilePath()}: exposed variable "${declaration.getName()}" must be exported`,
      )
    }

    const name = declaration.getName()
    routes.push({
      key: exposed.key ?? name,
      sourcePath: sourceFile.getFilePath(),
      exportName: name,
      kind: "function",
      memberName: name,
      params: getParams(exposed.fn),
      returnType: getReturnType(exposed.fn),
      signatureText: getSignatureText(exposed.fn),
      sourceImports,
      sourceLocalTypes,
    })
  }

  for (const cls of sourceFile.getClasses()) {
    const className = cls.getName()
    if (!className) continue

    for (const method of cls.getMethods()) {
      const key = getExposeKey(method)
      if (!key) continue
      assertExportedClass(cls, sourceFile.getFilePath())

      const methodName = method.getName()
      routes.push({
        key: key === true ? methodName : key,
        sourcePath: sourceFile.getFilePath(),
        exportName: className,
        kind: "method",
        className,
        memberName: methodName,
        params: getParams(method),
        returnType: getReturnType(method),
        signatureText: getSignatureText(method),
        sourceImports,
        sourceLocalTypes,
      })
    }
  }

  return routes
}

function getExposedFunction(
  declaration: VariableDeclaration,
): { key?: string; fn: ArrowFunction | FunctionExpression } | undefined {
  const initializer = declaration.getInitializer()
  if (!Node.isCallExpression(initializer)) return undefined

  const expression = initializer.getExpression()
  if (expression.getText() !== "exposed") return undefined

  const args = initializer.getArguments()
  const firstArg = args[0]
  const secondArg = args[1]

  if (Node.isArrowFunction(firstArg) || Node.isFunctionExpression(firstArg)) {
    return { fn: firstArg }
  }

  if (
    (Node.isStringLiteral(firstArg) ||
      Node.isObjectLiteralExpression(firstArg)) &&
    (Node.isArrowFunction(secondArg) || Node.isFunctionExpression(secondArg))
  ) {
    return { key: readExposeKeyArg(firstArg, declaration), fn: secondArg }
  }

  throw new Error(
    `${declaration.getSourceFile().getFilePath()}: exposed() expects a function, or a name/options object plus a function`,
  )
}

function getExposeKey(node: MethodDeclaration): string | true | undefined {
  const decorator = node
    .getDecorators()
    .find((item) => item.getName() === "expose")
  if (!decorator) return undefined

  const call = decorator.getCallExpression()
  const arg = call?.getArguments()[0]
  if (!arg) return true

  if (Node.isStringLiteral(arg)) return validateKey(arg.getLiteralText(), node)

  if (Node.isObjectLiteralExpression(arg)) {
    const prop = arg.getProperty("name")
    if (Node.isPropertyAssignment(prop)) {
      const init = prop.getInitializer()
      if (Node.isStringLiteral(init))
        return validateKey(init.getLiteralText(), node)
    }
  }

  throw new Error(
    `${node.getSourceFile().getFilePath()}: @expose() only accepts a string or { name: string }`,
  )
}

function readExposeKeyArg(arg: Node, declaration: VariableDeclaration): string {
  if (Node.isStringLiteral(arg))
    return validateKeyText(arg.getLiteralText(), declaration)

  if (Node.isObjectLiteralExpression(arg)) {
    const prop = arg.getProperty("name")
    if (Node.isPropertyAssignment(prop)) {
      const init = prop.getInitializer()
      if (Node.isStringLiteral(init))
        return validateKeyText(init.getLiteralText(), declaration)
    }
  }

  throw new Error(
    `${declaration.getSourceFile().getFilePath()}: exposed() only accepts a string or { name: string }`,
  )
}

function validateKey(key: string, node: MethodDeclaration): string {
  return validateKeyText(key, node)
}

function validateKeyText(key: string, node: Node): string {
  const valid = /^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/.test(key)
  if (!valid) {
    throw new Error(
      `${node.getSourceFile().getFilePath()}: invalid expose key "${key}"`,
    )
  }
  return key
}

function assertExportedClass(cls: ClassDeclaration, sourcePath: string): void {
  if (!cls.isExported()) {
    throw new Error(
      `${sourcePath}: class "${cls.getName()}" contains exposed methods but is not exported`,
    )
  }
  const ctor = cls.getConstructors()[0]
  if (
    ctor &&
    ctor
      .getParameters()
      .some((param) => !param.hasQuestionToken() && !param.getInitializer())
  ) {
    throw new Error(
      `${sourcePath}: exposed class "${cls.getName()}" must have a zero-argument constructor`,
    )
  }
}

type CallableNode =
  | FunctionDeclaration
  | MethodDeclaration
  | ArrowFunction
  | FunctionExpression

function getParams(node: CallableNode): RouteParam[] {
  const params = node.getParameters()

  return params.map((param, index) => {
    const hasInitializer = Boolean(param.getInitializer())
    const hasRequiredParamAfter = params
      .slice(index + 1)
      .some(
        (nextParam) =>
          !nextParam.hasQuestionToken() && !nextParam.getInitializer(),
      )
    const type =
      param.getTypeNode()?.getText() ?? param.getType().getText(param)

    return {
      name: param.getName() || `arg${index}`,
      type:
        hasInitializer && hasRequiredParamAfter
          ? ensureUndefinedUnion(type)
          : type,
      optional:
        param.hasQuestionToken() || (hasInitializer && !hasRequiredParamAfter),
    }
  })
}

function getReturnType(node: CallableNode): string {
  return node.getReturnTypeNode()?.getText() ?? "unknown"
}

function getSignatureText(node: CallableNode): string {
  const params = getParams(node)
    .map((param) => renderParam(param))
    .join(", ")
  return `${params} ${getReturnType(node)}`
}

function validateRoutes(routes: ExposedRoute[]): void {
  const sortedKeys = [...routes].sort((a, b) => a.key.localeCompare(b.key))
  const seen = new Set<string>()

  for (const route of sortedKeys) {
    if (seen.has(route.key))
      throw new Error(`Duplicate exposed route key "${route.key}"`)
    seen.add(route.key)
  }

  for (const route of sortedKeys) {
    for (const other of sortedKeys) {
      if (route.key !== other.key && other.key.startsWith(`${route.key}.`)) {
        throw new Error(
          `Exposed route key "${route.key}" conflicts with nested key "${other.key}"`,
        )
      }
    }
  }
}

function renderMain(
  routes: ExposedRoute[],
  outDir: string,
  config: ResolvedElectronExposeConfig,
): string {
  const typeImports = renderTypeImports(routes, outDir)
  const imports = groupBy(routes, (route) => route.sourcePath)
    .map(([sourcePath, sourceRoutes]) => {
      const names = unique(sourceRoutes.map((route) => route.exportName)).join(
        ", ",
      )
      return `import { ${names} } from "${relativeImport(outDir, sourcePath)}"`
    })
    .join("\n")

  const classes = unique(
    routes
      .filter((route) => route.kind === "method")
      .map((route) => route.className as string),
  )
    .map((className) => `  const ${lowerFirst(className)} = new ${className}()`)
    .join("\n")

  const handlers = routes
    .map((route) => {
      const args = route.params.map((param) => param.name)
      const eventArgs = args
        .map((name, index) => renderParam({ ...route.params[index], name }))
        .join(", ")
      const params = ["_event", eventArgs].filter(Boolean).join(", ")
      const target =
        route.kind === "function"
          ? `${route.memberName}(${args.join(", ")})`
          : `${lowerFirst(route.className as string)}.${route.memberName}(${args.join(", ")})`
      return [
        `  ipcMain.handle("${config.routePrefix}:${route.key}", (${params}) => {`,
        `    return ${target}`,
        "  })",
      ].join("\n")
    })
    .join("\n\n")

  return `${typeImports ? `${typeImports}\n` : ""}${imports ? `${imports}\n` : ""}import { ipcMain } from "electron"

export function registerElectronExposeRoutes() {
${classes ? `${classes}\n\n` : ""}${handlers}
}
`
}

function renderPreload(config: ResolvedElectronExposeConfig): string {
  return `import { contextBridge, ipcRenderer } from "electron"
import { routeKeys } from "./types"
import type { ElectronExposeApi } from "./types"

function assignRoute(target: Record<string, unknown>, key: string, value: (...args: unknown[]) => Promise<unknown>) {
  const parts = key.split(".")
  let cursor = target

  for (const part of parts.slice(0, -1)) {
    cursor[part] = (cursor[part] ?? {}) as Record<string, unknown>
    cursor = cursor[part] as Record<string, unknown>
  }

  cursor[parts[parts.length - 1]] = value
}

export function exposeElectronApi() {
  const api: Record<string, unknown> = {}

  for (const key of routeKeys) {
    assignRoute(api, key, (...args: unknown[]) => ipcRenderer.invoke(\`${config.routePrefix}:\${key}\`, ...args))
  }

  contextBridge.exposeInMainWorld("${config.globalApiName}", api as ElectronExposeApi)
}
`
}

function renderTypes(routes: ExposedRoute[], outDir: string): string {
  const imports = renderTypeImports(routes, outDir)
  const lines = ["export type ElectronExposeApi = {"]
  renderTypeTree(buildTypeTree(routes), lines, 1)
  lines.push("}")

  const routeKeys = routes.map((route) => `  "${route.key}",`).join("\n")

  return `${imports}${imports ? "\n" : ""}${lines.join("\n")}

export const routeKeys = [
${routeKeys}
] as const
`
}

function renderTypeImports(routes: ExposedRoute[], outDir: string): string {
  const rendered = new Map<string, Set<string>>()

  for (const route of routes) {
    for (const declaration of route.sourceImports) {
      const named = declaration
        .getNamedImports()
        .map((namedImport) => namedImport.getName())
        .filter((name) => containsIdentifier(route.signatureText, name))
      const namespace = declaration.getNamespaceImport()?.getText()
      const defaultImport = declaration.getDefaultImport()?.getText()
      const bindings = [...named]

      if (namespace && containsIdentifier(route.signatureText, namespace))
        bindings.push(`* as ${namespace}`)
      if (
        defaultImport &&
        containsIdentifier(route.signatureText, defaultImport)
      )
        bindings.push(defaultImport)
      if (bindings.length === 0) continue

      const specifier = declaration.getModuleSpecifierValue()
      const sourcePath = path.resolve(path.dirname(route.sourcePath), specifier)
      const key = specifier.startsWith(".")
        ? relativeImport(outDir, sourcePath)
        : specifier
      const set = rendered.get(key) ?? new Set<string>()
      for (const binding of bindings) set.add(binding)
      rendered.set(key, set)
    }

    const localBindings = route.sourceLocalTypes.filter((name) =>
      containsIdentifier(route.signatureText, name),
    )
    if (localBindings.length > 0) {
      const key = relativeImport(outDir, route.sourcePath)
      const set = rendered.get(key) ?? new Set<string>()
      for (const binding of localBindings) set.add(binding)
      rendered.set(key, set)
    }
  }

  return [...rendered]
    .map(([specifier, bindings]) => {
      const named = [...bindings].filter(
        (binding) => !binding.startsWith("* as "),
      )
      const namespace = [...bindings].find((binding) =>
        binding.startsWith("* as "),
      )
      if (namespace) return `import type ${namespace} from "${specifier}"`
      return `import type { ${named.join(", ")} } from "${specifier}"`
    })
    .join("\n")
}

type TypeTree = Map<string, TypeTree | ExposedRoute>

function buildTypeTree(routes: ExposedRoute[]): TypeTree {
  const root: TypeTree = new Map()
  for (const route of routes) {
    const parts = route.key.split(".")
    let cursor = root
    for (const part of parts.slice(0, -1)) {
      const existing = cursor.get(part)
      if (existing && !(existing instanceof Map))
        throw new Error(`Route key conflict at "${route.key}"`)
      const next = existing ?? new Map<string, TypeTree | ExposedRoute>()
      cursor.set(part, next)
      cursor = next as TypeTree
    }
    cursor.set(parts[parts.length - 1], route)
  }
  return root
}

function renderTypeTree(tree: TypeTree, lines: string[], depth: number): void {
  const pad = "  ".repeat(depth)
  for (const [key, value] of tree) {
    if (value instanceof Map) {
      lines.push(`${pad}${key}: {`)
      renderTypeTree(value, lines, depth + 1)
      lines.push(`${pad}}`)
      continue
    }

    const params = value.params.map((param) => renderParam(param)).join(", ")
    lines.push(`${pad}${key}(${params}): ${ensurePromise(value.returnType)}`)
  }
}

function renderRouteSignature(route: ExposedRoute): string {
  const params = route.params.map((param) => renderParam(param)).join(", ")
  return `(${params}) => ${ensurePromise(route.returnType)}`
}

function renderParam(param: RouteParam): string {
  return `${param.name}${param.optional ? "?" : ""}: ${param.type}`
}

function ensureUndefinedUnion(type: string): string {
  return /\bundefined\b/.test(type) ? type : `${type} | undefined`
}

function renderGlobal(
  globalPath: string,
  outDir: string,
  config: ResolvedElectronExposeConfig,
): string {
  return `import type { ElectronExposeApi } from "${relativeImport(path.dirname(globalPath), path.join(outDir, "types.ts"))}"

declare global {
  interface Window {
    ${config.globalApiName}: ElectronExposeApi
  }
}

export {}
`
}

function ensurePromise(type: string): string {
  return /^Promise</.test(type) ? type : `Promise<${type}>`
}

function relativeImport(fromDir: string, toFile: string): string {
  const parsed = path.parse(toFile)
  const withoutExtension = path.join(parsed.dir, parsed.name)
  let specifier = path
    .relative(fromDir, withoutExtension)
    .replaceAll(path.sep, "/")
  if (!specifier.startsWith(".")) specifier = `./${specifier}`
  return specifier
}

function containsIdentifier(text: string, identifier: string): boolean {
  return new RegExp(`\\b${escapeRegExp(identifier)}\\b`).test(text)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function groupBy<T>(
  items: T[],
  getKey: (item: T) => string,
): Array<[string, T[]]> {
  const map = new Map<string, T[]>()
  for (const item of items) {
    const key = getKey(item)
    map.set(key, [...(map.get(key) ?? []), item])
  }
  return [...map]
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)]
}

function lowerFirst(value: string): string {
  return `${value.charAt(0).toLowerCase()}${value.slice(1)}`
}
