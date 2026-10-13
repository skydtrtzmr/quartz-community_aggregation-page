import { describe, expect, it } from "vitest"
import { dimensionBreadcrumbData } from "../src/util/breadcrumbData"

describe("dimension breadcrumb metadata", () => {
  it("keeps folder titles and generated collision-safe routes without entity data", () => {
    const data = JSON.parse(dimensionBreadcrumbData([
      { slug: "courses/index", frontmatter: { title: "培训课程" } },
      { slug: "courses/a", frontmatter: { title: "Private entity", body: "not navigation" } },
      { slug: "_dimensions/type/index", aggregationPage: {
        kind: "index", field: "type", fieldSlug: "type", count: 2,
        values: [
          { value: "A B", valueSlug: "a-b", count: 5 },
          { value: "A-B", valueSlug: "a-b-2", count: 8 },
        ],
      } },
    ]))
    expect(data.folderTitles).toEqual({ courses: "培训课程" })
    expect(data.fields[0].values).toEqual([
      { value: "A B", valueSlug: "a-b" },
      { value: "A-B", valueSlug: "a-b-2" },
    ])
    expect(JSON.stringify(data)).not.toContain("Private entity")
  })

  it("does not reuse a prior build's metadata for a new file array", () => {
    const first = [{ slug: "courses/index", frontmatter: { title: "Old" } }]
    expect(JSON.parse(dimensionBreadcrumbData(first)).folderTitles.courses).toBe("Old")
    expect(JSON.parse(dimensionBreadcrumbData([
      { slug: "courses/index", frontmatter: { title: "New" } },
    ])).folderTitles.courses).toBe("New")
  })
})
