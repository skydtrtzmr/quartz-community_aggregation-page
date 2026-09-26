import { describe, expect, it, vi } from "vitest"
import {
  collectContexts,
  fieldChain,
  folderContextOf,
  normalizeAggregation,
  resolveChain,
} from "../src/util/rules"

/** 与 aggregation-pro/test/compiler.test.ts 同款的基准配置，用于语义对拍（新写法：folderDepth + 纯字段名） */
const base = {
  minGroupSize: 2,
  folderDepth: 2,
  branches: {
    default: ["status"],
    folders: {
      任务: ["owner"],
      "任务/特殊任务": [],
    },
  },
}

describe("聚合规则解析（与 aggregation-pro 语义一致）", () => {
  it("未配置的目录逐层向上回退，全部未命中用 default", () => {
    const config = normalizeAggregation(base)!
    expect(resolveChain(config, "任务/年度任务")).toEqual([{ type: "field", field: "owner" }])
    expect(resolveChain(config, "人员")).toEqual([{ type: "field", field: "status" }])
    expect(resolveChain(config, "/")).toEqual([{ type: "field", field: "status" }])
  })

  it("显式 [] 停止继承，不落到父目录", () => {
    const config = normalizeAggregation(base)!
    expect(resolveChain(config, "任务/特殊任务")).toEqual([])
    expect(resolveChain(config, "任务/特殊任务/子目录")).toEqual([])
  })

  it("目录上下文按 folderDepth 截断，根目录为 /", () => {
    expect(folderContextOf("任务/年度任务/a", 2)).toBe("任务/年度任务")
    expect(folderContextOf("任务/年度任务/a", 1)).toBe("任务")
    expect(folderContextOf("人员/org-00001", 2)).toBe("人员")
    expect(folderContextOf("index", 1)).toBe("/")
  })

  it("collectContexts 去重且排序稳定", () => {
    const items = [
      { slug: "任务/年度任务/a" },
      { slug: "任务/年度任务/b" },
      { slug: "人员/index" },
      { slug: "index" },
    ]
    expect(collectContexts(items, 1)).toEqual(["/", "人员", "任务"].sort())
    expect(collectContexts(items, 2)).toEqual(["/", "人员", "任务/年度任务"].sort())
  })

  it("目录键规范化后仍能命中（空格/大小写）", () => {
    const config = normalizeAggregation({
      folderDepth: 1,
      branches: { folders: { "A B": [] }, default: ["x"] },
    })!
    expect(resolveChain(config, "a-b")).toEqual([])
  })

  it("folderDepth 与字段链缺省：深度 1、default 为空", () => {
    const config = normalizeAggregation({})!
    expect(config.root.depth).toBe(1)
    expect(config.branches.default).toEqual([])
    expect(config.branches.folders).toEqual({})
  })

  it("fieldChain 去重并保持规则顺序", () => {
    expect(
      fieldChain([
        { type: "folder", depth: 1 },
        { type: "field", field: "status" },
        { type: "field", field: "type" },
        { type: "field", field: "status" },
      ]),
    ).toEqual(["status", "type"])
  })

  it("非法配置只告警并返回 null，不抛错", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    expect(normalizeAggregation(undefined)).toBeNull()
    expect(normalizeAggregation({ folderDepth: 0 })).toBeNull()
    expect(normalizeAggregation({ folderDepth: 1.5 })).toBeNull()
    // 未声明的键（老写法 root / type: field 也会在这里被拦下）
    expect(normalizeAggregation({ ...base, typo: true })).toBeNull()
    expect(normalizeAggregation({ ...base, root: { type: "folder", depth: 1 } })).toBeNull()
    expect(normalizeAggregation({ ...base, branches: { default: "x" } })).toBeNull()
    expect(normalizeAggregation({ ...base, branches: { default: [{ type: "field", field: "x" }] } })).toBeNull()
    expect(normalizeAggregation({ ...base, branches: { default: [""] } })).toBeNull()
    expect(normalizeAggregation({ ...base, branches: { default: [123], folders: {} } })).toBeNull()
    // 目录键必须落在内容根下
    expect(normalizeAggregation({ ...base, branches: { folders: { "../任务": [] } } })).toBeNull()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})
