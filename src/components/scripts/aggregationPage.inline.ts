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

function readParams(): { scope: string; context: string } {
  const params = new URLSearchParams(window.location.search)
  return {
    scope: normalizeScope(params.get("scope") || ""),
    context: normalizeSlug(params.get("context") || ""),
  }
}

/** scope 语义：前缀匹配（`?scope=项目` 含 `项目/` 下的全部实体）；`/` 表示顶级目录 */
function inScope(slug: string, scope: string): boolean {
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

function syncTabs(section: HTMLElement, scope: string): void {
  const buttons = section.querySelectorAll("[data-dimension-scope-tabs] button")
  buttons.forEach((button) => {
    button.classList.toggle("is-active", (button.dataset.scope || "") === scope)
  })
}

function renderList(section: HTMLElement, graph: DimensionGraph, params): void {
  const list = section.querySelector("[data-dimension-entities]")
  if (!list) return
  const countEl = section.querySelector("[data-dimension-count]")
  const currentSlug = (document.body && document.body.dataset && document.body.dataset.slug) || graph.center

  const visible = graph.matched.filter(
    (match) => inScope(match.slug, params.scope) && connectedTo(graph, params.context, match.slug),
  )
  if (countEl) countEl.textContent = formatCount(section.dataset.countTemplate, visible.length)

  list.textContent = ""
  if (visible.length === 0) {
    const empty = document.createElement("li")
    empty.className = "aggregation-entities-placeholder"
    empty.textContent = list.dataset.emptyText || ""
    list.appendChild(empty)
    return
  }

  // 按目录分组；组内按标题排序
  const groups = new Map()
  for (const match of visible) {
    const bucket = groups.get(match.scope) || []
    bucket.push(match)
    groups.set(match.scope, bucket)
  }
  const ordered = [...groups.entries()].sort(
    (a, b) => b[1].length - a[1].length || (a[0] < b[0] ? -1 : 1),
  )
  // 未筛选时按目录分组显示小标题（即使只有一个目录，也让人看出这些实体属于哪个目录）；
  // 已选中某个 scope 时不再重复标注
  const showGroupTitles = params.scope === ""

  for (const [scope, matches] of ordered) {
    const groupEl = document.createElement("li")
    groupEl.className = "aggregation-entities-group"

    if (showGroupTitles) {
      const title = document.createElement("h3")
      title.className = "aggregation-entities-group-title"
      const label = document.createElement("span")
      label.className = "aggregation-entities-group-label"
      label.textContent = scopeLabel(section, scope)
      const badge = document.createElement("span")
      badge.className = "aggregation-entities-group-count"
      badge.textContent = String(matches.length)
      title.appendChild(label)
      title.appendChild(badge)
      groupEl.appendChild(title)
    }

    const ul = document.createElement("ul")
    ul.className = "aggregation-entities-list"
    matches
      .slice()
      .sort((a, b) => {
        const titleA = (graph.nodes[a.slug] && graph.nodes[a.slug].title) || a.slug
        const titleB = (graph.nodes[b.slug] && graph.nodes[b.slug].title) || b.slug
        return titleA.localeCompare(titleB)
      })
      .forEach((match) => {
        const details = graph.nodes[match.slug]
        const targetSlug = (details && details.slug) || match.slug
        const li = document.createElement("li")
        const link = document.createElement("a")
        link.className = "internal"
        link.setAttribute("href", resolveRelative(currentSlug, targetSlug))
        link.textContent = (details && details.title) || targetSlug
        li.appendChild(link)
        ul.appendChild(li)
      })
    groupEl.appendChild(ul)
    list.appendChild(groupEl)
  }
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
    syncTabs(section, params.scope)
    renderList(section, graph, params)
  }

  section.querySelectorAll("[data-dimension-scope-tabs] button").forEach((button) => {
    const handler = () => {
      const scope = button.dataset.scope || ""
      params = { scope, context: params.context }
      const next = new URL(window.location.toString())
      if (scope === "") next.searchParams.delete("scope")
      else next.searchParams.set("scope", scope)
      // 只改地址栏，不触发路由与刷新（纯前端过滤）
      window.history.replaceState(null, "", next.toString())
      rerender()
    }
    button.addEventListener("click", handler)
    cleanups.push(() => button.removeEventListener("click", handler))
  })

  syncTabs(section, params.scope)

  loadGraph(url).then((loaded) => {
    graph = loaded
    if (!graph) {
      list.textContent = ""
      const empty = document.createElement("li")
      empty.className = "aggregation-entities-placeholder"
      empty.textContent = list.dataset.emptyText || ""
      list.appendChild(empty)
      return
    }
    rerender()
  })
}

function initAggregationPages(): void {
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
