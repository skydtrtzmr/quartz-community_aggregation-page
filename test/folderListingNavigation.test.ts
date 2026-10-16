import { afterEach, describe, expect, it, vi } from "vitest"

const { render, cancel } = vi.hoisted(() => ({
  render: vi.fn().mockResolvedValue(undefined),
  cancel: vi.fn(),
}))

vi.mock("../src/components/scripts/unifiedListing", () => ({
  renderUnifiedListing: render,
  cancelUnifiedListing: cancel,
}))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe("folder listings across SPA navigation", () => {
  it("reinitializes a reused container in both directions even before addCleanup exists", async () => {
    vi.resetModules()
    const target = { hidden: true }
    const section = {
      dataset: { folder: "grouped", items: "[]", listingSort: "{}" },
      querySelector: () => target,
      closest: () => null,
    }
    const doc = Object.assign(new EventTarget(), {
      body: { dataset: { slug: "grouped/index" } },
      querySelectorAll: (selector: string) => selector === "[data-unified-folder-list]" ? [section] : [],
    })
    // Component scripts initially run before SPA installs this API.
    vi.stubGlobal("window", {})
    vi.stubGlobal("document", doc)
    await import("../src/components/scripts/aggregationPage.inline")
    await Promise.resolve()
    expect(target.hidden).toBe(false)
    expect(render).toHaveBeenCalledTimes(1)

    for (const [index, folder] of ["plain", "grouped", "plain", "grouped"].entries()) {
      doc.dispatchEvent(new Event("prenav"))
      expect(cancel).toHaveBeenLastCalledWith(target)
      // Old listeners must not render while the destination is being morphed.
      const before = render.mock.calls.length
      doc.dispatchEvent(new Event("aggregation-order-changed"))
      expect(render).toHaveBeenCalledTimes(before)

      section.dataset.folder = folder
      doc.body.dataset.slug = `${folder}/index`
      target.hidden = true
      doc.dispatchEvent(new Event("nav"))
      await Promise.resolve()
      expect(render).toHaveBeenCalledTimes(index + 2)
      expect(render.mock.lastCall?.[1][0].folder).toBe(folder)
      expect(target.hidden).toBe(false)
    }
    const before = render.mock.calls.length
    doc.dispatchEvent(new Event("aggregation-order-changed"))
    expect(render).toHaveBeenCalledTimes(before + 1)
  })
})
