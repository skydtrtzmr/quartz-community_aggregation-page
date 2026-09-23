/**
 * 文件夹页「维度分类入口」的纯函数实现：给一个目录路径，算出该目录下可直接跳转的维度值。
 *
 * 与维度页口径一致的地方：同一份规则链（`resolveChain` + `fieldChain`）、同一套取值提取
 * （`firstValue`）、同一套 slug 分配（`assignSlugs`）——保证入口链接一定命中已生成的维度值页。
 *
 * 与维度页不同的地方：**统计范围**
 * - 维度页：全域取值（值域不按目录出页），目录范围靠运行期 `?scope=` 裁剪
 * - 文件夹页入口：只统计**当前目录子树**内的实体，链接带 `?scope=<当前目录>`
 *
 * 规则链所属上下文仍是 `contextOfFolder(folder, root.depth)`（depth=1 时嵌套目录继承顶级目录的规则），
 * 与 aggregation-pro / graph-pro 的上下文口径保持完全一致。
 */
import {
  contextOfFolder,
  fieldChain,
  resolveChain,
  type AggregationItem,
  type NormalizedAggregation,
} from "./rules"
import { firstValue } from "./groups"
import { assignSlugs, dimensionIndexSlug } from "./slug"

export interface FolderNavValue {
  value: string
  valueSlug: string
  /** 该取值在**当前目录子树**内的实体数 */
  count: number
}

export interface FolderNavField {
  field: string
  fieldSlug: string
  /** 该字段的维度索引页 slug（`_dimensions/<field>/index`） */
  indexSlug: string
  /** 该字段在当前目录子树内的实体数 */
  count: number
  /** 按计数降序、同数按值升序 */
  values: FolderNavValue[]
  /** 因超过展示上限而省略的取值数 */
  hiddenValues: number
}

export interface FolderNavPlan {
  folder: string
  /** 规则链所属上下文（可能是父目录） */
  context: string
  fields: FolderNavField[]
}

export interface FolderNavOptions {
  /** 单字段最多展示的取值数（防目录页被长尾值撑爆），默认 12 */
  maxValuesPerField?: number
}

export const DEFAULT_NAV_MAX_VALUES = 12

/** 码点比较：与 groups.ts 同款，保证「同一份输入 → 同一套顺序」 */
function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** 只取当前目录子树内的源实体（目录页自身是生成页，无 frontmatter，参与也无害） */
export function itemsInFolder(items: AggregationItem[], folder: string): AggregationItem[] {
  const prefix = folder.length > 0 ? `${folder}/` : ""
  return items.filter((item) => (prefix === "" ? true : item.slug.startsWith(prefix)))
}

/**
 * 目录 → 维度入口清单。
 * 目录不在任何规则链上（链为空）、或目录内没有可用取值时返回空 `fields`（调用方据此不渲染）。
 */
export function planFolderNav(
  items: AggregationItem[],
  config: NormalizedAggregation | null,
  folder: string,
  opts: FolderNavOptions = {},
): FolderNavPlan {
  const maxValues = opts.maxValuesPerField ?? DEFAULT_NAV_MAX_VALUES
  const empty: FolderNavPlan = { folder, context: "/", fields: [] }
  if (!config || folder.length === 0) return empty

  const context = contextOfFolder(folder, config.root.depth)
  const chain = fieldChain(resolveChain(config, context))
  if (chain.length === 0) return { ...empty, context }

  const scoped = itemsInFolder(items, folder)
  if (scoped.length === 0) return { ...empty, context }

  const counts = new Map<string, Map<string, number>>()
  for (const item of scoped) {
    for (const field of chain) {
      const value = firstValue(item.frontmatter?.[field])
      if (value === null) continue
      const byValue = counts.get(field) ?? new Map<string, number>()
      byValue.set(value, (byValue.get(value) ?? 0) + 1)
      counts.set(field, byValue)
    }
  }

  const fieldSlugs = assignSlugs([...counts.keys()], "field")
  const fields: FolderNavField[] = []
  // 顺序沿用规则链顺序（规则链即优先轴），与图谱里聚合节点的出现顺序一致
  for (const field of chain) {
    const byValue = counts.get(field)
    if (!byValue || byValue.size === 0) continue
    const fieldSlug = fieldSlugs.get(field)!
    const valueSlugs = assignSlugs([...byValue.keys()], "value", ["index"])
    const all: FolderNavValue[] = [...byValue.entries()]
      .map(([value, count]) => ({ value, valueSlug: valueSlugs.get(value)!, count }))
      .sort((a, b) => b.count - a.count || compareStrings(a.value, b.value))
    fields.push({
      field,
      fieldSlug,
      indexSlug: dimensionIndexSlug(fieldSlug),
      count: [...byValue.values()].reduce((sum, n) => sum + n, 0),
      values: all.slice(0, maxValues),
      hiddenValues: Math.max(0, all.length - maxValues),
    })
  }

  return { folder, context, fields }
}
