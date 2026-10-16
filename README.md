# aggregation-page-pro

Quartz v5 本地插件（自研，无社区上游）：把**聚合规则的分类结果**落成可访问、可索引的页面，
并复用站点既有图谱渲染展示该分类下的关系子图。

## 页面与 URL 协议

| 页面 | URL | 说明 |
| --- | --- | --- |
| 维度索引页 | `/_dimensions/<field>/` | 列出该字段的全部取值与计数 |
| 维度值页 | `/_dimensions/<field>/<value>/` | 该取值下的实体列表 + 关系图（正文区） |
| 文件夹页入口 | `/目录/` 顶部 | 该目录可用维度与取值计数（组件 `AggregationNav`） |

运行时参数（只做裁剪，不改变页面集合）：

| 参数 | 含义 |
| --- | --- |
| `?scope=<目录前缀>` | 只保留 slug 前缀匹配该目录的实体（前缀匹配，含子目录） |
| `?context=<来源 slug>` | 只保留与来源节点直接相连的实体 |
| `?filter=<字段:取值>` | 保留满足祖先分类约束的实体，可用逗号串接多项 |

文件夹页和值页共用运行期列表：真实子目录优先，之后按本目录规则链与右上角面板顺序展示可展开的取值组；文件按 `listingSort` 排序，每组先显示 20 条。值页无 `scope` 时先按实体所在真实目录分组，再应用该目录自己的动态分类。分类链接保留目录与祖先取值约束。

维度值页面包屑复用站点 Breadcrumbs 的结构及配置。构建时通过 `data-dimension-breadcrumbs` 写入目录标题与维度路由映射，初始化时结合 URL 的 `scope`、`filter`、`context` 同步生成导航，不等待图谱或维度清单请求。脚本初始化前保留导航占位并隐藏系统路径，生成后显示；元数据缺失时显示目录路径和条件文字，不猜测取值 slug。首次升级需要完整重建页面 HTML。

`folder` 类型的聚合规则不生成新页：图谱里的 folder 聚合节点直接跳到既有文件夹页。

## 产物协议

维度子图写在独立命名空间 `graph/dimensions/**`（不与 graph-pro 的 `graph/local/**` 混写），
结构与 graph-pro 的 `LocalGraphData` 同构：

```json
{
  "version": 1,
  "center": "_dimensions/status/进行中",
  "depth": 1,
  "generatedAt": 0,
  "nodes": { "<slug>": { "title": "...", "tags": [], "frontmatter": {} } },
  "edges": [{ "source": "<slug>", "target": "<slug>" }],
  "folderTitles": {}
}
```

页面上的图谱容器通过 `data-local-graph-url` 指定该产物地址，graph-pro 的渲染脚本按此取数
（并据 `?scope=` / `?context=` 过滤）。

## 规则来源

只消费 `aggregation-pro` 编译的共享规则（`configuration.aggregation` → `static/aggregation.json`）：

- `root: { type: folder, depth: N }` 决定**目录上下文**的粒度
- `branches.folders` 未配置时逐层向上回退，最终用 `branches.default`；空数组等价于未配置（不存在「显式中断」态）
- 规则只有 `folder` 与 `field` 两种；日期维度由字段值承担（值即分组键）

## 配置

```yaml
plugins:
  - source: ../plugins-local/aggregation-page-pro
    enabled: true
    order: 56
layout:
  byPageType:
    aggregation-page:
      exclude: [reader-mode, graph]
      positions:
        right: []
    folder:
      positions:
        beforeBody: [AggregationNav]
```

> 多组件插件只能用**导出名**引用组件（加载器仅在「恰好一个组件」时登记插件名别名）。

## 开发

```bash
npm install
npm run typecheck
npm test
npm run build   # 站点读 dist/，改 src 后必须重建
```

## 统计与增量更新

- 目录维度入口、维度页计数和 JSON 的 `matched` 共用源实体边界：排除目录索引页、系统页及虚拟占位页。
- 入口数量按当前目录子树统计；值页通过 `scope/context/filter` 裁剪同一份维度 JSON。
- 字段和取值的 URL 使用全域维度计划分配的 slug，避免跨目录同名 slug 冲突；构建内复用同一份全域计划。
- Quartz 核心负责目录页的增量依赖与源正文重解析，本插件负责维度产物。删除最后一个取值后，按旧 manifest 清理失效的维度 HTML/JSON；不会删除源文件。
- 悬浮预览通过核心 `popover-created` 事件初始化，按目标链接参数显示计数与列表；预览不启动图谱模拟。
- 文件夹底部总数沿用 folder-page 插件的当前层条目口径，子文件夹算一个条目；与维度的子树实体数不是同一统计范围。

修改插件公共脚本后必须重新生成站点资源；仅执行无内容变化的增量构建会跳过资源生成。
