// @ts-nocheck
/**
 * 维度值页的运行时脚本：
 * - 从维度子图产物（`graph/dimensions/**`）取 `matched` 渲染「按目录分组的实体列表」
 * - scope 切换条：点击只改地址栏（`?scope=`，history.replaceState 不刷新）+ 前端重渲染
 * - 同时支持 `?context=<slug>`：只保留与来源节点直接相连的实体（与图谱口径一致）
 *
 * 为什么列表不在构建期渲染：列表数据必须与图谱同源（同一份产物），且要能响应运行时参数。
 * 文案（空态/计数模板/目录标签）由构建期通过 data-* 下发，避免脚本里硬编码语言。
 *
 * 注意：脚本随 `AggregationPageBody.afterDOMLoaded` 打进站点级 postscript.js，
 * 对所有页面生效，因此自身按 `[data-dimension-value]` 容器做门控。
 */
import { resolveRelative } from "@quartz-community/utils/path"
import { matchesDimensionFilter } from "../../util/groups"
import { renderUnifiedListing } from "./unifiedListing"

interface DimensionNodeDetails {
  slug: string
  title: string
  tags?: string[]
  frontmatter?: Record<string, unknown>
}

interface DimensionMatch {
  slug: string
  scope: string
}

interface DimensionGraph {
  center: string
  nodes: Record<string, DimensionNodeDetails>
  edges: Array<{ source: string; target: string }>
  matched: DimensionMatch[]
}

const graphCache = new Map<string, Promise<DimensionGraph | null>>()

function basePath(): string {
  return (document.body && document.body.dataset && document.body.dataset.basepath) || ""
}

function encodePath(path: string): string {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")
}

function loadGraph(url: string): Promise<DimensionGraph | null> {
  const key = `${basePath()}/${url}`
  const cached = graphCache.get(key)
  if (cached) return cached
  const promise = (async () => {
    try {
      const response = await fetch(encodePath(key))
      if (!response.ok) {
        console.warn("[AggregationPage] 维度子图请求失败", url, response.status)
        return null
      }
      return await response.json()
    } catch (error) {
      console.warn("[AggregationPage] 维度子图加载异常", url, error)
      return null
    }
  })()
  graphCache.set(key, promise)
  return promise
}

function normalizeScope(raw: string): string {
  const trimmed = (raw || "").trim()
  if (trimmed === "" || trimmed === "/") return trimmed === "/" ? "/" : ""
  return trimmed.replace(/^\/+|\/+$/g, "")
}

function normalizeSlug(raw: string): string {
  return (raw || "").replace(/\/index$/, "").replace(/\/+$/, "")
}

/** 文件夹索引页（目录自身）判定：`项目/`、`项目/index`、根 `index` 等 —— 不是目录内的实体 */
function isFolderIndexSlug(slug: string): boolean {
  const s = slug || ""
  if (s === "" || s === "/" || s === "index") return true
  if (s.endsWith("/")) return true
  return s.endsWith("/index")
}

function readParams(): { scope: string; context: string; filter: DimensionFilterEntry[] } {
  const params = new URLSearchParams(window.location.search)
  return {
    scope: normalizeScope(params.get("scope") || ""),
    context: normalizeSlug(params.get("context") || ""),
    filter: parseFilter(params.get("filter") || ""),
  }
}

/** scope 语义：前缀匹配（`?scope=项目` 含 `项目/` 下的全部实体）；`/` 表示顶级目录。
 *  文件夹索引页代表目录自身，不算目录内的实体（与 graph-pro 的 inScope 口径一致） */
function inScope(slug: string, scope: string): boolean {
  if (isFolderIndexSlug(slug)) return false
  if (scope === "") return true
  if (scope === "/") return slug.indexOf("/") === -1
  return slug.indexOf(scope + "/") === 0
}

/** context 语义：只保留来源节点本身或与它直接相连（一跳）的实体 */
function connectedTo(graph: DimensionGraph, context: string, slug: string): boolean {
  if (context === "") return true
  const target = normalizeSlug(slug)
  if (target === context) return true
  return graph.edges.some((edge) => {
    const source = normalizeSlug(edge.source)
    const to = normalizeSlug(edge.target)
    return (source === context && to === target) || (to === context && source === target)
  })
}

interface DimensionFilterEntry {
  field: string
  value: string
}

/** 解析 `filter` 参数：`字段:值` 逗号分隔（与 graph-pro 的 dimensionGraphFilter 口径一致） */
function parseFilter(raw: string): DimensionFilterEntry[] {
  const s = (raw || "").trim()
  if (s === "") return []
  const entries: DimensionFilterEntry[] = []
  for (const part of s.split(",")) {
    const idx = part.indexOf(":")
    if (idx <= 0) continue
    const field = part.slice(0, idx).trim()
    const value = part.slice(idx + 1).trim()
    if (field.length === 0 || value.length === 0) continue
    entries.push({ field, value })
  }
  return entries
}

/** 命中实体是否满足所有 filter（祖先维度约束） */
function matchesFilter(graph: DimensionGraph, slug: string, entries: DimensionFilterEntry[]): boolean {
  return matchesDimensionFilter(graph.nodes[slug]?.frontmatter, entries)
}

function formatCount(template: string, count: number): string {
  return (template || "{count}").replace(/\{count\}/g, String(count))
}

function scopeLabel(section: HTMLElement, scope: string): string {
  const buttons = section.querySelectorAll("[data-dimension-scope-tabs] button")
  for (const button of buttons) {
    if ((button.dataset.scope || "") === scope) return button.dataset.scopeLabel || scope
  }
  return scope === "/" ? "/" : scope
}

function syncTabs(section: HTMLElement, scope: string, graph?: DimensionGraph): void {
  const buttons = section.querySelectorAll("[data-dimension-scope-tabs] button")
  buttons.forEach((button) => {
    button.classList.toggle("is-active", (button.dataset.scope || "") === scope)
    const badge = button.querySelector(".aggregation-scope-count")
    if (graph && badge) {
      const buttonScope = button.dataset.scope || ""
      const count = graph.matched.filter((match) => inScope(match.slug, buttonScope)).length
      badge.textContent = String(count)
      button.hidden = count === 0
    }
  })
}

async function renderList(section: HTMLElement, graph: DimensionGraph, params): Promise<void> {
  const list = section.querySelector("[data-dimension-entities]")
  if (!list) return
  const countEl = section.querySelector("[data-dimension-count]")
  const currentSlug = (document.body && document.body.dataset && document.body.dataset.slug) || graph.center

  const visible = graph.matched.filter(
    (match) =>
      inScope(match.slug, params.scope) &&
      connectedTo(graph, params.context, match.slug) &&
      matchesFilter(graph, match.slug, params.filter),
  )
  if (countEl) countEl.textContent = formatCount(section.dataset.countTemplate, visible.length)

  if (visible.length === 0) {
    list.textContent = ""
    const empty = document.createElement("p")
    empty.className = "aggregation-entities-placeholder"
    empty.textContent = list.dataset.emptyText || ""
    list.appendChild(empty)
    return
  }

  // 先按实际目录拆分，再由每个目录自己的动态分类配置继续分组。
  const groups = new Map()
  for (const match of visible) {
    const folder = match.slug.includes("/") ? match.slug.slice(0, match.slug.lastIndexOf("/")) : "/"
    const bucket = groups.get(folder) || []
    const node = graph.nodes[match.slug]
    bucket.push({ slug: match.slug, title: node?.title || match.slug, frontmatter: node?.frontmatter })
    groups.set(folder, bucket)
  }
  const ordered = [...groups.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
  const sort = JSON.parse(section.dataset.listingSort || "{}")
  const baseFilters = [...params.filter, { field: section.dataset.field || "", value: section.dataset.value || "" }].filter((entry) => entry.field)
  await renderUnifiedListing(list, ordered.map(([folder, items]) => ({ folder, items, label: scopeLabel(section, folder) })), currentSlug, sort, params.scope === "" || ordered.length > 1, baseFilters)
}

/**
 * 更新「当前筛选说明」：`{scope} 中 {field} 为「{value}」的实体（与 {source} 相关）`。
 * - scope 为空（全部）用 `descNoScope` 模板，否则用 `descWithScope`
 * - 带 `?context=` 时追加「（与 <来源标题> 相关）」，并显示「清除上下文」按钮
 */
function renderContextDesc(section: HTMLElement, graph: DimensionGraph, params): void {
  const desc = section.querySelector("[data-dimension-context-desc]") as HTMLElement | null
  const clearBtn = section.querySelector("[data-dimension-clear-context]") as HTMLElement | null
  const field = section.dataset.field || ""
  const value = section.dataset.value || ""

  if (desc) {
    const scope = params.scope
    const withScope = desc.dataset.descWithScope || ""
    const noScope = desc.dataset.descNoScope || ""
    const relatedTpl = desc.dataset.relatedTemplate || ""
    const scopeName =
      scope === "" ? "" : scope === "/" ? desc.dataset.scopeRoot || "/" : scopeLabel(section, scope)
    let text = (scope === "" ? noScope : withScope)
      .replace(/\{scope\}/g, scopeName)
      .replace(/\{field\}/g, field)
      .replace(/\{value\}/g, value)
    if (params.context !== "") {
      const details = graph.nodes[params.context]
      const source = (details && details.title) || params.context
      text += relatedTpl.replace(/\{source\}/g, source)
    }
    desc.textContent = text
    desc.hidden = false
  }

  if (clearBtn) clearBtn.hidden = params.context === ""
}

function initValueSection(section: HTMLElement, cleanups: Array<() => void>): void {
  const list = section.querySelector("[data-dimension-entities]")
  if (!list) return
  const url = list.dataset.dimensionEntitiesUrl || ""
  if (!url) return

  let params = readParams()
  let graph: DimensionGraph | null = null

  const rerender = () => {
    if (!graph) return
    syncTabs(section, params.scope, graph)
    renderContextDesc(section, graph, params)
    void renderList(section, graph, params).catch((error) => console.warn("[AggregationPage] 列表渲染失败", error))
  }

  section.querySelectorAll("[data-dimension-scope-tabs] button").forEach((button) => {
    const handler = () => {
      const scope = button.dataset.scope || ""
      params = { scope, context: params.context, filter: [] }
      const next = new URL(window.location.toString())
      if (scope === "") next.searchParams.delete("scope")
      else next.searchParams.set("scope", scope)
      // 切 scope 后祖先约束（filter）语义不成立，清除之（换目录后原祖先维度不再适用）
      next.searchParams.delete("filter")
      // 只改地址栏，不触发路由与刷新（纯前端过滤）
      window.history.replaceState(null, "", next.toString())
      // 通知图谱按新参数重绘（graph-pro 监听该事件：两个插件之间的事件契约）
      document.dispatchEvent(new CustomEvent("aggregation-scope-changed"))
      rerender()
    }
    button.addEventListener("click", handler)
    cleanups.push(() => button.removeEventListener("click", handler))
  })

  // 「清除上下文」按钮：点击移除 context 回到 scope 内全量（显示状态由 renderContextDesc 统一控制）
  const clearContextBtn = section.querySelector("[data-dimension-clear-context]")
  if (clearContextBtn) {
    const clearHandler = () => {
      params = { scope: params.scope, context: "", filter: params.filter }
      const next = new URL(window.location.toString())
      next.searchParams.delete("context")
      window.history.replaceState(null, "", next.toString())
      document.dispatchEvent(new CustomEvent("aggregation-scope-changed"))
      rerender()
    }
    clearContextBtn.addEventListener("click", clearHandler)
    cleanups.push(() => clearContextBtn.removeEventListener("click", clearHandler))
  }

  syncTabs(section, params.scope)

  const onOrderChanged = () => rerender()
  document.addEventListener("aggregation-order-changed", onOrderChanged)
  cleanups.push(() => document.removeEventListener("aggregation-order-changed", onOrderChanged))

  loadGraph(url).then((loaded) => {
    graph = loaded
    if (!graph) {
      list.textContent = ""
      const empty = document.createElement("p")
      empty.className = "aggregation-entities-placeholder"
      empty.textContent = list.dataset.emptyText || ""
      list.appendChild(empty)
      return
    }
    rerender()
  })
}

const boundFolderLists = new WeakSet<Element>()

function initFolderListings(): void {
  document.querySelectorAll("[data-unified-folder-list]").forEach((section: HTMLElement) => {
    const target = section.querySelector("[data-unified-folder-content]") as HTMLElement | null
    if (!target || boundFolderLists.has(target)) return
    boundFolderLists.add(target)
    let items = []
    let sort = {}
    try {
      items = JSON.parse(section.dataset.items || "[]")
      sort = JSON.parse(section.dataset.listingSort || "{}")
    } catch (error) {
      console.warn("[AggregationPage] 文件夹列表数据无效", error)
      return
    }
    const folder = section.dataset.folder || ""
    const slug = document.body?.dataset.slug || `${folder}/index`
    const render = () => void renderUnifiedListing(target, [{ folder, items }], slug, sort, false)
      .catch((error) => console.warn("[AggregationPage] 文件夹列表渲染失败，保留原列表", error))
    render()
    document.addEventListener("aggregation-order-changed", render)
    if (typeof window.addCleanup === "function") {
      window.addCleanup(() => document.removeEventListener("aggregation-order-changed", render))
    }
  })
}

function initAggregationPages(): void {
  initFolderListings()
  const sections = document.querySelectorAll("[data-dimension-value]")
  if (sections.length === 0) return
  const cleanups: Array<() => void> = []
  sections.forEach((section) => initValueSection(section, cleanups))
  if (typeof window.addCleanup === "function") {
    window.addCleanup(() => cleanups.forEach((cleanup) => cleanup()))
  }
}

document.addEventListener("nav", () => initAggregationPages())
document.addEventListener("render", () => initAggregationPages())
initAggregationPages()
