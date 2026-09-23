// @ts-nocheck
/**
 * 「本目录聚合配置」面板的运行时脚本。
 *
 * 跨插件契约（`explorer-pro` 的目录树按同一份数据分区）：
 * - localStorage 键 `quartz:dimensionOrder:<basePath>:<目录>`，值 = 字段名数组（优先级从高到低）
 * - 改完派发 `document` 上的 `aggregation-order-changed` 事件
 * - 级数上限从 `explorer3` 容器的 `data-dimensionmaxlevels` 读（单一来源）
 *
 * 面板只列**该目录规则链上的字段**（维度页是构建期产物，链外字段不可选）；
 * 前 N 项为「应用中」，其余置灰但仍可拖动上来——拖动即优先级，位置即开关。
 */

const ORDER_PREFIX = "quartz:dimensionOrder:"
const ORDER_EVENT = "aggregation-order-changed"
const MAX_LEVELS_FALLBACK = 2
const DEFAULT_MAX_FIELDS = 20

let aggregationPromise: Promise<{ root?: { depth?: number }; resolved?: Record<string, unknown> } | null> | null = null

/**
 * 站点 basePath（与 explorer-pro 的约定一致：**不带前导/尾随斜杠**）。
 * ⚠️ `body[data-basepath]` 是带前导斜杠的（`/demo-region-sqlite`），必须裁掉，
 * 否则会拼出 `//<域>/static/...` 这种 404 路径（也会让 localStorage 键与目录树对不上）。
 */
function basePath(): string {
  const raw = (document.body && document.body.dataset && document.body.dataset.basepath) || ""
  return raw.replace(/^\/+/, "").replace(/\/+$/, "")
}

function staticUrl(relative: string): string {
  return basePath() ? `/${basePath()}/${relative}` : `/${relative}`
}

/** 站点级聚合规则产物（含 `resolved[上下文]` 规则链）；没有则返回 null（按钮在构建期已被隐藏） */
function loadAggregation() {
  if (!aggregationPromise) {
    aggregationPromise = (async () => {
      try {
        const response = await fetch(staticUrl("static/aggregation.json"))
        if (!response.ok) return null
        return await response.json()
      } catch {
        return null
      }
    })()
  }
  return aggregationPromise
}

/** 目录 → 聚合上下文（按 root.depth 截断，根目录 "/"） */
function contextOfFolder(folder: string, depth: number): string {
  const parts = folder.split("/").filter((part) => part.length > 0).slice(0, Math.max(1, depth))
  return parts.join("/") || "/"
}

/** 规则链上的字段名（顺序去重） */
function fieldChainOf(chain: unknown): string[] {
  if (!Array.isArray(chain)) return []
  const fields: string[] = []
  for (const rule of chain) {
    if (rule && rule.type === "field" && typeof rule.field === "string" && rule.field.length > 0) {
      if (!fields.includes(rule.field)) fields.push(rule.field)
    }
  }
  return fields
}

function orderKey(folder: string): string {
  return `${ORDER_PREFIX}${basePath()}:${folder}`
}

/** 与 explorer-pro 同款解析容错：非法一律当未配置 */
function readStoredOrder(folder: string): string[] {
  try {
    const raw = localStorage.getItem(orderKey(folder))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const order: string[] = []
    for (const item of parsed) {
      if (typeof item !== "string") continue
      const field = item.trim()
      if (field.length === 0 || order.includes(field)) continue
      order.push(field)
    }
    return order
  } catch {
    return []
  }
}

function writeStoredOrder(folder: string, order: string[]): void {
  try {
    localStorage.setItem(orderKey(folder), JSON.stringify(order))
  } catch (error) {
    console.warn("[AggregationConfig] 保存失败", error)
  }
}

function clearStoredOrder(folder: string): void {
  try {
    localStorage.removeItem(orderKey(folder))
  } catch {
    // ignore
  }
}

/** 上限：优先取目录树容器上的声明（单一来源），否则回落默认值 */
function readMaxLevels(): number {
  const explorer = document.querySelector(".explorer3")
  const raw = explorer && explorer.dataset && explorer.dataset.dimensionmaxlevels
  const parsed = parseInt(raw || "", 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : MAX_LEVELS_FALLBACK
}

function dispatchOrderChanged(): void {
  document.dispatchEvent(new CustomEvent(ORDER_EVENT, { bubbles: true }))
}

function initSection(section: HTMLElement, cleanups: Array<() => void>): void {
  // 幂等守卫：脚本会在「立即执行」与 nav/render 事件里各初始化一次，
  // 重复绑定会让一次点击被两个 handler 各切换一次（看起来像"点不开"）。
  // 用 DOM 属性做守卫，SPA 导航后是新节点、attr 自然不存在 → 仍会重新初始化。
  if (section.dataset.aggregationConfigBound === "true") return

  const toggle = section.querySelector(".aggregation-config-toggle")
  const panel = section.querySelector("[data-aggregation-config-panel]")
  const list = section.querySelector("[data-aggregation-config-list]")
  const hint = section.querySelector("[data-aggregation-config-hint]")
  const reset = section.querySelector("[data-aggregation-config-reset]")
  if (!toggle || !panel || !list || !hint || !reset) return

  const folder = section.dataset.folder || ""
  if (folder === "") return

  const maxFields = parseInt(list.dataset.maxFields || String(DEFAULT_MAX_FIELDS), 10)
  const appliedLabel = list.dataset.appliedLabel || ""
  const dimmedLabel = list.dataset.dimmedLabel || ""
  const hintTemplate = hint.dataset.hintTemplate || hint.textContent || ""

  let chain: string[] = []
  let maxLevels = readMaxLevels()
  let order: string[] = []
  let dragField: string | null = null

  /** 展示顺序 = 生效顺序（用户配置，未配置则规则链）在前，未启用项按规则链顺序补齐在后 */
  const buildOrder = () => {
    const stored = readStoredOrder(folder)
    const effective = stored.length > 0 ? stored.filter((field) => chain.includes(field)) : chain
    const rest = chain.filter((field) => !effective.includes(field))
    order = [...effective, ...rest]
  }

  const render = () => {
    list.textContent = ""
    const applied = order.slice(0, maxLevels)
    hint.textContent = hintTemplate.replace(/\{count\}/g, String(maxLevels))

    for (const field of order.slice(0, maxFields)) {
      const isApplied = applied.includes(field)
      const li = document.createElement("li")
      li.className = `aggregation-config-item ${isApplied ? "is-applied" : "is-dimmed"}`
      li.dataset.field = field
      li.draggable = true

      const handle = document.createElement("span")
      handle.className = "aggregation-config-handle"
      handle.setAttribute("aria-hidden", "true")
      handle.textContent = "⋮⋮"

      const name = document.createElement("span")
      name.className = "aggregation-config-name"
      name.textContent = field

      const state = document.createElement("span")
      state.className = "aggregation-config-state"
      state.textContent = isApplied ? appliedLabel : dimmedLabel

      li.append(handle, name, state)
      list.appendChild(li)
    }
  }

  const persist = () => {
    const stored = readStoredOrder(folder)
    // 与默认顺序一致时清掉键，避免留下"看起来配了其实没变"的脏数据
    if (stored.length === 0 && order.join("|") === chain.join("|")) {
      clearStoredOrder(folder)
    } else {
      writeStoredOrder(folder, order)
    }
    dispatchOrderChanged()
  }

  const onDragStart = (event: DragEvent) => {
    const target = (event.target as HTMLElement | null)?.closest(".aggregation-config-item") as HTMLElement | null
    if (!target) return
    dragField = target.dataset.field || null
    target.classList.add("is-dragging")
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move"
      event.dataTransfer.setData("text/plain", dragField || "")
    }
  }

  const onDragEnd = (event: DragEvent) => {
    const target = (event.target as HTMLElement | null)?.closest(".aggregation-config-item") as HTMLElement | null
    target?.classList.remove("is-dragging")
    dragField = null
  }

  const onDragOver = (event: DragEvent) => {
    if (dragField) event.preventDefault()
  }

  const onDrop = (event: DragEvent) => {
    const target = (event.target as HTMLElement | null)?.closest(".aggregation-config-item") as HTMLElement | null
    if (!target || !dragField) return
    event.preventDefault()
    const moved = dragField
    dragField = null
    const to = target.dataset.field
    if (!to || moved === to) return

    const next = order.filter((field) => field !== moved)
    const insertAt = next.indexOf(to)
    next.splice(insertAt === -1 ? next.length : insertAt, 0, moved)
    order = next
    persist()
    render()
  }

  const onToggleClick = (event: MouseEvent) => {
    event.preventDefault()
    const open = panel.hidden
    panel.hidden = !open
    toggle.setAttribute("aria-expanded", String(open))
    if (open) {
      render()
      // 点击面板外 / ESC 关闭
      const onOutside = (e: MouseEvent) => {
        if (!section.contains(e.target as Node)) close()
      }
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") close()
      }
      const close = () => {
        panel.hidden = true
        toggle.setAttribute("aria-expanded", "false")
        document.removeEventListener("click", onOutside)
        document.removeEventListener("keydown", onKey)
      }
      document.addEventListener("click", onOutside)
      document.addEventListener("keydown", onKey)
      cleanups.push(() => {
        document.removeEventListener("click", onOutside)
        document.removeEventListener("keydown", onKey)
      })
    }
  }

  const onResetClick = (event: MouseEvent) => {
    event.preventDefault()
    clearStoredOrder(folder)
    buildOrder()
    persist()
    render()
  }

  section.dataset.aggregationConfigBound = "true"
  toggle.addEventListener("click", onToggleClick)
  list.addEventListener("dragstart", onDragStart)
  list.addEventListener("dragend", onDragEnd)
  list.addEventListener("dragover", onDragOver)
  list.addEventListener("drop", onDrop)
  reset.addEventListener("click", onResetClick)
  cleanups.push(() => {
    toggle.removeEventListener("click", onToggleClick)
    list.removeEventListener("dragstart", onDragStart)
    list.removeEventListener("dragend", onDragEnd)
    list.removeEventListener("dragover", onDragOver)
    list.removeEventListener("drop", onDrop)
    reset.removeEventListener("click", onResetClick)
  })

  void (async () => {
    try {
      const aggregation = await loadAggregation()
      if (!aggregation || !aggregation.resolved) return
      const depth = (aggregation.root && aggregation.root.depth) || 1
      chain = fieldChainOf(aggregation.resolved[contextOfFolder(folder, depth)])
      if (chain.length === 0) {
        // 构建期已按同一份配置判定过可见性；这里兜底隐藏（例如产物与配置不同步）
        section.hidden = true
        return
      }
      maxLevels = readMaxLevels()
      buildOrder()
      render()
    } catch (error) {
      console.error("[AggregationConfig] 初始化失败", error)
      section.dataset.initError = String(error)
    }
  })()
}

function initAggregationConfig(): void {
  const sections = document.querySelectorAll("[data-aggregation-config]")
  if (sections.length === 0) return
  const cleanups: Array<() => void> = []
  sections.forEach((section) => initSection(section as HTMLElement, cleanups))
  if (typeof window.addCleanup === "function") {
    window.addCleanup(() => cleanups.forEach((cleanup) => cleanup()))
  }
}

document.addEventListener("nav", () => initAggregationConfig())
document.addEventListener("render", () => initAggregationConfig())
initAggregationConfig()
