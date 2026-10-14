import { expect, it } from "vitest"
import { unclassifiedLast } from "../src/util/valueOrder"

it("运行时嵌套列表的每层先将未分类放最后，再保留数量和名称排序", () => {
  const groups: [string, number][] = [["未分类", 128], ["研发部", 18], ["人事部", 6]]
  groups.sort((a, b) => unclassifiedLast(a[0], b[0]) || b[1] - a[1] || a[0].localeCompare(b[0]))
  expect(groups.map(([value]) => value)).toEqual(["研发部", "人事部", "未分类"])
  expect(unclassifiedLast("未分类", "未分类")).toBe(0)
})
