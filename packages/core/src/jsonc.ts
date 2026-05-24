import { parse, printParseErrorCode, type ParseError } from "jsonc-parser"
import { readFileSync } from "node:fs"

function formatErrors(errors: ParseError[], source: string, text: string): string {
  const lines = errors.map((error) => {
    const upto = text.slice(0, error.offset)
    const line = upto.split("\n").length
    const col = upto.length - upto.lastIndexOf("\n")
    return `${source}:${line}:${col}: ${printParseErrorCode(error.error)} (length ${error.length})`
  })
  return `JSONC parse error(s):\n  ${lines.join("\n  ")}`
}

export function parseJsonc(text: string, source: string): unknown {
  if (text.trim() === "") return {}
  const errors: ParseError[] = []
  const value = parse(text, errors, { allowTrailingComma: true, disallowComments: false })
  if (errors.length > 0) throw new Error(formatErrors(errors, source, text))
  return value ?? {}
}

export function readJsoncFile(path: string): unknown {
  const text = readFileSync(path, "utf8")
  return parseJsonc(text, path)
}
