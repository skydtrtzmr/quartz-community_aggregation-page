import { afterEach, expect, it, vi } from "vitest"

const { render } = vi.hoisted(() => ({ render: vi.fn().mockResolvedValue(undefined) }))
vi.mock("../src/components/scripts/unifiedListing", () => ({ renderUnifiedListing: render, cancelUnifiedListing: vi.fn() }))
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); vi.resetModules() })

it("filters preview count/list using the target scope, context and ancestor filters", async () => {
  const doc = Object.assign(new EventTarget(), {
    body: { dataset: { basepath: "/demo", slug: "host/index" } },
    querySelectorAll: () => [],
  })
  vi.stubGlobal("document", doc)
  vi.stubGlobal("window", { location: { search: "?scope=wrong-host" } })
  const nodes = Object.fromEntries(["project/a", "project/b", "people/c"].map(slug => [slug, {
    slug, title: slug, frontmatter: { status: slug === "project/b" ? "closed" : "open" },
  }]))
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({
    center: "_dimensions/type/value", nodes,
    matched: Object.keys(nodes).map(slug => ({ slug, scope: slug.split("/")[0] })),
    edges: Object.keys(nodes).map(target => ({ source: "source", target })),
  }) }))
  const count = { textContent: "3" }
  const graphWrap = { setAttribute: vi.fn() }
  const list = { dataset: { dimensionEntitiesUrl: "graph/dimensions/type/value.json" } }
  const section = {
    dataset: { countTemplate: "共 {count} 个实体", field: "type", value: "value" },
    querySelector: (selector: string) => ({
      "[data-dimension-count]": count, ".aggregation-graph-wrap": graphWrap, "[data-dimension-entities]": list,
    })[selector] ?? null,
  }
  const container = { isConnected: true, querySelectorAll: () => [section] }
  await import("../src/components/scripts/aggregationPage.inline")
  const event = new Event("popover-created")
  Object.assign(event, { detail: { container, url: "https://example.com/demo/value?scope=project&context=source&filter=status:open" } })
  doc.dispatchEvent(event)
  await vi.waitFor(() => expect(count.textContent).toBe("共 1 个实体"))
  expect(render).toHaveBeenCalledOnce()
  expect(render.mock.calls[0]![1][0].items.map((item: { slug: string }) => item.slug)).toEqual(["project/a"])
  expect(render.mock.calls[0]![2]).toBe("host/index")
  expect(graphWrap.setAttribute).toHaveBeenCalledWith("hidden", "")
})
