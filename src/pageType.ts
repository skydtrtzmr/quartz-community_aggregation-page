import type {
  FullSlug,
  PageGenerator,
  PageMatcher,
  QuartzPageTypePlugin,
  VirtualPage,
} from "@quartz-community/types"
import AggregationPageBody from "./components/AggregationPageBody"
import { format, i18n } from "./i18n"
import type { AggregationPageData } from "./types"
import { readAggregationConfig } from "./util/config"
import { DEFAULT_MAX_VALUES_PER_FIELD, planDimensions, sourceItems } from "./util/groups"
import { dimensionGraphUrl, dimensionValueSlug } from "./util/slug"

export interface AggregationPageOptions {
  /**
   * 布局键（默认 `aggregation-page`）。
   * 对应 `quartz.config.yaml` 的 `layout.byPageType["aggregation-page"]`。
   */
  layout?: string
  /**
   * 单字段取值数上限（防御性，默认 500）。
   * 取值数超过上限的字段整份跳过并告警，避免病态字段（如 title）把页面数炸开。
   */
  maxValuesPerField?: number
}

/**
 * 本页类型不参与常规页匹配：它的所有页面都来自 `generate()`（虚拟页）。
 * 返回 false 可保证不会抢占 content-page / folder-page 等真实页。
 */
const matchNothing: PageMatcher = () => false

/**
 * 维度聚合页：
 * - 维度索引页 `_dimensions/<field>/index`（目录式 URL）
 * - 维度值页 `_dimensions/<field>/<value>`
 *
 * 页面集合由「规则链上的字段 × 该字段的取值」决定；目录只决定哪些字段成为维度、
 * 以及取值域的统计范围，**不产生按目录的页面**（目录范围靠运行期 `?scope=` 裁剪）。
 * 规则语义与 `aggregation-pro` 一致，见 `util/rules.ts`。
 */
export const AggregationPageType: QuartzPageTypePlugin<AggregationPageOptions> = (opts) => {
  const layout = opts?.layout ?? "aggregation-page"
  const maxValuesPerField = opts?.maxValuesPerField ?? DEFAULT_MAX_VALUES_PER_FIELD

  const generate: PageGenerator = ({ content, cfg, ctx }) => {
    const aggregation = readAggregationConfig(ctx, cfg)
    if (!aggregation) return []

    const locale = cfg?.locale ?? "en-US"
    const text = i18n(locale).pages.aggregationPage
    const items = sourceItems(content)
    const plan = planDimensions(items, aggregation, { maxValuesPerField })

    for (const field of plan.skipped) {
      console.warn(
        `[AggregationPage] 字段「${field.field}」取值数 ${field.distinctValues} 超过上限 ${maxValuesPerField}，已跳过该维度`,
      )
    }

    const pages: VirtualPage[] = []
    for (const field of plan.fields) {
      const indexData: AggregationPageData["aggregationPage"] = {
        kind: "index",
        field: field.field,
        fieldSlug: field.fieldSlug,
        count: field.values.length,
        scopes: field.scopes,
        values: field.values.map((value) => ({
          value: value.value,
          valueSlug: value.valueSlug,
          count: value.count,
        })),
      }
      pages.push({
        slug: field.indexSlug as FullSlug,
        title: format(text.index.title, { field: field.field }),
        data: { aggregationPage: indexData },
      })

      for (const value of field.values) {
        const valueData: AggregationPageData["aggregationPage"] = {
          kind: "value",
          field: field.field,
          fieldSlug: field.fieldSlug,
          value: value.value,
          valueSlug: value.valueSlug,
          count: value.count,
          scopes: value.scopes,
          scopeCounts: value.scopeCounts,
          graphUrl: dimensionGraphUrl(field.fieldSlug, value.valueSlug),
        }
        pages.push({
          slug: dimensionValueSlug(field.fieldSlug, value.valueSlug) as FullSlug,
          title: value.value,
          data: { aggregationPage: valueData },
        })
      }
    }

    console.log(
      `[AggregationPage] ${plan.fields.length} 个维度 / ${pages.length} 个页面（源内容 ${items.length} 篇，目录作用域 ${plan.fields.map((f) => `${f.field}:${f.scopes.length}`).join(" ") || "-"}）`,
    )
    return pages
  }

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
