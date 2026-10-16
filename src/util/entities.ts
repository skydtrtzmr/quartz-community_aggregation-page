/** Directory index pages describe a folder; they are not entities in dimension counts/lists. */
export function isFolderIndexSlug(slug: string): boolean {
  return slug === "" || slug === "/" || slug === "index" || slug.endsWith("/") || slug.endsWith("/index")
}

/** Shared source boundary for generated dimension pages and folder navigation. */
export function isDimensionEntity(item: {
  slug: string; virtualNode?: boolean; frontmatter?: Record<string, unknown>
}): boolean {
  return !isFolderIndexSlug(item.slug) && !item.slug.startsWith("_dimensions/") &&
    !item.slug.startsWith("tags/") && item.virtualNode !== true && item.frontmatter?.virtualNode !== true
}
