import type {
  FullSlug,
  QuartzComponent,
  QuartzComponentConstructor,
  QuartzComponentProps,
} from "@quartz-community/types"
import { resolveRelative } from "@quartz-community/utils/path"
import { format, i18n } from "../i18n"
import { planFolderNav, type FolderNavPlan } from "../util/nav"
import { normalizeAggregation, type AggregationItem, type NormalizedAggregation } from "../util/rules"
import { DIMENSIONS_PREFIX, dimensionValueSlug } from "../util/slug"
import style from "./styles/aggregation-page.scss"

export interface AggregationNavOptions {
  /** 单字段最多展示的取值数（默认 12，超出部分给"还有 N 个"链到字段索引页） */
  maxValuesPerField?: number
}

/** 系统页所在目录：这些「目录页」不展示维度入口 */
const SYSTEM_FOLDERS = [DIMENSIONS_PREFIX, "tags"]

/**
 * 文件夹页的维度分类入口（挂在 `layout` 的 `beforeBody`，插件条目 `position: beforeBody`）。
 *
 * ## 展示口径
 * - **只在目录页渲染**：与 folder-page 同一套匹配口径（`slug` 以 `/index` 结尾），
 *   且排除系统目录（`_dimensions/`、`tags/`）与内容根（根目录没有"本目录"语义）
 * - **只统计当前目录子树**：目录页讲的是"这个文件夹里有什么"，因此计数取子树内的实体
 * - 每条链接都带 `?scope=<当前目录>`，与维度值页的目录裁剪口径一致（前缀匹配）
 * - 字段顺序沿用规则链顺序（规则链即优先轴），与图谱里聚合节点出现的顺序一致
 * - 目录不在任何规则链上、或子树内没有可用取值时**整体不渲染**
 *
 * ## 为什么计数在组件里算
 * `aggregation-pro` 的产物（`static/aggregation.json`）在 Phase 2 才写出，且与页面渲染并行，
 * 组件里读不到它；因此这里与 `pageType.ts` 一样，从 `configuration.aggregation` 直接解析
 * （`util/rules.ts` 的语义与 aggregation-pro 的 compiler 对齐，有对拍测试）。
 */
export default ((opts?: AggregationNavOptions) => {
  const maxValuesPerField = opts?.maxValuesPerField

  /** 配置规范化结果按原始对象缓存：组件对每页都会渲染一次，避免重复解析与重复告警 */
  const configCache = new WeakMap<object, NormalizedAggregation | null>()
  function resolveConfig(raw: unknown): NormalizedAggregation | null {
    if (!raw || typeof raw !== "object") return null
    const cached = configCache.get(raw as object)
    if (cached !== undefined) return cached
    const parsed = normalizeAggregation(raw)
    configCache.set(raw as object, parsed)
    return parsed
  }

  /**
   * 入口清单缓存：`planFolderNav` 与目录内实体数成正比，而组件对每个页面都会渲染一次。
   * 同一构建进程内 `allFiles` 是同一份数组对象 → 以它为键缓存「目录 → 清单」。
   */
  const navPlanCache = new WeakMap<object, Map<string, FolderNavPlan>>()
  function resolveNavPlan(
    allFiles: QuartzComponentProps["allFiles"],
    config: NormalizedAggregation,
    folder: string,
  ): FolderNavPlan {
    let byFolder = navPlanCache.get(allFiles as unknown as object)
    if (!byFolder) {
      byFolder = new Map()
      navPlanCache.set(allFiles as unknown as object, byFolder)
    }
    const cached = byFolder.get(folder)
    if (cached) return cached

    const items: AggregationItem[] = []
    for (const file of allFiles) {
      const slug = (file as { slug?: string }).slug
      if (!slug) continue
      // 虚拟节点占位页不参与统计（与 pageType / emitter 的源内容口径一致）
      if ((file as { frontmatter?: { virtualNode?: unknown } }).frontmatter?.virtualNode === true) {
        continue
      }
      items.push({
        slug,
        frontmatter: (file as { frontmatter?: Record<string, unknown> }).frontmatter,
      })
    }

    const plan = planFolderNav(items, config, folder, { maxValuesPerField })
    byFolder.set(folder, plan)
    return plan
  }

  const AggregationNav: QuartzComponent = ({
    fileData,
    allFiles,
    cfg,
    ctx,
  }: QuartzComponentProps) => {
    const locale = cfg?.locale ?? "en-US"
    const text = i18n(locale).pages.aggregationPage
    const slug = (fileData.slug ?? "") as string

    // 只在目录页渲染：与 folder-page 的 `slug.endsWith("/index")` 口径一致
    if (!slug.endsWith("/index")) return null
    const folder = slug.slice(0, -"/index".length)
    if (folder.length === 0) return null
    if (SYSTEM_FOLDERS.some((prefix) => folder === prefix || folder.startsWith(`${prefix}/`))) {
      return null
    }

    // 已发布的 types 里 `ctx` 是 `unknown`（宿主实际是 BuildCtx），这里按需断言
    const rawConfig = (
      ctx as { cfg?: { configuration?: { aggregation?: unknown } } } | undefined
    )?.cfg?.configuration?.aggregation
    const config = resolveConfig(rawConfig)
    if (!config) return null

    const plan = resolveNavPlan(allFiles, config, folder)
    if (plan.fields.length === 0) return null

    const currentSlug = slug as FullSlug
    const indexHref = (field: FolderNavPlan["fields"][number]) =>
      resolveRelative(currentSlug, field.indexSlug as FullSlug)

    return (
      <nav class="aggregation-nav" data-aggregation-nav data-folder={folder}>
        <h3 class="aggregation-nav-title">{text.nav.title}</h3>
        {plan.fields.map((field) => (
          <section class="aggregation-nav-group" key={field.fieldSlug}>
            <h4 class="aggregation-nav-field">
              <a class="internal" href={indexHref(field)}>
                {field.field}
              </a>
              <span class="aggregation-nav-field-count">{field.count}</span>
            </h4>
            <ul class="aggregation-values">
              {field.values.map((value) => (
                <li class="aggregation-values-item" key={value.valueSlug}>
                  <a
                    class="internal"
                    href={`${resolveRelative(
                      currentSlug,
                      dimensionValueSlug(field.fieldSlug, value.valueSlug) as FullSlug,
                    )}?scope=${encodeURIComponent(folder)}`}
                  >
                    <span class="aggregation-values-name">{value.value}</span>
                    <span class="aggregation-values-count">{value.count}</span>
                  </a>
                </li>
              ))}
              {field.hiddenValues > 0 ? (
                <li class="aggregation-values-item aggregation-nav-more">
                  <a class="internal" href={indexHref(field)}>
                    {format(text.nav.more, { count: field.hiddenValues })}
                  </a>
                </li>
              ) : null}
            </ul>
          </section>
        ))}
      </nav>
    )
  }

  AggregationNav.css = style

  return AggregationNav
}) satisfies QuartzComponentConstructor<AggregationNavOptions>
