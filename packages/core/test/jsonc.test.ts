import { describe, it, expect } from "vitest"
import { parseJsonc, readJsoncFile } from "../src/jsonc.js"
import { mkdtempSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

describe("parseJsonc", () => {
  it("parses standard JSON", () => {
    expect(parseJsonc('{"a":1}', "<inline>")).toEqual({ a: 1 })
  })

  it("strips line and block comments", () => {
    const text = `{
      // line comment
      "a": 1, /* block comment */
      "b": 2
    }`
    expect(parseJsonc(text, "<inline>")).toEqual({ a: 1, b: 2 })
  })

  it("tolerates trailing commas", () => {
    expect(parseJsonc('{"a":1,}', "<inline>")).toEqual({ a: 1 })
  })

  it("returns {} for an empty input", () => {
    expect(parseJsonc("", "<inline>")).toEqual({})
    expect(parseJsonc("   \n\t", "<inline>")).toEqual({})
  })

  it("throws with file path and offset on syntax error", () => {
    expect(() => parseJsonc('{"a":}', "config.jsonc")).toThrow(/config\.jsonc/)
  })
})

describe("readJsoncFile", () => {
  it("reads and parses a JSONC file on disk", () => {
    const dir = mkdtempSync(join(tmpdir(), "opencode-profile-jsonc-"))
    try {
      const path = join(dir, "x.jsonc")
      writeFileSync(path, '{ /* hi */ "a": 1, }', "utf8")
      expect(readJsoncFile(path)).toEqual({ a: 1 })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
