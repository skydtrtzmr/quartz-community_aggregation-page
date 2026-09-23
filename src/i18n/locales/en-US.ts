export default {
  pages: {
    aggregationPage: {
      /** Dimension index page */
      index: {
        title: "Grouped by {field}",
        count: "{count} values",
        empty: "No values available for this field.",
        scopeHint: "Active in:",
      },
      /** Dimension value page */
      value: {
        count: "{count} entries",
        empty: "No entries in this category.",
        graphPending: "The relation graph lands in a later step.",
        listLoading: "Loading entries…",
      },
      /** Directory scope */
      /** Folder-page dimension entry */
      nav: {
        title: "Dimensions in this folder",
        more: "{count} more",
      },
      scope: {
        all: "All",
        root: "Top level",
      },
      unavailable: "This page is missing its dimension metadata (stale build?).",
    },
  },
}
