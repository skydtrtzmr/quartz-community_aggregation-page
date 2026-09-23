import { describe, expect, it } from "vitest"
import { planFolderNav, itemsInFolder, DEFAULT_NAV_MAX_VALUES } from "../src/util/nav"
import { normalizeAggregation, type AggregationItem } from "../src/util/rules"

/** 与演示域同款：default 用 type/status，任务 只按 status，问答 显式停链 */
const config = normalizeAggregation({
  minGroupSize: 1,
  root: { type: "folder", depth: 1 },
  branches: {
    default: [
      { type: "field", field: "type" },
      { type: "field", field: "status" },
    ],
    folders: {
      任务: [{ type: "field", field: "status" }],
      问答: [],
    },
  },
})!

const item = (slug: string, frontmatter: Record<string, unknown> = {}): AggregationItem => ({
  slug,
  frontmatter,
})

const items: AggregationItem[] = [
  item("任务/task-01", { status: "进行中", type: "文档" }),
  item("任务/task-02", { status: "进行中", type: "文档" }),
  item("任务/task-03", { status: "已完成", type: "文档" }),
  item("任务/年度任务/task-04", { status: "进行中" }),
  item("人员/person-01", { type: "工程师", status: "在职" }),
  item("人员/person-02", { type: "工程师" }),
  item("问答/qa-01", { type: "问答", status: "已解决" }),
  item("示例集/other-01", { status: "进行中" }),
]

describe("文件夹页维度入口（planFolderNav）", () => {
  it("只统计当前目录子树，并按规则链顺序给出字段", () => {
    const plan = planFolderNav(items, config, "任务")
    expect(plan.context).toBe("任务")
    expect(plan.fields.map((field) => field.field)).toEqual(["status"])
    const field = plan.fields[0]!
    // 子树含嵌套目录 `任务/年度任务/task-04`
    expect(field.values).toEqual([
      { value: "进行中", valueSlug: "进行中", count: 3 },
      { value: "已完成", valueSlug: "已完成", count: 1 },
    ])
    expect(field.count).toBe(4)
    expect(field.indexSlug).toBe("_dimensions/status/index")
  })

  it("嵌套目录继承顶级目录的规则链（depth=1）", () => {
    const plan = planFolderNav(items, config, "任务/年度任务")
    expect(plan.context).toBe("任务")
    const field = plan.fields[0]!
    expect(field.values).toEqual([{ value: "进行中", valueSlug: "进行中", count: 1 }])
    expect(field.count).toBe(1)
  })

  it("前缀匹配按目录段，不误伤同前缀目录（示例 vs 示例集）", () => {
    expect(itemsInFolder(items, "示例").map((i) => i.slug)).toEqual([])
    expect(planFolderNav(items, config, "示例").fields).toEqual([])
  })

  it("显式空链的目录不出入口", () => {
    expect(planFolderNav(items, config, "问答").fields).toEqual([])
    expect(planFolderNav(items, config, "问答").context).toBe("问答")
  })

  it("取值缺失的字段不进清单；字段计数只算有该字段的实体", () => {
    const plan = planFolderNav(items, config, "人员")
    expect(plan.fields.map((field) => field.field)).toEqual(["type", "status"])
    const typeField = plan.fields[0]!
    const statusField = plan.fields[1]!
    expect(typeField.count).toBe(2)
    expect(statusField.count).toBe(1)
    expect(statusField.values).toEqual([{ value: "在职", valueSlug: "在职", count: 1 }])
  })

  it("超过展示上限时给出 hiddenValues", () => {
    const plan = planFolderNav(items, config, "任务", { maxValuesPerField: 1 })
    const field = plan.fields[0]!
    expect(field.values).toHaveLength(1)
    expect(field.hiddenValues).toBe(1)
    expect(DEFAULT_NAV_MAX_VALUES).toBe(12)
  })

  it("根目录与空配置不出入口", () => {
    expect(planFolderNav(items, config, "").fields).toEqual([])
    expect(planFolderNav(items, null, "任务").fields).toEqual([])
  })
})
