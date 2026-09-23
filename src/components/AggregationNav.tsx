import type {
  QuartzComponent,
  QuartzComponentConstructor,
  QuartzComponentProps,
} from "@quartz-community/types"
import style from "./styles/aggregation-page.scss"

/**
 * 文件夹页的维度分类入口（挂在 `layout.byPageType.folder.beforeBody`）。
 *
 * 骨架阶段：只渲染一个空容器（CSS 里 `:empty` 时隐藏，因此不影响现有观感）。
 * 后续步骤会按当前目录解析规则链 → 各取值计数 → 生成带 `?scope=<目录>/` 的维度值页链接。
 */
const AggregationNav: QuartzComponent = ({ fileData }: QuartzComponentProps) => {
  return <nav class="aggregation-nav" data-aggregation-nav data-slug={fileData.slug ?? ""}></nav>
}

AggregationNav.css = style

export default (() => AggregationNav) satisfies QuartzComponentConstructor
