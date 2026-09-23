import type { QuartzComponentProps } from "@quartz-community/types"

/** 维度页的两种形态：维度索引页（值域）与维度值页（某取值下的实体）。 */
export type AggregationPageKind = "index" | "value"

/** 索引页上的单个取值条目 */
export interface AggregationFieldValueSummary {
  value: string
  valueSlug: string
  count: number
}

/** 某取值在某个目录上下文里的实体数 */
export interface AggregationScopeCount {
  scope: string
  count: number
}

/**
 * 虚拟页承载的标记数据。会经 `defaultProcessedContent` 写入虚拟页 frontmatter，
 * 进而进入 `contentIndex.json`，因此保持轻量：
 * - 索引页只带取值清单（受 maxValuesPerField 上限约束）
 * - 值页**不带实体清单**，实体列表由运行期脚本从 `graphUrl` 指向的维度子图里取 `matched` 渲染
 */
export interface AggregationPageData {
  aggregationPage: {
    kind: AggregationPageKind
    /** frontmatter 里的原始字段名 */
    field: string
    /** 字段名 slug（URL 片段） */
    fieldSlug: string
    /** 值页：原始取值；索引页为 undefined */
    value?: string
    /** 值页：取值 slug（URL 片段） */
    valueSlug?: string
    /** 索引页：取值种类数；值页：实体数 */
    count: number
    /** 该字段 / 该取值出现过的目录上下文（排序） */
    scopes?: string[]
    /** 值页：各目录上下文下的实体数（scope 切换条） */
    scopeCounts?: AggregationScopeCount[]
    /** 索引页：取值清单（受 maxValuesPerField 上限约束） */
    values?: AggregationFieldValueSummary[]
    /** 值页：维度子图产物地址（相对站点根，运行时按 body[data-basepath] 拼接） */
    graphUrl?: string
  }
}

/** 两种视图共用的 props：组件 props + 已解析的维度页数据 */
export type AggregationViewProps = QuartzComponentProps & {
  data?: AggregationPageData["aggregationPage"]
}
