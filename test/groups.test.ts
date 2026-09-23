import { describe, expect, it, vi } from "vitest"
import type { ProcessedContent } from "@quartz-community/types"
import { planDimensions, sourceItems } from "../src/util/groups"
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

const values = (field: string, items: ReturnType<typeof item>[]) => {
  const plan = planDimensions(items, config)
  const found = plan.fields.find((f) => f.field === field)
  return found ? found.values.map((v) => [v.value, v.count, v.valueSlug]) : null
}

describe("维度页清单", () => {
  it("字段取自规则链，且取值域只统计该字段生效的目录", () => {
    const items = [
      item("项目/a", { type: "研发" }),
      item("项目/b", { type: "研发" }),
      item("任务/t1", { type: "文档", status: "进行中" }),
      item("问答/q1", { type: "问答", status: "进行中" }),
    ]
    const plan = planDimensions(items, config)
    expect(plan.fields.map((f) => f.field)).toEqual(["status", "type"])
    expect(plan.fields.find((f) => f.field === "type")!.scopes).toEqual(["项目"])
    expect(plan.fields.find((f) => f.field === "status")!.scopes).toEqual(["任务"])
    // 任务（链上是 status）与问答（显式 []）的值都不计入 type 维度
    expect(values("type", items)).toEqual([["研发", 2, "研发"]])
    expect(values("status", items)).toEqual([["进行中", 1, "进行中"]])
  })

  it("数组取第一个有值元素；缺失不计入；同一取值累计计数", () => {
    const items = [
      item("项目/a", { type: ["", null, "研发", "运营"] }),
      item("项目/b", { type: "研发" }),
      item("项目/c", {}),
      item("项目/d", { type: [] }),
    ]
    expect(values("type", items)).toEqual([["研发", 2, "研发"]])
  })

  it("slug 冲突按原始值排序消解，并保留 index 段给索引页", () => {
    const items = [
      item("项目/a", { type: "A B" }),
      item("项目/b", { type: "A-B" }),
      item("项目/c", { type: "index" }),
      item("项目/d", { type: "研发" }),
    ]
    expect(values("type", items)).toEqual([
      ["A B", 1, "a-b"],
      ["A-B", 1, "a-b-2"],
      ["index", 1, "index-2"],
      ["研发", 1, "研发"],
    ])
  })

  it("展示顺序为计数降序、同数按值升序", () => {
    const items = [
      item("项目/a", { type: "乙" }),
      item("项目/b", { type: "甲" }),
      item("项目/c", { type: "甲" }),
      item("项目/d", { type: "丙" }),
    ]
    expect(values("type", items)!.map((v) => v[0])).toEqual(["甲", "丙", "乙"])
  })

  it("取值数超过上限的字段整份跳过并记录原因", () => {
    const items = Array.from({ length: 5 }, (_, i) => item(`项目/p${i}`, { type: `t${i}` }))
    const plan = planDimensions(items, config, { maxValuesPerField: 3 })
    expect(plan.fields).toEqual([])
    expect(plan.skipped).toEqual([{ field: "type", distinctValues: 5, reason: "maxValues" }])
    expect(planDimensions(items, config).fields).toHaveLength(1)
  })

  it("索引页 slug 用目录式约定，值页 slug 挂在字段下", () => {
    const plan = planDimensions([item("项目/a", { type: "研发" })], config)
    const field = plan.fields[0]!
    expect(field.indexSlug).toBe("_dimensions/type/index")
    expect(field.values[0]!.valueSlug).toBe("研发")
  })

  it("取值带各目录上下文的计数（scope 切换条数据）", () => {
    const items = [
      item("项目/a", { type: "研发" }),
      item("项目/b", { type: "研发" }),
      item("人员/a", { type: "研发" }),
      item("人员/b", { type: "运营" }),
    ]
    const plan = planDimensions(items, config)
    const typeField = plan.fields.find((f) => f.field === "type")!
    const research = typeField.values.find((v) => v.value === "研发")!
    expect(research.count).toBe(3)
    // 按实体数降序（同数按目录名升序）
    expect(research.scopes).toEqual(["项目", "人员"])
    expect(research.scopeCounts).toEqual([
      { scope: "项目", count: 2 },
      { scope: "人员", count: 1 },
    ])
    // scopeCounts 之和 == 总数
    for (const value of typeField.values) {
      expect(value.scopeCounts.reduce((sum, entry) => sum + entry.count, 0)).toBe(value.count)
    }
  })

  it("字段 slug 冲突时也能消解（Type 与 type）", () => {
    const bothFields = normalizeAggregation({
      root: { type: "folder", depth: 1 },
      branches: {
        default: [
          { type: "field", field: "type" },
          { type: "field", field: "Type" },
        ],
      },
    })!
    const items = [item("项目/a", { type: "研发", Type: "X" })]
    const plan = planDimensions(items, bothFields)
    expect(plan.fields.map((f) => f.fieldSlug).sort()).toEqual(["type", "type-2"])
  })

  it("没有聚合配置时不产出任何维度", () => {
    expect(planDimensions([item("项目/a", { type: "研发" })], null)).toEqual({
      fields: [],
      skipped: [],
    })
  })
})

describe("源内容筛选", () => {
  const content = [
    [{}, { data: { slug: "项目/a", frontmatter: { type: "研发" } } }],
    [{}, { data: { slug: "_dimensions/type/index", frontmatter: { type: "研发" } } }],
    [{}, { data: { slug: "tags/研发", frontmatter: { type: "研发" } } }],
    [{}, { data: { slug: "缺失页", frontmatter: { virtualNode: true, type: "研发" } } }],
  ] as unknown as ProcessedContent[]

  it("排除维度页自身、标签页与虚拟占位页", () => {
    expect(sourceItems(content).map((i) => i.slug)).toEqual(["项目/a"])
  })
})
