import { slugifyPath } from "@quartz-community/utils/path"

/** 维度页占用的系统路径前缀 */
export const DIMENSIONS_PREFIX = "_dimensions"

/**
 * 片段 slug 化：沿用 Quartz 的 slugifyPath（github-slugger），中文保留、空格转 `-`、去除 ?#&。
 * 规范化后为空时回退到 fallback（通常是 `value` / `field`）。
 */
export function slugifySegment(raw: string, fallback: string): string {
  const slug = slugifyPath(String(raw).trim())
  return slug.length > 0 ? slug : fallback
}

/**
 * 为一组原始取值分配互不冲突的 slug。
 *
 * - 按原始值排序后依次分配，保证「同一份数据 + 同一份配置 → 同一套 slug」（可缓存、可 diff）
 * - 规范化后撞车时追加 `-2`/`-3`…（如 `A B` 与 `A-B` 都规范化成 `a-b`）
 * - `reserved` 里的词预占（例如值页不能占用字段索引页的 `index` 段）
 */
export function assignSlugs(
  values: string[],
  fallback: string,
  reserved: string[] = [],
): Map<string, string> {
  const used = new Map<string, number>()
  for (const word of reserved) used.set(word, 1)

  const result = new Map<string, string>()
  for (const value of [...values].sort()) {
    const base = slugifySegment(value, fallback)
    const seen = used.get(base) ?? 0
    used.set(base, seen + 1)
    result.set(value, seen === 0 ? base : `${base}-${seen + 1}`)
  }
  return result
}

/** 维度索引页 slug：`_dimensions/<field>/index`（目录式 URL，与文件夹页同款约定） */
export function dimensionIndexSlug(fieldSlug: string): string {
  return `${DIMENSIONS_PREFIX}/${fieldSlug}/index`
}

/** 维度值页 slug：`_dimensions/<field>/<value>` */
export function dimensionValueSlug(fieldSlug: string, valueSlug: string): string {
  return `${DIMENSIONS_PREFIX}/${fieldSlug}/${valueSlug}`
}

/** 维度值的关系子图产物地址（相对站点根；运行时由 graph-pro 按 basePath 拼接） */
export function dimensionGraphUrl(fieldSlug: string, valueSlug: string): string {
  return `graph/dimensions/${fieldSlug}/${valueSlug}.json`
}
