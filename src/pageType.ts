import type {
  PageGenerator,
  PageMatcher,
  QuartzPageTypePlugin,
} from "@quartz-community/types"
import AggregationPageBody from "./components/AggregationPageBody"

export interface AggregationPageOptions {
  /**
   * 布局键（默认 `aggregation-page`）。
   * 对应 `quartz.config.yaml` 的 `layout.byPageType["aggregation-page"]`。
   */
  layout?: string
}

/**
 * 本页类型不参与常规页匹配：它的所有页面都来自 `generate()`（虚拟页）。
 * 返回 false 可保证不会抢占 content-page / folder-page 等真实页。
 */
const matchNothing: PageMatcher = () => false

/**
 * 维度聚合页（索引页 `_dimensions/<field>/` 与值页 `_dimensions/<field>/<value>/`）。
 *
 * 骨架阶段：`generate()` 返回空数组，站点行为与未启用本插件一致。
 * 页面集合与元数据在后续步骤实现（读 `configuration.aggregation`，与 aggregation-pro 同语义）。
 */
export const AggregationPageType: QuartzPageTypePlugin<AggregationPageOptions> = (opts) => {
  const layout = opts?.layout ?? "aggregation-page"

  const generate: PageGenerator = () => []

  return {
    name: "AggregationPage",
    // 低于 tag-page(10) / folder-page：避免与它们抢占系统虚拟页
    priority: 5,
    match: matchNothing,
    generate,
    layout,
    body: AggregationPageBody,
  }
}
