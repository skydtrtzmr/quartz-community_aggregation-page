import type { AggregationPageData } from "../types"

type PageData = {
  slug?: string
  frontmatter?: Record<string, unknown>
  aggregationPage?: AggregationPageData["aggregationPage"]
}

// The dispatcher shares this array across pages in a build. Cache only navigation
// metadata, so no graph payload or entity list is duplicated into the HTML.
const cache = new WeakMap<object, string>()

export function dimensionBreadcrumbData(allFiles: readonly PageData[]): string {
  const cached = cache.get(allFiles)
  if (cached) return cached
  const folderTitles: Record<string, string> = Object.create(null)
  const fields = new Map<string, { field: string; fieldSlug: string; values: { value: string; valueSlug: string }[] }>()
  for (const file of allFiles) {
    const slug = file.slug ?? ""
    const title = file.frontmatter?.title
    if ((slug === "index" || slug.endsWith("/index")) &&
        !slug.startsWith("_dimensions/") && !slug.startsWith("tags/") &&
        typeof title === "string" && title.trim()) {
      folderTitles[slug === "index" ? "/" : slug.slice(0, -6)] = title.trim()
    }
    const page = file.aggregationPage
    if (page?.kind === "index") {
      fields.set(page.field, {
        field: page.field,
        fieldSlug: page.fieldSlug,
        values: (page.values ?? []).map(({ value, valueSlug }) => ({ value, valueSlug })),
      })
    }
  }
  const serialized = JSON.stringify({ folderTitles, fields: [...fields.values()] })
  cache.set(allFiles, serialized)
  return serialized
}
