import type {
  FullSlug,
  QuartzComponent,
  QuartzComponentConstructor,
  QuartzComponentProps,
} from "@quartz-community/types"
import { i18n } from "../i18n"
import { fieldChain, folderContextOf, normalizeAggregation, resolveChain } from "../util/rules"
// @ts-expect-error - inline script imported as string by esbuild loader
import script from "./scripts/aggregationConfig.inline.ts"
import style from "./styles/aggregation-config.scss"

export interface AggregationConfigToggleOptions {
  /** 单次展示的维度项上限（防御性，默认 20） */
  maxFields?: number
}

/**
 * 右上角「本目录聚合配置」按钮（与阅读模式 / 全局图谱 / 夜间模式同一排）。
 *
 * 点击后打开面板：列出**当前目录**可用的维度（= 该目录规则链上的字段），拖动排序；
 * 只有前 `dimensionMaxLevels` 级（站点级选项，默认 2）真正参与目录树的分区，
 * 其余以置灰形式保留（拖动到前 N 位即可启用）——一个位面同时表达优先级 / 开关 / 选择。
 *
 * 约定（跨插件契约，`explorer-pro` 的目录树按同一份数据分区）：
 * - localStorage 键：`quartz:dimensionOrder:<basePath>:<目录>`，值 = 字段名数组（优先级从高到低）
 * - 改完后派发 `document` 上的 `aggregation-order-changed` 事件
 * - 级数上限读取 `explorer3` 容器的 `data-dimensionmaxlevels`（单一来源，避免两处配置漂移）
 *
 * 可见性在**构建期**决定（站点没配 aggregation、或当前目录规则链为空 → 不渲染），
 * 因此不会出现"先出现再消失"的抖动。
 */
export default ((opts?: AggregationConfigToggleOptions) => {
  const maxFields = opts?.maxFields ?? 20

  const AggregationConfigToggle: QuartzComponent = ({
    fileData,
    cfg,
    ctx,
  }: QuartzComponentProps) => {
    const locale = cfg?.locale ?? "en-US"
    const text = i18n(locale).pages.aggregationPage.config
    const slug = (fileData.slug ?? "") as string

    // 目录页 slug 形如 `<目录>/index`；内容页取其所在目录；根目录不提供配置
    const folder = slug.endsWith("/index") ? slug.slice(0, -"/index".length) : slug.includes("/") ? slug.slice(0, slug.lastIndexOf("/")) : ""
    if (folder === "") return null

    // 该目录的候选维度（只能选规则链上的字段：维度页是构建期产物）
    const rawConfig = (
      ctx as { cfg?: { configuration?: { aggregation?: unknown } } } | undefined
    )?.cfg?.configuration?.aggregation
    const aggregation = normalizeAggregation(rawConfig)
    if (!aggregation) return null
    const chain = fieldChain(resolveChain(aggregation, folderContextOf(`${folder}/x`, aggregation.root.depth)))
    if (chain.length === 0) return null

    return (
      <div class="aggregation-config" data-aggregation-config data-folder={folder}>
        <button
          class="aggregation-config-toggle"
          type="button"
          aria-label={text.button}
          aria-expanded="false"
          title={text.button}
        >
          <svg
            version="1.1"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
            <circle cx="16" cy="7" r="2" />
            <circle cx="10" cy="17" r="2" />
          </svg>
        </button>

        <div class="aggregation-config-panel" data-aggregation-config-panel hidden>
          <div class="aggregation-config-head">
            <span class="aggregation-config-title">{text.title}</span>
            <button class="aggregation-config-reset" type="button" data-aggregation-config-reset>
              {text.reset}
            </button>
          </div>
          <p
            class="aggregation-config-hint"
            data-aggregation-config-hint
            data-hint-template={text.hint}
          ></p>
          <ul
            class="aggregation-config-list"
            data-aggregation-config-list
            data-max-fields={String(maxFields)}
            data-applied-label={text.applied}
            data-dimmed-label={text.dimmed}
          ></ul>
          <p class="aggregation-config-note">{text.note}</p>
        </div>
      </div>
    )
  }

  AggregationConfigToggle.css = style
  AggregationConfigToggle.afterDOMLoaded = script

  return AggregationConfigToggle
}) satisfies QuartzComponentConstructor<AggregationConfigToggleOptions>
