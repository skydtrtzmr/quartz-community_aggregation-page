import { it, expect } from "vitest"
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { BuildCtx, ProcessedContent } from "@quartz-community/types"
import { AggregationPageEmitter } from "../src/emitters"

it.each([false, true])("cleans obsolete dimension outputs, including an empty plan (empty=%s)", async (empty) => {
  const output = await mkdtemp(join(tmpdir(), "dimension-cleanup-"))
  try {
    await mkdir(join(output, "graph/dimensions/type"), { recursive: true })
    await mkdir(join(output, "_dimensions/type"), { recursive: true })
    await writeFile(join(output, "graph/dimensions/index.json"), JSON.stringify({ version: 1, fields: [
      { field: "type", fieldSlug: "type", values: [{ value: "old", valueSlug: "old" }, { value: "keep", valueSlug: "keep" }] },
    ] }))
    for (const name of ["old", "keep"]) {
      await writeFile(join(output, `_dimensions/type/${name}.html`), "generated")
      await writeFile(join(output, `graph/dimensions/type/${name}.json`), "{}")
    }
    await writeFile(join(output, "_dimensions/type/index.html"), "generated index")
    await writeFile(join(output, "untouched.html"), "other plugin")
    const ctx = { argv: { output }, cfg: { configuration: empty ? {} : {
      aggregation: { folderDepth: 1, branches: { default: ["type"], folders: {} } },
    } } } as unknown as BuildCtx
    const content = empty ? [] : [[{}, { data: { slug: "project/a", frontmatter: { type: "keep" } } }]] as unknown as ProcessedContent[]
    const result = await AggregationPageEmitter().emit(ctx, content, { css: [], js: [], additionalHead: [] })
    if (result && Symbol.asyncIterator in result) for await (const _file of result) { /* consume writes */ }
    await expect(readFile(join(output, "_dimensions/type/old.html"))).rejects.toMatchObject({ code: "ENOENT" })
    await expect(readFile(join(output, "graph/dimensions/type/old.json"))).rejects.toMatchObject({ code: "ENOENT" })
    const manifest = JSON.parse(await readFile(join(output, "graph/dimensions/index.json"), "utf8"))
    expect(manifest.fields.length).toBe(empty ? 0 : 1)
    if (empty) await expect(readFile(join(output, "_dimensions/type/index.html"))).rejects.toMatchObject({ code: "ENOENT" })
    else expect(await readFile(join(output, "_dimensions/type/keep.html"), "utf8")).toBe("generated")
    expect(await readFile(join(output, "untouched.html"), "utf8")).toBe("other plugin")
  } finally { await rm(output, { recursive: true, force: true }) }
})
