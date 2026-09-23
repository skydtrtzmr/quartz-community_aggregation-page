import type {
  QuartzComponent,
  QuartzComponentConstructor,
  QuartzComponentProps,
} from "@quartz-community/types"
import { i18n } from "../i18n"
import style from "./styles/aggregation-page.scss"

/**
 * 维度页正文。
 *
 * 骨架阶段：只渲染标题与占位说明。
 * 后续步骤会按 `fileData.aggregationPage.kind` 分派两种形态：
 * - `index`：维度索引页，列出该字段的全部取值与计数（带 ?scope= 入口）
 * - `value`：维度值页，正文图谱容器（复用 graph-pro 渲染）+ 实体列表
 */
const AggregationPageBody: QuartzComponent = ({ fileData, cfg }: QuartzComponentProps) => {
  const locale = (cfg as { locale?: string } | undefined)?.locale ?? "en-US"
  const text = i18n(locale).pages.aggregationPage
  const title = fileData.frontmatter?.title ?? fileData.slug ?? ""

  return (
    <div class="popover-hint">
      <article class="aggregation-page">
        <h1>{title}</h1>
        <p class="aggregation-page-placeholder">{text.pending}</p>
      </article>
    </div>
  )
}

AggregationPageBody.css = style

export default (() => AggregationPageBody) satisfies QuartzComponentConstructor
