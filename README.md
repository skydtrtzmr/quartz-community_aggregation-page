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
- `branches.folders` 未配置时逐层向上回退，最终用 `branches.default`；显式 `[]` 停止继承
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

## 当前状态

骨架阶段：工程、清单、pageType / emitter / 组件占位与 i18n 已就位；
`generate()` 暂返回空、emitter 暂不产出文件，站点行为与未启用本插件一致。
