// @ts-nocheck
import { resolveRelative } from "@quartz-community/utils/path"

const BATCH = 20
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" })
const sources = new Map<string, Promise<any>>()

export type ListingItem = {
  slug: string
  title?: string
  frontmatter?: Record<string, unknown>
  dates?: Record<string, unknown>
  folder?: boolean
}

function sitePath(path: string): string {
  const base = document.body?.dataset.basepath?.replace(/^\/+|\/+$/g, "") ?? ""
  return `/${base ? `${base}/` : ""}${path}`
}

async function load(path: string): Promise<any> {
  const url = sitePath(path)
  if (!sources.has(url)) {
    sources.set(url, fetch(url).then((response) => {
      if (!response.ok) throw new Error(`${url}: ${response.status}`)
      return response.json()
    }))
  }
  return sources.get(url)!
}

function folderContext(folder: string, depth: number): string {
  return folder.split("/").filter(Boolean).slice(0, Math.max(1, depth)).join("/") || "/"
}

function fieldChain(rules: unknown): string[] {
  if (!Array.isArray(rules)) return []
  return [...new Set(rules.filter((r) => r?.type === "field" && typeof r.field === "string").map((r) => r.field))]
}

function readOrder(folder: string, chain: string[]): string[] {
  const base = document.body?.dataset.basepath?.replace(/^\/+|\/+$/g, "") ?? ""
  try {
    const saved = JSON.parse(localStorage.getItem(`quartz:dimensionOrder:${base}:${folder}`) || "null")
    if (Array.isArray(saved) && saved.length) return saved.filter((field) => chain.includes(field))
  } catch { /* use YAML order */ }
  return chain
}

function maxLevels(): number {
  const value = parseInt(document.querySelector(".explorer3")?.dataset.dimensionmaxlevels || "2", 10)
  return Number.isFinite(value) && value > 0 ? value : 2
}

function maxValues(): number {
  const value = parseInt(document.querySelector(".explorer3")?.dataset.dimensionmaxvalues || "20", 10)
  return Number.isFinite(value) && value > 0 ? value : 20
}

function firstValue(raw: unknown): string {
  const present = (v: unknown) => v !== undefined && v !== null && v !== ""
  const value = Array.isArray(raw) ? raw.find(present) : present(raw) ? raw : undefined
  if (value === undefined) return "未分类"
  const text = String(value)
  const link = text.match(/^\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]$/)
  return link ? (link[2] || link[1]).trim() : text
}

function ruleFor(raw: any, folder: string): { field: string; order: string } {
  let current = folder
  while (current) {
    if (raw?.folders?.[current]) return normalizeRule(raw.folders[current])
    current = current.includes("/") ? current.slice(0, current.lastIndexOf("/")) : ""
  }
  return normalizeRule(raw?.default)
}

function normalizeRule(raw: any): { field: string; order: string } {
  if (typeof raw === "string") return { field: raw, order: "asc" }
  return { field: raw?.field || "title", order: raw?.order === "desc" ? "desc" : "asc" }
}

function compareItems(a: ListingItem, b: ListingItem, rule: { field: string; order: string }): number {
  const value = (item: ListingItem) => rule.field === "title"
    ? item.frontmatter?.title ?? item.title
    : item.frontmatter?.[rule.field] ?? (["date", "created", "modified", "published"].includes(rule.field) ? item.dates?.[rule.field] : undefined)
  const av = value(a), bv = value(b)
  const missing = (v: unknown) => v === undefined || v === null || v === ""
  if (missing(av) !== missing(bv)) return missing(av) ? 1 : -1
  if (!missing(av)) {
    const result = typeof av === "number" && typeof bv === "number" ? av - bv : collator.compare(String(av), String(bv))
    if (result) return rule.order === "desc" ? -result : result
  }
  return collator.compare(a.title || a.slug, b.title || b.slug) || collator.compare(a.slug, b.slug)
}

function fileList(items: ListingItem[], currentSlug: string, rule: { field: string; order: string }): HTMLElement {
  const sorted = items.slice().sort((a, b) => compareItems(a, b, rule))
  const wrap = document.createElement("div")
  wrap.className = "unified-list-files"
  const list = document.createElement("ul")
  wrap.appendChild(list)
  let shown = 0
  const more = document.createElement("button")
  more.type = "button"
  more.className = "unified-list-more"
  more.addEventListener("click", () => appendBatch())
  wrap.appendChild(more)
  function appendBatch() {
    for (const item of sorted.slice(shown, shown + BATCH)) {
      const li = document.createElement("li")
      const link = document.createElement("a")
      link.className = "internal"
      link.href = resolveRelative(currentSlug, item.slug)
      link.textContent = item.title || item.slug.split("/").at(-1) || item.slug
      li.appendChild(link)
      list.appendChild(li)
    }
    shown = Math.min(sorted.length, shown + BATCH)
    more.hidden = shown >= sorted.length
    more.textContent = `显示更多（${shown}/${sorted.length}）`
  }
  appendBatch()
  return wrap
}

function groupNode(label: string, count: number, href: string | null, children: HTMLElement, open: boolean): HTMLElement {
  const details = document.createElement("details")
  details.className = "unified-list-group"
  details.open = open
  const summary = document.createElement("summary")
  const name = document.createElement("span")
  name.className = "unified-list-name"
  name.textContent = label
  const badge = document.createElement("span")
  badge.className = "unified-list-count"
  badge.textContent = String(count)
  summary.append(name, badge)
  details.appendChild(summary)
  if (href) {
    const link = document.createElement("a")
    link.href = href
    link.className = "internal unified-list-open"
    link.textContent = "打开分类页 ↗"
    details.appendChild(link)
  }
  details.appendChild(children)
  return details
}

function fieldLink(slug: string, folder: string, ancestors: Array<{ field: string; value: string }>, currentSlug: string): string {
  const query = new URLSearchParams()
  query.set("scope", folder)
  if (ancestors.length) query.set("filter", ancestors.map((item) => `${item.field}:${item.value}`).join(","))
  return `${resolveRelative(currentSlug, slug)}?${query}`
}

function renderLevels(items: ListingItem[], fields: string[], folder: string, manifest: any, currentSlug: string, rule: any, ancestors: Array<{ field: string; value: string }> = []): HTMLElement {
  const container = document.createElement("div")
  container.className = "unified-list-level"
  const field = fields[0]
  const fieldInfo = manifest?.fields?.find((entry) => entry.field === field)
  if (!fieldInfo || !items.length) {
    container.appendChild(fileList(items, currentSlug, rule))
    return container
  }
  const values = new Map(fieldInfo.values?.map((entry) => [entry.value, entry.valueSlug]) || [])
  const buckets = new Map<string, ListingItem[]>()
  const leftover: ListingItem[] = []
  for (const item of items) {
    const value = firstValue(item.frontmatter?.[field])
    if (!values.has(value)) { leftover.push(item); continue }
    if (!buckets.has(value)) buckets.set(value, [])
    buckets.get(value)!.push(item)
  }
  const ordered = [...buckets.entries()].sort((a, b) => b[1].length - a[1].length || collator.compare(a[0], b[0]))
  const cap = maxValues()
  for (const [value, members] of ordered.slice(cap)) leftover.push(...members)
  ordered.slice(0, cap).forEach(([value, members], index) => {
    const slug = `_dimensions/${fieldInfo.fieldSlug}/${values.get(value)}`
    const nested = renderLevels(members, fields.slice(1), folder, manifest, currentSlug, rule, [...ancestors, { field, value }])
    container.appendChild(groupNode(`${field} · ${value}`, members.length, fieldLink(slug, folder, ancestors, currentSlug), nested, index === 0 && ancestors.length === 0))
  })
  if (leftover.length) container.appendChild(fileList(leftover, currentSlug, rule))
  return container
}

export async function renderUnifiedListing(target: HTMLElement, groups: Array<{ folder: string; items: ListingItem[]; label?: string }>, currentSlug: string, rawSort: any, showDirectories: boolean, baseFilters: Array<{ field: string; value: string }> = []): Promise<void> {
  const renderId = String((Number(target.dataset.unifiedRenderId) || 0) + 1)
  target.dataset.unifiedRenderId = renderId
  const [aggregation, manifest] = await Promise.all([load("static/aggregation.json"), load("graph/dimensions/index.json")])
  const output = document.createElement("div")
  output.className = "unified-list"
  for (const group of groups) {
    const { folder, items } = group
    const rule = ruleFor(rawSort, folder)
    const chain = fieldChain(aggregation?.resolved?.[folderContext(folder, aggregation?.root?.depth || 1)])
    const fields = readOrder(folder, chain).slice(0, maxLevels()).filter((field) => !baseFilters.some((filter) => filter.field === field))
    const content = document.createElement("div")
    content.className = "unified-list-directory"
    const folders = items.filter((item) => item.folder)
    const files = items.filter((item) => !item.folder)
    if (folders.length) {
      const row = document.createElement("div")
      row.className = "unified-list-folders"
      for (const item of folders.sort((a, b) => compareItems(a, b, rule))) {
        const link = document.createElement("a")
        link.className = "internal unified-list-folder"
        link.href = resolveRelative(currentSlug, item.slug)
        link.textContent = `▣  ${item.title || item.slug}`
        row.appendChild(link)
      }
      content.appendChild(row)
    }
    content.appendChild(renderLevels(files, fields, folder, manifest, currentSlug, rule, baseFilters))
    if (showDirectories) {
      const href = resolveRelative(currentSlug, folder === "/" ? "index" : `${folder}/index`)
      output.appendChild(groupNode(group.label || folder || "/", items.length, href, content, false))
    } else output.appendChild(content)
  }
  if (target.dataset.unifiedRenderId !== renderId) return
  target.replaceChildren(output)
  target.classList.add("unified-list-ready")
}
