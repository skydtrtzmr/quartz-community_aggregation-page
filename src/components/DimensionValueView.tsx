import { format, i18n } from "../i18n"
import type { AggregationViewProps } from "../types"

/**
 * 维度值页正文：分类标题与计数 → 目录 scope 切换条 → 当前筛选说明（含「从哪跳转来」+ 清除上下文）
 * → 关系图画布（正文区）→ 实体列表。
 *
 * 画布与列表的数据来源是**同一份**维度子图产物（`data.graphUrl` → `graph/dimensions/**`）：
 * - 图谱由 graph-pro 的渲染脚本按该地址取数，并按 `?scope=`/`?context=`/`?filter=` 过滤
 * - 列表由本插件的脚本取产物的 `matched` 渲染，**按目录分组**，随 `?scope=` 一起裁剪
 *
 * 筛选说明（`data-dimension-context-desc`）由脚本按运行期参数填充，例如
 * 「人员 中 type 为「测试」的实体（与 项目-00001 相关）」；「清除上下文」按钮只在带
 * `?context=` 时显示（点击移除 context、回到 scope 内全量）。
 */
const DimensionValueView = ({ cfg, data }: AggregationViewProps) => {
  const locale = cfg?.locale ?? "en-US"
  const text = i18n(locale).pages.aggregationPage
  const graphUrl = data?.graphUrl ?? ""
  const scopeCounts = data?.scopeCounts ?? []
  const labelFor = (scope: string) => (scope === "/" ? text.scope.root : scope)

  return (
    <section
      class="aggregation-value"
      data-dimension-value
      data-count-template={text.value.count}
      data-field={data?.field ?? ""}
      data-value={data?.value ?? ""}
    >
      <p class="aggregation-value-count">
        <span data-dimension-count>{format(text.value.count, { count: data?.count ?? 0 })}</span>
      </p>

      {scopeCounts.length > 1 ? (
        <div class="aggregation-scope-tabs" data-dimension-scope-tabs role="tablist">
          <button type="button" class="is-active" data-scope="" data-scope-label={text.scope.all}>
            {text.scope.all}
          </button>
          {scopeCounts.map((entry) => (
            <button
              type="button"
              key={entry.scope}
              data-scope={entry.scope}
              data-scope-label={labelFor(entry.scope)}
            >
              {labelFor(entry.scope)}
              <span class="aggregation-scope-count">{entry.count}</span>
            </button>
          ))}
        </div>
      ) : null}

      <div class="aggregation-context-bar">
        <p
          class="aggregation-context-desc"
          data-dimension-context-desc
          hidden
          data-desc-with-scope={text.value.descWithScope}
          data-desc-no-scope={text.value.descNoScope}
          data-related-template={text.value.relatedTo}
          data-scope-root={text.scope.root}
          data-scope-all={text.scope.all}
        ></p>
        <button
          class="aggregation-clear-context"
          type="button"
          data-dimension-clear-context
          hidden
        >
          {text.value.clearContext}
        </button>
      </div>

      <div class="aggregation-graph-wrap">
        <div
          class="aggregation-graph"
          data-dimension-graph
          data-dimension-graph-url={graphUrl}
          aria-label={text.value.graphPending}
        >
          <p class="aggregation-graph-placeholder">{text.value.graphPending}</p>
        </div>
        <button
          class="global-graph-icon dimension-expand"
          type="button"
          data-dimension-expand
          aria-label={text.value.expand}
          title={text.value.expand}
        >
          <svg
            version="1.1"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
          </svg>
        </button>
      </div>

      <ul
        class="aggregation-entities"
        data-dimension-entities
        data-dimension-entities-url={graphUrl}
        data-empty-text={text.value.empty}
      >
        <li class="aggregation-entities-placeholder">{text.value.listLoading}</li>
      </ul>
    </section>
  )
}

export default DimensionValueView
