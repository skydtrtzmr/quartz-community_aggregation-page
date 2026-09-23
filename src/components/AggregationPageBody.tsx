import type {
  QuartzComponent,
  QuartzComponentConstructor,
  QuartzComponentProps,
} from "@quartz-community/types"
import { i18n } from "../i18n"
import type { AggregationPageData, AggregationViewProps } from "../types"
import DimensionIndexView from "./DimensionIndexView"
import DimensionValueView from "./DimensionValueView"
// @ts-expect-error - inline script imported as string by esbuild loader
import script from "./scripts/aggregationPage.inline.ts"
import style from "./styles/aggregation-page.scss"

/**
 * 维度页正文：按 `fileData.aggregationPage.kind` 分派两种形态。
 *
 * 一个 pageType 只能给出一个 layout 键（`resolveLayout` 的键 = `pageType.layout`），
 * 所以索引页与值页共用本组件，由数据标记区分渲染。
 */
const AggregationPageBody: QuartzComponent = (props: QuartzComponentProps) => {
  const locale = props.cfg?.locale ?? "en-US"
  const text = i18n(locale).pages.aggregationPage
  const data = (props.fileData as { aggregationPage?: AggregationPageData["aggregationPage"] })
    .aggregationPage
  const title = props.fileData.frontmatter?.title ?? props.fileData.slug ?? ""
  const viewProps = { ...props, data } as AggregationViewProps

  return (
    <div class="popover-hint">
      <article class="aggregation-page">
        <h1>{title}</h1>
        {!data ? (
          <p class="aggregation-page-placeholder">{text.unavailable}</p>
        ) : data.kind === "index" ? (
          <DimensionIndexView {...viewProps} />
        ) : (
          <DimensionValueView {...viewProps} />
        )}
      </article>
    </div>
  )
}

AggregationPageBody.css = style
// 值页的列表与 scope 切换是运行时的（数据取自维度子图产物），脚本随站点资源全局注入并自我门控
AggregationPageBody.afterDOMLoaded = script

export default (() => AggregationPageBody) satisfies QuartzComponentConstructor
