import type { BuildCtx, GlobalConfiguration } from "@quartz-community/types"
import { normalizeAggregation, type NormalizedAggregation } from "./rules"

/**
 * 从宿主配置里读 `configuration.aggregation`（pageType 与 emitter 共用）。
 *
 * 已发布的 `@quartz-community/types` 尚未声明该字段（宿主 `quartz/quartz/cfg.ts` 已声明），
 * 因此这里用局部接口 + 断言读取；优先取 ctx（构建期），回退到组件 props 的扁平 cfg。
 */
export function readAggregationConfig(
  ctx?: BuildCtx,
  cfg?: GlobalConfiguration,
): NormalizedAggregation | null {
  const fromCtx = (ctx?.cfg?.configuration as { aggregation?: unknown } | undefined)?.aggregation
  const fromCfg = (cfg as unknown as { aggregation?: unknown } | undefined)?.aggregation
  return normalizeAggregation(fromCtx ?? fromCfg)
}
