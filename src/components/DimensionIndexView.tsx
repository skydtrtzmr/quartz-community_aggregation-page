import type { FullSlug } from "@quartz-community/types"
import { resolveRelative } from "@quartz-community/utils/path"
import { format, i18n } from "../i18n"
import type { AggregationViewProps } from "../types"
import { dimensionValueSlug } from "../util/slug"

/**
 * 维度索引页正文：该字段的**作用目录**（哪些文件夹/顶级配置了按这个维度聚合）
 * + 全部取值与计数，逐条链到对应维度值页。
 *
 * 取值清单随页面一起构建期渲染（受 `maxValuesPerField` 上限约束，规模可控），
 * 不需要额外 fetch —— 只有值页的实体清单走产物。
 */
const DimensionIndexView = ({ fileData, cfg, data }: AggregationViewProps) => {
  const locale = cfg?.locale ?? "en-US"
  const text = i18n(locale).pages.aggregationPage
  const currentSlug = fileData.slug as FullSlug
  const values = data?.values ?? []
  const scopes = data?.scopes ?? []
  const labelFor = (scope: string) => (scope === "/" ? text.scope.root : scope)

  return (
    <section class="aggregation-index">
      <p class="aggregation-index-count">
        {format(text.index.count, { count: data?.count ?? values.length })}
      </p>

      {scopes.length > 0 ? (
        <p class="aggregation-index-scopes">
          <span class="aggregation-index-scopes-label">{text.index.scopeHint}</span>
          {scopes.map((scope) => (
            <span class="aggregation-index-scope" key={scope}>
              {labelFor(scope)}
            </span>
          ))}
        </p>
      ) : null}

      {values.length === 0 ? (
        <p class="aggregation-index-empty">{text.index.empty}</p>
      ) : (
        <ul class="aggregation-values">
          {values.map((value) => (
            <li class="aggregation-values-item" key={value.valueSlug}>
              <a
                class="internal"
                href={resolveRelative(
                  currentSlug,
                  dimensionValueSlug(data?.fieldSlug ?? "", value.valueSlug) as FullSlug,
                )}
              >
                <span class="aggregation-values-name">{value.value}</span>
                <span class="aggregation-values-count">{value.count}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default DimensionIndexView
