export interface MergeOptions {
  concatKeys: ReadonlySet<string>
}

const DEFAULT_OPTIONS: MergeOptions = {
  concatKeys: new Set(["instructions"]),
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function mergeInto(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
  options: MergeOptions,
): void {
  for (const key of Object.keys(source)) {
    const sourceValue = source[key]
    const targetValue = target[key]

    if (options.concatKeys.has(key) && Array.isArray(targetValue) && Array.isArray(sourceValue)) {
      const merged: unknown[] = [...targetValue]
      for (const item of sourceValue) {
        if (!merged.includes(item)) merged.push(item)
      }
      target[key] = merged
      continue
    }

    if (isPlainObject(targetValue) && isPlainObject(sourceValue)) {
      mergeInto(targetValue, sourceValue, options)
      continue
    }

    target[key] = sourceValue
  }
}

export function deepMergeConfig<T extends object>(
  base: T,
  overlay: Partial<T>,
  options: MergeOptions = DEFAULT_OPTIONS,
): T {
  const clone = structuredClone(base) as T
  mergeInto(clone as Record<string, unknown>, overlay as Record<string, unknown>, options)
  return clone
}

export function applyOverlayInPlace<T extends object>(
  target: T,
  overlay: Partial<T>,
  options: MergeOptions = DEFAULT_OPTIONS,
): void {
  mergeInto(target as Record<string, unknown>, overlay as Record<string, unknown>, options)
}
