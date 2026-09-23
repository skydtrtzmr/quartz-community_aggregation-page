export default {
  pages: {
    aggregationPage: {
      /** 维度索引页 */
      index: {
        title: "按「{field}」分类",
        count: "共 {count} 个取值",
        empty: "该字段暂无可用取值。",
        scopeHint: "作用目录：",
      },
      /** 维度值页 */
      value: {
        count: "共 {count} 个实体",
        empty: "该分类下暂无实体。",
        graphPending: "关系图将在后续步骤接入。",
        listLoading: "正在加载实体列表…",
      },
      /** 目录范围（scope） */
      scope: {
        all: "全部",
        root: "顶级目录",
      },
      /** 文件夹页的维度入口 */
      nav: {
        title: "本目录维度",
        more: "还有 {count} 个",
      },
      unavailable: "该页缺少维度信息（可能由旧构建残留）。",
    },
  },
}
