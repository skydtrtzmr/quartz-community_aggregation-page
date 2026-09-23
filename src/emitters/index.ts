import type {
  BuildCtx,
  FilePath,
  FullSlug,
  ProcessedContent,
  QuartzEmitterPlugin,
} from "@quartz-community/types"
import { simplifySlug } from "@quartz-community/utils/path"
import { readAggregationConfig } from "../util/config"
import {
  buildDimensionGraph,
  buildDimensionIndex,
  buildFolderTitles,
} from "../util/dimensionGraph"
import {
  DEFAULT_MAX_VALUES_PER_FIELD,
  buildValueIndex,
  planDimensions,
  sourceItems,
} from "../util/groups"
import { write } from "../util/write"

export interface AggregationPageEmitterOptions {
  /** 单字段取值数上限（与 pageType 的选项保持一致，默认 500） */
  maxValuesPerField?: number
}

/** 产物目录（独立命名空间，不与 graph-pro 的 graph/local/** 混写） */
export const DIMENSION_GRAPH_DIR = "graph/dimensions"

/**
 * 维度子图 emitter（Phase 2）。
 *
 * 为每个维度值产出一份与 graph-pro `LocalGraphData` 同构的子图：
 * 命中实体 + 一跳邻居 + 边 + folderTitles，另加本插件的 `dimension` / `matched` 扩展字段。
 *
 * 页面集合与产物集合共用 `util/groups.ts` 的同一套纯函数，保证两者不会漂移。
 * 产物很小（每份几十 KB 量级），全量与增量都整份重写。
 */
export const AggregationPageEmitter: QuartzEmitterPlugin<AggregationPageEmitterOptions> = (
  opts,
) => {
  const maxValuesPerField = opts?.maxValuesPerField ?? DEFAULT_MAX_VALUES_PER_FIELD

  async function* generate(
    ctx: BuildCtx,
    content: ProcessedContent[],
  ): AsyncGenerator<FilePath> {
    const config = readAggregationConfig(ctx)
    if (!config) {
      console.log("[AggregationPage] 未配置 configuration.aggregation，跳过分维度子图")
      return
    }

    const items = sourceItems(content)
    const plan = planDimensions(items, config, { maxValuesPerField })
    if (plan.fields.length === 0) {
      console.log("[AggregationPage] 无可用维度，跳过分维度子图")
      return
    }

    const index = buildDimensionIndex(content)
    const folderTitles = buildFolderTitles(index)
    const valueIndex = buildValueIndex(items, config)

    let written = 0
    for (const field of plan.fields) {
      const byValue = valueIndex.get(field.field)
      for (const value of field.values) {
        const matches = (byValue?.get(value.value) ?? []).map((match) => ({
          slug: simplifySlug(match.slug as never) as string,
          scope: match.scope,
        }))
        const graph = buildDimensionGraph({
          center: `_dimensions/${field.fieldSlug}/${value.valueSlug}`,
          field: field.field,
          value: value.value,
          fieldSlug: field.fieldSlug,
          valueSlug: value.valueSlug,
          matches,
          index,
          folderTitles,
        })
        yield write({
          ctx,
          slug: `${DIMENSION_GRAPH_DIR}/${field.fieldSlug}/${value.valueSlug}` as FullSlug,
          ext: ".json",
          content: JSON.stringify(graph),
        })
        written++
      }
    }

    console.log(
      `[AggregationPage] 维度子图 ${written} 份（${plan.fields.length} 个维度）-> ${DIMENSION_GRAPH_DIR}/`,
    )
  }

  return {
    name: "AggregationPageEmitter",
    emit(ctx, content) {
      return generate(ctx, content)
    },
    // 产物小且相互独立：增量时整份重写，避免维护增删逻辑
    partialEmit(ctx, content) {
      return generate(ctx, content)
    },
  }
}
