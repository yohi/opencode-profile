import { describe, it, expect } from "vitest"
import { deepMergeConfig, applyOverlayInPlace } from "../src/merge.js"

describe("deepMergeConfig", () => {
  it("returns a new object and does not mutate inputs", () => {
    const base = { a: 1 }
    const overlay = { a: 2 }
    const result = deepMergeConfig(base, overlay)
    expect(result).not.toBe(base)
    expect(base).toEqual({ a: 1 })
    expect(overlay).toEqual({ a: 2 })
  })

  it("overwrites primitives with the overlay value", () => {
    expect(deepMergeConfig({ a: 1, b: "x" }, { a: 2 })).toEqual({ a: 2, b: "x" })
  })

  it("deep-merges nested objects", () => {
    expect(deepMergeConfig({ a: { b: 1, c: 2 } }, { a: { c: 9, d: 3 } })).toEqual({
      a: { b: 1, c: 9, d: 3 },
    })
  })

  it("replaces arrays by default", () => {
    expect(deepMergeConfig({ a: [1, 2, 3] }, { a: [9] })).toEqual({ a: [9] })
  })

  it("concatenates and deduplicates arrays for `instructions`", () => {
    expect(deepMergeConfig({ instructions: ["a", "b"] }, { instructions: ["b", "c"] })).toEqual({
      instructions: ["a", "b", "c"],
    })
  })

  it("supports extending concatKeys via MergeOptions", () => {
    const result = deepMergeConfig(
      { tags: ["x"] },
      { tags: ["x", "y"] },
      { concatKeys: new Set(["tags"]) },
    )
    expect(result).toEqual({ tags: ["x", "y"] })
  })

  it("treats null in overlay as overwrite-with-null (not deletion)", () => {
    expect(deepMergeConfig({ a: 1 }, { a: null } as unknown as Partial<{ a: number }>)).toEqual({
      a: null,
    })
  })

  it("adds overlay keys absent in base", () => {
    expect(deepMergeConfig({} as Record<string, unknown>, { a: 1 })).toEqual({ a: 1 })
  })

  it("lets overlay win on type mismatch", () => {
    const base: Record<string, unknown> = { a: { x: 1 } }
    expect(deepMergeConfig(base, { a: "str" })).toEqual({ a: "str" })
  })

  it("handles empty overlay as a no-op", () => {
    expect(deepMergeConfig({ a: 1, b: 2 }, {})).toEqual({ a: 1, b: 2 })
  })
})

describe("applyOverlayInPlace", () => {
  it("mutates the target in place and preserves its reference identity", () => {
    const target = { a: 1, nested: { x: 1 } }
    const ref = target
    applyOverlayInPlace(target, { a: 2, nested: { y: 2 } })
    expect(target).toBe(ref)
    expect(target).toEqual({ a: 2, nested: { x: 1, y: 2 } })
  })

  it("concatenates `instructions` end-to-end on the original reference", () => {
    const target: { instructions: string[] } = { instructions: ["a"] }
    applyOverlayInPlace(target, { instructions: ["a", "b"] })
    expect(target.instructions).toEqual(["a", "b"])
  })
})
