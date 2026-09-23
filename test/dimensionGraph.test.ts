import { describe, expect, it } from "vitest"
import type { ProcessedContent } from "@quartz-community/types"
import {
  buildDimensionGraph,
  buildDimensionIndex,
  buildFolderTitles,
} from "../src/util/dimensionGraph"
import { buildValueIndex, planDimensions } from "../src/util/groups"
import { normalizeAggregation } from "../src/util/rules"

const config = normalizeAggregation({
  minGroupSize: 2,
  root: { type: "folder", depth: 1 },
  branches: {
    default: [{ type: "field", field: "type" }],
    folders: { 任务: [{ type: "field", field: "status" }], 问答: [] },
  },
})!

const item = (slug: string, frontmatter: Record<string, unknown> = {}) => ({ slug, frontmatter })

/** 构造一条已处理内容（只填维度子图用得到的字段） */
const page = (
  slug: string,
  opts: { title?: string; links?: string[]; frontmatter?: Record<string, unknown> } = {},
) =>
  [
    {},
    {
      data: {
        slug,
        relativePath: `${slug}.md`,
        links: opts.links ?? [],
        frontmatter: { title: opts.title ?? slug, ...(opts.frontmatter ?? {}) },
      },
    },
  ] as unknown as ProcessedContent

describe("维度子图索引", () => {
  it("排除维度页、标签页与虚拟占位页，并给出目录标题映射", () => {
    const content = [
      page("项目/index", { title: "项目" }),
      page("项目/proj-1", { links: ["人员/org-1"] }),
      page("人员/org-1"),
      page("_dimensions/type/index", { title: "按 type 分类" }),
      page("tags/研发"),
      page("缺失页", { frontmatter: { virtualNode: true } }),
    ]
    const index = buildDimensionIndex(content)
    expect([...index.keys()].sort()).toEqual(["人员/org-1", "项目/", "项目/proj-1"])
    expect(buildFolderTitles(index)).toEqual({ 项目: "项目" })
  })
})

describe("维度子图构建", () => {
  const content = [
    page("项目/index", { title: "项目" }),
    page("项目/proj-1", { title: "项目一", links: ["人员/org-1"], frontmatter: { type: "研发", 负责人: "[[人员/org-1]]" } }),
    page("项目/proj-2", { title: "项目二", frontmatter: { type: "研发" } }),
    page("人员/org-1", { title: "人员一", links: ["项目/proj-1"] }),
    page("人员/org-2", { title: "人员二", links: ["项目/proj-1", "项目/proj-2"] }),
  ]
  const items = content.map(([, file]) => ({
    slug: (file as { data: { slug: string } }).data.slug,
    frontmatter: (file as { data: { frontmatter: Record<string, unknown> } }).data.frontmatter,
  }))

  it("命中集合与页面清单的计数一致（页面集合 == 产物集合）", () => {
    const plan = planDimensions(items, config)
    const valueIndex = buildValueIndex(items, config)
    for (const field of plan.fields) {
      for (const value of field.values) {
        const matches = valueIndex.get(field.field)?.get(value.value) ?? []
        expect(matches.length).toBe(value.count)
      }
    }
  })

  it("节点 = 命中实体 + 一跳邻居；边去重且带来源字段；列表只用 matched", () => {
    const index = buildDimensionIndex(content)
    const valueIndex = buildValueIndex(items, config)
    const matches = (valueIndex.get("type")?.get("研发") ?? []).map((match) => ({
      slug: match.slug,
      scope: match.scope,
    }))
    const graph = buildDimensionGraph({
      center: "_dimensions/type/研发",
      field: "type",
      value: "研发",
      fieldSlug: "type",
      valueSlug: "研发",
      matches,
      index,
      folderTitles: buildFolderTitles(index),
    })

    expect(graph.version).toBe(1)
    expect(graph.center).toBe("_dimensions/type/研发")
    expect(graph.dimension).toEqual({
      field: "type",
      value: "研发",
      fieldSlug: "type",
      valueSlug: "研发",
    })
    expect(graph.matched.map((match) => match.slug).sort()).toEqual(["项目/proj-1", "项目/proj-2"])
    expect(graph.matched.every((match) => match.scope === "项目")).toBe(true)

    // 命中 + 出链邻居（人员/org-1）+ 入链来源（人员/org-2）
    expect(Object.keys(graph.nodes).sort()).toEqual([
      "人员/org-1",
      "人员/org-2",
      "项目/proj-1",
      "项目/proj-2",
    ])
    expect(graph.nodes["项目/proj-1"]!.content).toBe("")
    expect(graph.nodes["项目/proj-1"]!.title).toBe("项目一")

    const edgePairs = graph.edges.map((edge) => `${edge.source}->${edge.target}`).sort()
    expect(edgePairs).toEqual([
      "人员/org-1->项目/proj-1",
      "人员/org-2->项目/proj-1",
      "人员/org-2->项目/proj-2",
      "项目/proj-1->人员/org-1",
    ])
    // frontmatter 里带 wikilink 的边会记录来源字段
    expect(graph.edges.find((edge) => edge.source === "项目/proj-1")!.sourceField).toBe("负责人")
  })

  it("命中实体不在索引里时被跳过（不产生空节点）", () => {
    const index = buildDimensionIndex(content)
    const graph = buildDimensionGraph({
      center: "_dimensions/type/x",
      field: "type",
      value: "x",
      fieldSlug: "type",
      valueSlug: "x",
      matches: [{ slug: "不存在的页", scope: "项目" }],
      index,
      folderTitles: {},
    })
    expect(graph.nodes).toEqual({})
    expect(graph.edges).toEqual([])
    expect(graph.matched).toEqual([{ slug: "不存在的页", scope: "项目" }])
  })
})
