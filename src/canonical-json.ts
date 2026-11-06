/**
 * The one canonical-JSON encoder. Pure: no Node module imports, so browser code
 * (the control-plane app reaches it through snapshot.ts) never depends on node:crypto.
 * Digests live in canonical-digest.ts.
 */
export interface CanonicalJsonOptions {
  /**
   * What an object field whose value is `undefined` means. "refuse" (the default)
   * throws; "omit" drops the field, as JSON.stringify does. An `undefined` array
   * element is refused in both modes.
   */
  readonly undefinedFields?: "refuse" | "omit";
}

/** UTF-16 code-unit order, which is RFC 8785's key order. */
function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Throw when `value` holds an unpaired surrogate, which has no UTF-8 encoding. */
export function assertWellFormedUnicode(value: string, path: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        throw new Error(`${path}: canonical UTF-8 text cannot contain an unpaired surrogate`);
      }
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      throw new Error(`${path}: canonical UTF-8 text cannot contain an unpaired surrogate`);
    }
  }
}

function encode(value: unknown, omit: boolean, path: string, active: Set<object>): string {
  if (value === null) return "null";
  if (typeof value === "string") {
    assertWellFormedUnicode(value, path);
    return JSON.stringify(value);
  }
  if (typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`${path}: canonical JSON requires a finite number`);
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (typeof value !== "object") throw new Error(`${path}: value is not canonical JSON`);
  if (active.has(value)) throw new Error(`${path}: canonical JSON cannot contain a cycle`);
  active.add(value);
  try {
    if (Array.isArray(value)) {
      const encoded: string[] = [];
      for (let index = 0; index < value.length; index += 1) {
        if (!(index in value)) throw new Error(`${path}[${index}]: canonical JSON cannot contain an array hole`);
        encoded.push(encode(value[index], omit, `${path}[${index}]`, active));
      }
      return `[${encoded.join(",")}]`;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error(`${path}: canonical JSON requires a plain object`);
    }
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.some((key) => typeof key === "symbol")) {
      throw new Error(`${path}: canonical JSON cannot contain symbol keys`);
    }
    const encoded: string[] = [];
    for (const key of (ownKeys as string[]).sort(compareCodeUnits)) {
      assertWellFormedUnicode(key, `${path} object key`);
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !("value" in descriptor)) {
        throw new Error(`${path}.${key}: canonical JSON requires enumerable data properties`);
      }
      if (descriptor.value === undefined) {
        if (omit) continue;
        throw new Error(`${path}.${key}: canonical JSON cannot encode undefined`);
      }
      encoded.push(`${JSON.stringify(key)}:${encode(descriptor.value, omit, `${path}.${key}`, active)}`);
    }
    return `{${encoded.join(",")}}`;
  } finally {
    active.delete(value);
  }
}

/**
 * RFC-8785-compatible canonical JSON for Mister Clean's JSON record domain: keys in
 * UTF-16 code-unit order, -0 written as 0, and a refusal for anything outside plain
 * JSON (non-finite numbers, cycles, array holes, non-plain objects, symbol keys,
 * accessors and unpaired surrogates).
 */
export function canonicalJson(value: unknown, options: CanonicalJsonOptions = {}): string {
  return encode(value, options.undefinedFields === "omit", "$", new Set());
}

/** Whether two values have the same canonical JSON. Throws when either is outside the domain. */
export function canonicalEqual(left: unknown, right: unknown, options: CanonicalJsonOptions = {}): boolean {
  return canonicalJson(left, options) === canonicalJson(right, options);
}
