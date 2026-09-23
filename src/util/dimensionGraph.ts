/**
 * 维度子图产物的构建（纯函数，便于单测）。
 *
 * 产物结构与 graph-pro 的局部图谱 `LocalGraphData` **同构**，这样后续步骤可以直接复用
 * graph-pro 的图谱渲染脚本（它只读 `nodes` / `edges` / `folderTitles` / `depth`）；
 * 额外多出的 `dimension` 与 `matched` 是本插件的扩展字段，graph-pro 会忽略。
 *
 * 与局部图谱的差异：局部图谱是「整页邻域」，这里是「某字段取值的实体集合 + 它们的一跳邻居」。
 */
import type { ProcessedContent } from "@quartz-community/types"
// 只从 /path 子入口取路径工具：根入口会连带引入 hast/vfile 相关依赖（插件不需要）
import { simplifySlug } from "@quartz-community/utils/path"
import type { DimensionMatch } from "./groups"

/** 节点详情：字段名与 graph-pro 的 ContentDetails 对齐（key 为 SimpleSlug） */
export interface DimensionNodeDetails {
  slug: string
  filePath: string
  title: string
  links: string[]
  tags: string[]
  content: string
  frontmatter: Record<string, unknown>
}

export interface DimensionGraphEdge {
  source: string
  target: string
  sourceField?: string
}

export interface DimensionGraphData {
  version: 1
  /** 维度值页的 slug（SimpleSlug），与 graph-pro 的 `center` 语义一致 */
  center: string
  depth: number
  generatedAt: number
  nodes: Record<string, DimensionNodeDetails>
  edges: DimensionGraphEdge[]
  folderTitles: Record<string, string>
  /** 本插件的扩展：来源维度 */
  dimension: {
    field: string
    value: string
    fieldSlug: string
    valueSlug: string
  }
  /** 本插件的扩展：命中实体（列表按 scope 分组渲染用它） */
  matched: DimensionMatch[]
}

export interface DimensionIndexEntry {
  /** SimpleSlug（与 graph-pro 的 linkIndex 口径一致） */
  simple: string
  details: DimensionNodeDetails
}

function getFrontmatterFieldForLink(
  frontmatter: Record<string, unknown> | undefined,
  targetLink: string,
): string | undefined {
  if (!frontmatter) return undefined
  for (const [key, value] of Object.entries(frontmatter)) {
    if (typeof value !== "string" || !value.includes("[[")) continue
    const match = value.match(/\[\[\.?\.?\/?([^\]|#]+)/)
    if (!match) continue
    const normalizedTarget = match[1]!.replace(/^\.\//, "").replace(/^\//, "")
    if (normalizedTarget === targetLink || targetLink.endsWith(normalizedTarget)) return key
  }
  return undefined
}

/** 从 Phase 2 的 content 建索引（排除维度页自身、标签页与虚拟占位页） */
export function buildDimensionIndex(content: ProcessedContent[]): Map<string, DimensionIndexEntry> {
  const index = new Map<string, DimensionIndexEntry>()
  for (const [, file] of content) {
    const data = file.data as unknown as {
      slug?: string
      relativePath?: string
      text?: string
      links?: string[]
      frontmatter?: Record<string, unknown>
    }
    const fullSlug = data.slug
    if (!fullSlug) continue
    if (fullSlug.startsWith("_dimensions/") || fullSlug.startsWith("tags/")) continue
    if (data.frontmatter?.virtualNode === true) continue
    const simple = simplifySlug(fullSlug as never) as string
    index.set(simple, {
      simple,
      details: {
        slug: fullSlug,
        filePath: data.relativePath ?? "",
        title: (data.frontmatter?.title as string) || simple,
        links: data.links ?? [],
        tags: (data.frontmatter?.tags as string[]) ?? [],
        // 维度产物不需要正文，留空可显著减小体积
        content: "",
        frontmatter: data.frontmatter ?? {},
      },
    })
  }
  return index
}

/** 目录 → index.md 的 title（与 graph-pro 同款，供图谱显示目录名） */
export function buildFolderTitles(index: Map<string, DimensionIndexEntry>): Record<string, string> {
  const folderTitles: Record<string, string> = {}
  for (const [simple, entry] of index.entries()) {
    const filePath = entry.details.filePath
    const title = entry.details.frontmatter?.["title"]
    if (
      filePath &&
      (filePath === "index.md" || filePath.endsWith("/index.md")) &&
      typeof title === "string" &&
      title.trim() !== ""
    ) {
      const key = simple === "/" ? "/" : simple.replace(/^\/+|\/+$/g, "")
      folderTitles[key] = title.trim()
    }
  }
  return folderTitles
}

export interface BuildDimensionGraphOptions {
  center: string
  field: string
  value: string
  fieldSlug: string
  valueSlug: string
  matches: DimensionMatch[]
  index: Map<string, DimensionIndexEntry>
  folderTitles: Record<string, string>
  /** 生成时间戳（仅用于与 graph-pro 产物保持字段一致；调用方传使产物可 diff） */
  generatedAt?: number
}

/**
 * 组出「命中实体 + 一跳邻居 + 边」的子图。
 *
 * - 节点：命中实体 ∪ 它们的出链目标 ∪ 指向它们的入链来源（都必须在真实页索引里）
 * - 边：命中实体的出链 + 指向命中实体的入链（去重，保留首个 sourceField）
 * - 邻居只为图谱提供上下文；列表只渲染 `matched`
 */
export function buildDimensionGraph(opts: BuildDimensionGraphOptions): DimensionGraphData {
  const { matches, index, folderTitles } = opts
  const nodes: Record<string, DimensionNodeDetails> = {}
  const edges: DimensionGraphEdge[] = []
  const seenEdges = new Set<string>()
  const matchedSet = new Set(matches.map((match) => match.slug))

  const addNode = (simple: string) => {
    const entry = index.get(simple)
    if (entry) nodes[simple] = entry.details
  }

  const addEdge = (source: string, target: string, sourceField?: string) => {
    const key = `${source}\u0000${target}`
    if (seenEdges.has(key)) return
    seenEdges.add(key)
    edges.push(sourceField === undefined ? { source, target } : { source, target, sourceField })
  }

  for (const match of matches) {
    const entry = index.get(match.slug)
    if (!entry) continue
    addNode(match.slug)
    for (const link of entry.details.links) {
      if (!index.has(link)) continue
      addNode(link)
      addEdge(match.slug, link, getFrontmatterFieldForLink(entry.details.frontmatter, link))
    }
  }

  // 入链：指向命中实体的页面（一跳，不继续展开）
  for (const [simple, entry] of index.entries()) {
    if (matchedSet.has(simple)) continue
    for (const link of entry.details.links) {
      if (!matchedSet.has(link)) continue
      addNode(simple)
      addEdge(simple, link, getFrontmatterFieldForLink(entry.details.frontmatter, link))
    }
  }

  return {
    version: 1,
    center: opts.center,
    depth: 1,
    generatedAt: opts.generatedAt ?? 1,
    nodes,
    edges,
    folderTitles,
    dimension: {
      field: opts.field,
      value: opts.value,
      fieldSlug: opts.fieldSlug,
      valueSlug: opts.valueSlug,
    },
    matched: matches,
  }
}
