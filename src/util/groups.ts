/**
 * 维度页清单的纯函数实现：从「源内容 + 聚合配置」算出要生成哪些页面、以及每个取值命中哪些实体。
 *
 * 口径（与用户确认的方案 B 一致）：
 * - 页面集合 = 规则链上出现过的字段 × 该字段的取值（缺值统一归入「未分类」取值，不套 minGroupSize）
 * - 目录只影响「哪些字段成为维度」与「取值域的统计范围」，不产生按目录的页面；
 *   目录范围靠运行期 `?scope=` 裁剪
 * - 保留一个纯防御性的取值数上限（默认 500）防止病态字段炸页面
 *
 * pageType（Phase 1）与 emitter（Phase 2）共用本模块，保证「页面集合 == 产物集合」。
 */
import type { ProcessedContent } from "@quartz-community/types"
import {
  collectContexts,
  fieldChain,
  folderContextOf,
  resolveChain,
  type AggregationItem,
  type NormalizedAggregation,
} from "./rules"
import { assignSlugs, dimensionIndexSlug } from "./slug"

/** 某个取值在某个目录上下文里的实体数（值页的 scope 切换条用） */
export interface DimensionScopeCount {
  scope: string
  count: number
}

export interface DimensionValuePlan {
  value: string
  valueSlug: string
  count: number
  /** 该取值出现过的目录上下文（排序） */
  scopes: string[]
  /** 同上，但带实体数（按数量降序、同数按目录名升序） */
  scopeCounts: DimensionScopeCount[]
}

export interface DimensionFieldPlan {
  field: string
  fieldSlug: string
  indexSlug: string
  /** 该字段生效的目录上下文（其规则链包含该字段） */
  scopes: string[]
  /** 按计数降序、同数按值升序 */
  values: DimensionValuePlan[]
}

export interface SkippedField {
  field: string
  distinctValues: number
  reason: "maxValues"
}

export interface DimensionPlan {
  fields: DimensionFieldPlan[]
  skipped: SkippedField[]
}

export interface PlanOptions {
  /** 单字段取值数上限（防御性，默认 500） */
  maxValuesPerField?: number
}

export const DEFAULT_MAX_VALUES_PER_FIELD = 500

/**
 * frontmatter 字段缺值（缺失 / 空串 / 空数组）时的取值名。
 *
 * ⚠️ 跨插件字符串契约：必须与 graph-pro 的 `UNCLASSIFIED_KEY`、explorer-pro 的同名常量
 * **逐字符一致** —— 图谱「未分类」聚合节点双击后要能在本插件产出的 manifest 里查到该取值，
 * 才能拼出正确的维度值页 URL。插件之间不能共享包，故各自定义常量并以单测断言字面量。
 */
export const UNCLASSIFIED_VALUE = "未分类"

/** 命中的源实体：slug + 它所属的目录上下文 */
export interface DimensionMatch {
  slug: string
  scope: string
}

/** 字段 → 取值 → 命中实体（emitter 用） */
export type DimensionValueIndex = Map<string, Map<string, DimensionMatch[]>>

/** 生成页/系统页前缀，属于「非源内容」，不参与维度统计 */
const GENERATED_PREFIXES = ["_dimensions/", "tags/"]

/** 从 `content` 里取出源内容项（排除维度页自身与虚拟页） */
export function sourceItems(content: ProcessedContent[]): AggregationItem[] {
  const items: AggregationItem[] = []
  for (const [, file] of content) {
    const data = file.data as { slug?: string; frontmatter?: Record<string, unknown> } | undefined
    const slug = data?.slug
    if (!slug) continue
    if (GENERATED_PREFIXES.some((prefix) => slug.startsWith(prefix))) continue
    const frontmatter = data?.frontmatter
    if (frontmatter?.virtualNode === true) continue
    items.push({ slug, frontmatter })
  }
  return items
}

/** 码点比较：不依赖 locale，保证「同一份输入 → 同一套顺序」（diff 与缓存友好） */
function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** 把 `[[target]]` / `[[target|display]]` 剥离为纯文本（display 优先，否则 target） */
function stripWikilink(value: string): string {
  const match = value.match(/^\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]$/)
  if (!match) return value
  const target = match[1] ?? ""
  const display = match[2] ?? ""
  return display.trim() || target.trim()
}

/** 与 graph-pro 的 sharedAggregation.keyFor 同款：数组取第一个「有值」的元素；wikilink 值剥离为纯文本 */
export function firstValue(raw: unknown): string | null {
  const present = (v: unknown) => v !== undefined && v !== null && v !== ""
  const value = Array.isArray(raw) ? raw.find(present) : present(raw) ? raw : undefined
  return value === undefined ? null : stripWikilink(String(value))
}

interface ContextIndex {
  contextOf: (slug: string) => string
  /** 目录上下文 → 该上下文生效的字段（规则链顺序） */
  fieldsByContext: Map<string, string[]>
  /** 字段 → 生效的目录上下文（排序） */
  fieldScopes: Map<string, string[]>
}

/** 上下文与字段链的公共推导：planDimensions 与 buildValueIndex 共用，避免两处口径漂移 */
function buildContextIndex(items: AggregationItem[], config: NormalizedAggregation): ContextIndex {
  const contexts = collectContexts(items, config.root.depth)
  const fieldsByContext = new Map<string, string[]>()
  const fieldScopes = new Map<string, string[]>()
  for (const context of contexts) {
    const chain = fieldChain(resolveChain(config, context))
    fieldsByContext.set(context, chain)
    for (const field of chain) {
      const scopes = fieldScopes.get(field) ?? []
      if (!scopes.includes(context)) scopes.push(context)
      fieldScopes.set(field, scopes)
    }
  }
  return {
    contextOf: (slug: string) => folderContextOf(slug, config.root.depth),
    fieldsByContext,
    fieldScopes,
  }
}

/**
 * 遍历源实体，按「该字段在实体所属目录的规则链里是否生效」决定它是否参与该字段的统计。
 * 这样维度页的计数与目录图谱的聚合口径一致（值域仍不按目录出页）。
 */
function forEachFieldValue(
  items: AggregationItem[],
  index: ContextIndex,
  visit: (field: string, value: string, item: AggregationItem, scope: string) => void,
) {
  for (const item of items) {
    const scope = index.contextOf(item.slug)
    for (const field of index.fieldsByContext.get(scope) ?? []) {
      // 缺值不是「跳过」而是归入「未分类」取值 —— 这样它才有维度值页、manifest 条目与子图 matched
      const value = firstValue(item.frontmatter?.[field]) ?? UNCLASSIFIED_VALUE
      visit(field, value, item, scope)
    }
  }
}

export function planDimensions(
  items: AggregationItem[],
  config: NormalizedAggregation | null,
  opts: PlanOptions = {},
): DimensionPlan {
  if (!config) return { fields: [], skipped: [] }
  const maxValues = opts.maxValuesPerField ?? DEFAULT_MAX_VALUES_PER_FIELD
  const index = buildContextIndex(items, config)

  const countsByField = new Map<string, Map<string, number>>()
  const scopeCountsByField = new Map<string, Map<string, Map<string, number>>>()
  for (const field of index.fieldScopes.keys()) {
    countsByField.set(field, new Map())
    scopeCountsByField.set(field, new Map())
  }

  forEachFieldValue(items, index, (field, value, _item, scope) => {
    const counts = countsByField.get(field)!
    counts.set(value, (counts.get(value) ?? 0) + 1)
    const byValue = scopeCountsByField.get(field)!
    const byScope = byValue.get(value) ?? new Map<string, number>()
    byScope.set(scope, (byScope.get(scope) ?? 0) + 1)
    byValue.set(value, byScope)
  })

  // 字段 slug 也走冲突消解（如 frontmatter 里同时存在 "Type" 与 "type"）
  const fieldSlugs = assignSlugs([...index.fieldScopes.keys()], "field")

  const fields: DimensionFieldPlan[] = []
  const skipped: SkippedField[] = []

  for (const [field, scopes] of index.fieldScopes) {
    const counts = countsByField.get(field) ?? new Map<string, number>()
    const scopeCounts = scopeCountsByField.get(field) ?? new Map<string, Map<string, number>>()
    if (counts.size === 0) continue
    if (counts.size > maxValues) {
      skipped.push({ field, distinctValues: counts.size, reason: "maxValues" })
      continue
    }

    const fieldSlug = fieldSlugs.get(field)!
    // 取值 slug 先按原始值排序分配（稳定），再按 计数降序 + 值升序 排列展示
    const valueSlugs = assignSlugs([...counts.keys()], "value", ["index"])
    const values: DimensionValuePlan[] = [...counts.entries()]
      .map(([value, count]) => {
        const byScope = scopeCounts.get(value) ?? new Map<string, number>()
        const scopeList: DimensionScopeCount[] = [...byScope.entries()]
          .map(([scope, scopeCount]) => ({ scope, count: scopeCount }))
          .sort((a, b) => b.count - a.count || compareStrings(a.scope, b.scope))
        return {
          value,
          valueSlug: valueSlugs.get(value)!,
          count,
          scopes: scopeList.map((entry) => entry.scope),
          scopeCounts: scopeList,
        }
      })
      .sort((a, b) => b.count - a.count || compareStrings(a.value, b.value))

    fields.push({
      field,
      fieldSlug,
      indexSlug: dimensionIndexSlug(fieldSlug),
      scopes,
      values,
    })
  }

  // 字段顺序：按字段 slug 排序，保证同一份输入产出同样的页面顺序
  fields.sort((a, b) => compareStrings(a.fieldSlug, b.fieldSlug))
  return { fields, skipped }
}

/**
 * 构建「字段 → 取值 → 命中实体」索引（emitter 用）。
 * 与 planDimensions 共用 buildContextIndex / forEachFieldValue，保证计数与命中集合一致。
 */
export function buildValueIndex(
  items: AggregationItem[],
  config: NormalizedAggregation | null,
): DimensionValueIndex {
  const index: DimensionValueIndex = new Map()
  if (!config) return index
  const contextIndex = buildContextIndex(items, config)
  forEachFieldValue(items, contextIndex, (field, value, item, scope) => {
    const byValue = index.get(field) ?? new Map<string, DimensionMatch[]>()
    const matches = byValue.get(value) ?? []
    matches.push({ slug: item.slug, scope })
    byValue.set(value, matches)
    index.set(field, byValue)
  })
  return index
}
