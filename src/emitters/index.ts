import type { FilePath, QuartzEmitterPlugin } from "@quartz-community/types"

export interface AggregationPageEmitterOptions {}

/**
 * 维度子图产物 emitter（`graph/dimensions/**`）。
 *
 * 骨架阶段：不产出任何文件。后续步骤会在这里为每个维度值写出与
 * graph-pro `LocalGraphData` 同构的子图（匹配实体 + 对端节点 + 边 + folderTitles），
 * 并支持增量重写。
 */
export const AggregationPageEmitter: QuartzEmitterPlugin<AggregationPageEmitterOptions> = () => {
  async function emit(): Promise<FilePath[]> {
    return []
  }

  return {
    name: "AggregationPageEmitter",
    emit,
    partialEmit: emit,
  }
}
