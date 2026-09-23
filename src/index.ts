// aggregation-page-pro 主入口。
//
// 加载约定（quartz5/quartz/plugins/loader/config-loader.ts 的 findFactory）：
// 本模块**不导出 default**，而是导出两个具名工厂，加载器按 category 形状（无参调用探测）
// 分别挑出 pageType 与 emitter；因此两个工厂都必须容忍 `opts` 为 undefined，
// 且不得在构造期做 I/O。
export { AggregationPageType } from "./pageType"
export type { AggregationPageOptions } from "./pageType"
export { AggregationPageEmitter } from "./emitters"
export type { AggregationPageEmitterOptions } from "./emitters"
export { default as AggregationPageBody } from "./components/AggregationPageBody"
export { default as AggregationNav } from "./components/AggregationNav"
export type { AggregationPageData, AggregationPageKind } from "./types"

// Re-export shared types from @quartz-community/types
export type {
  QuartzComponent,
  QuartzComponentProps,
  QuartzComponentConstructor,
  QuartzPageTypePlugin,
  QuartzPageTypePluginInstance,
  PageMatcher,
  PageGenerator,
  VirtualPage,
} from "@quartz-community/types"
