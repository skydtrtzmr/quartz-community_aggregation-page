/**
 * 聚合规则的最小解析实现。
 *
 * 为什么在这里再写一份：`generate()` 跑在 Phase 1（PageTypeDispatcher），
 * 而 `aggregation-pro` 的产物 `static/aggregation.json` 在 Phase 2 才写出（且并行、无顺序保证），
 * 页面生成阶段读不到它。因此本插件从 `configuration.aggregation` 直接解析，
 * **语义必须与 aggregation-pro 的 compiler 一致**（test/rules.test.ts 用同一组用例对拍）：
 * - 目录上下文 = 源文件 slug 去掉文件名后按 `root.depth` 截断；根目录为 `"/"`
 * - 未配置的目录逐层向父目录回退，最终使用 `branches.default`
 * - 显式 `[]` 会**停止**继承（不能回退到父级）
 * - 规则只有 `folder` 与 `field` 两种（date 已并入 field，值即分组键）
 *
 * 容错策略（与 aggregation-pro 的“非法即抛错”不同）：这里任何非法配置只告警并返回 null，
 * 让维度页整体不生成，避免页面侧先于聚合侧把构建打断；真正的严格校验仍由 aggregation-pro 负责。
 */
import { slugifyPath } from "@quartz-community/utils/path"

export interface FolderAggregationRule {
  type: "folder"
  /** 正整数的目录深度，默认 1 */
  depth?: number
}

export interface FieldAggregationRule {
  type: "field"
  field: string
}

export type DimensionRule = FolderAggregationRule | FieldAggregationRule

export interface NormalizedAggregation {
  root: { depth: number }
  branches: {
    default: DimensionRule[]
    folders: Record<string, DimensionRule[]>
  }
}

export interface AggregationItem {
  slug: string
  frontmatter?: Record<string, unknown>
}

function warn(message: string) {
  console.warn(`[AggregationPage] ${message}`)
}

/** 目录上下文：去掉末段文件名，再按 depth 截断；根目录返回 "/"（与 aggregation-pro 同款） */
export function folderContextOf(slug: string, depth: number): string {
  const parts = slug.split("/").slice(0, -1).slice(0, Math.max(1, depth))
  return parts.join("/") || "/"
}

/** 与 aggregation-pro 的 keys() 对齐：规则里不接受未声明的键 */
function assertKeys(input: Record<string, unknown>, allowed: string[], path: string): boolean {
  for (const key of Object.keys(input)) {
    if (!allowed.includes(key)) {
      warn(`${path}.${key} 不是合法键（只允许 ${allowed.join(" / ")}），已忽略整份聚合配置`)
      return false
    }
  }
  return true
}

function parseRule(value: unknown, path: string): DimensionRule | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    warn(`${path} 不是对象，已忽略整份聚合配置`)
    return null
  }
  const input = value as Record<string, unknown>
  if (input.type === "folder") {
    if (!assertKeys(input, ["type", "depth"], path)) return null
    const depth = input.depth === undefined ? 1 : input.depth
    if (typeof depth !== "number" || !Number.isInteger(depth) || depth < 1) {
      warn(`${path}.depth 必须是 >=1 的整数，已忽略整份聚合配置`)
      return null
    }
    return { type: "folder", depth }
  }
  if (input.type === "field") {
    if (!assertKeys(input, ["type", "field"], path)) return null
    if (typeof input.field !== "string" || input.field.trim().length === 0) {
      warn(`${path}.field 必须是非空字符串，已忽略整份聚合配置`)
      return null
    }
    return { type: "field", field: input.field.trim() }
  }
  warn(`${path}.type 只能是 folder 或 field（收到 ${JSON.stringify(input.type)}），已忽略整份聚合配置`)
  return null
}

function parseChain(value: unknown, path: string): DimensionRule[] | null {
  if (!Array.isArray(value)) {
    warn(`${path} 必须是数组（[] 表示停止继承），已忽略整份聚合配置`)
    return null
  }
  const rules: DimensionRule[] = []
  for (let i = 0; i < value.length; i++) {
    const rule = parseRule(value[i], `${path}[${i}]`)
    if (!rule) return null
    rules.push(rule)
  }
  return rules
}

/**
 * 目录键规范化：与 aggregation-pro 的 directoryKey 同口径。
 * `"/"` 代表内容根；其余按 slug 拼写规范化；含 `.` / `..` / 空段的路径直接拒绝（不接受穿越）
 */
function normalizeDirectoryKey(raw: string): string | null {
  const path = `configuration.aggregation.branches.folders[${JSON.stringify(raw)}]`
  if (raw === "/") return "/"
  const clean = raw.replaceAll("\\", "/").replace(/^\/+|\/+$/g, "")
  const parts = clean.split("/")
  if (parts.some((part) => !part || part === "." || part === "..")) {
    warn(`${path} 必须是相对内容根的目录路径`)
    return null
  }
  const normalized = slugifyPath(clean)
  if (normalized.split("/").some((part) => !part)) {
    warn(`${path} 规范化后为空`)
    return null
  }
  return normalized
}

/** 规范化配置；非法时告警并返回 null */
export function normalizeAggregation(value: unknown): NormalizedAggregation | null {
  if (value === undefined || value === null) return null
  if (typeof value !== "object" || Array.isArray(value)) {
    warn("configuration.aggregation 不是对象，已忽略")
    return null
  }
  const input = value as Record<string, unknown>
  const rootInput = input.root
  if (
    rootInput === null ||
    typeof rootInput !== "object" ||
    Array.isArray(rootInput) ||
    (rootInput as Record<string, unknown>).type !== "folder"
  ) {
    warn("configuration.aggregation.root 必须是 { type: folder, depth? }，已忽略")
    return null
  }
  const rootDepth = (rootInput as Record<string, unknown>).depth
  const depth = rootDepth === undefined ? 1 : rootDepth
  if (typeof depth !== "number" || !Number.isInteger(depth) || depth < 1) {
    warn("configuration.aggregation.root.depth 必须是 >=1 的整数，已忽略")
    return null
  }

  const branchesInput =
    input.branches === undefined || input.branches === null
      ? {}
      : (input.branches as Record<string, unknown>)
  const defaultChain =
    branchesInput.default === undefined
      ? []
      : parseChain(branchesInput.default, "configuration.aggregation.branches.default")
  if (!defaultChain) return null

  const foldersInput =
    branchesInput.folders === undefined || branchesInput.folders === null
      ? {}
      : branchesInput.folders
  if (typeof foldersInput !== "object" || Array.isArray(foldersInput)) {
    warn("configuration.aggregation.branches.folders 必须是对象，已忽略")
    return null
  }

  const folders: Record<string, DimensionRule[]> = {}
  for (const [rawKey, rawChain] of Object.entries(foldersInput as Record<string, unknown>)) {
    const key = normalizeDirectoryKey(rawKey)
    if (!key) return null
    if (Object.hasOwn(folders, key)) {
      warn(`configuration.aggregation.branches.folders 规范化后出现重复键：${key}，已忽略`)
      return null
    }
    const chain = parseChain(rawChain, `configuration.aggregation.branches.folders[${JSON.stringify(rawKey)}]`)
    if (!chain) return null
    folders[key] = chain
  }

  return { root: { depth }, branches: { default: defaultChain, folders } }
}

/** 逐层向上回退取规则链；显式 [] 命中即返回 []（停止继承） */
export function resolveChain(config: NormalizedAggregation, context: string): DimensionRule[] {
  let current = context
  while (current) {
    if (Object.hasOwn(config.branches.folders, current)) return config.branches.folders[current]!
    const slash = current.lastIndexOf("/")
    current = slash > 0 ? current.slice(0, slash) : ""
  }
  return config.branches.default
}

/** 源内容里出现过的目录上下文（排序去重） */
export function collectContexts(items: AggregationItem[], depth: number): string[] {
  const contexts = new Set<string>()
  for (const item of items) contexts.add(folderContextOf(item.slug, depth))
  return [...contexts].sort()
}

/** 规则链上的字段名（按顺序去重） */
export function fieldChain(chain: DimensionRule[]): string[] {
  const fields: string[] = []
  for (const rule of chain) {
    if (rule.type === "field" && !fields.includes(rule.field)) fields.push(rule.field)
  }
  return fields
}
