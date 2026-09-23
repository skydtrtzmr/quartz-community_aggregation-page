/** 维度页的两种形态：维度索引页（值域）与维度值页（某取值下的实体）。 */
export type AggregationPageKind = "index" | "value"

/**
 * 虚拟页承载的标记数据。会经 `defaultProcessedContent` 写入虚拟页 frontmatter，
 * 进而进入 `contentIndex.json`，因此保持轻量：不放实体 slug 列表。
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
    /** 值页：维度子图产物地址（相对站点根，运行时按 basePath 拼接） */
    graphUrl?: string
    /** 索引页：出现过该字段的目录上下文列表（用于生成带 ?scope= 的入口） */
    scopes?: string[]
  }
}
