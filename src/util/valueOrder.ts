/** 分类值的固定优先级；数量及名称排序由调用方继续处理。 */
export function unclassifiedLast(a: string, b: string): number {
  return Number(a === "未分类") - Number(b === "未分类")
}
