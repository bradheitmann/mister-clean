/**
 * The one timestamp grammar module. Each profile is a site's external contract;
 * every profile shares one tokenising parser and one calendar check, and none
 * consults Date.parse, so acceptance never depends on the JavaScript engine.
 *
 * - `record`: closeout records. `T` or space, 1-9 fraction digits, `Z` or `±hh[:]mm`, year >= 1.
 * - `rfc3339`: semantic and trust-root records. `T`, any fraction digits, `Z` or `±hh[:]mm`.
 * - `utc_ms`: control-plane wire. `T`, optional 3 fraction digits, `Z`.
 * - `utc_ns`: campaign observations. `T`, optional 1-9 fraction digits, `Z`.
 * - `canonical_utc`: exactly the `Date#toISOString()` shape, `YYYY-MM-DDTHH:mm:ss.sssZ`.
 *
 * The calendar check refuses instants that cannot exist: day 0 or past the
 * month's end, month 0 or 13, hour 24, minute or second 60, and offsets above 23:59.
 */
export type TimestampProfile = "record" | "rfc3339" | "utc_ms" | "utc_ns" | "canonical_utc";

interface Grammar {
  readonly separators: string;
  readonly fractionRequired: boolean;
  readonly fractionMin: number;
  readonly fractionMax: number;
  readonly offsets: boolean;
  readonly minimumYear: number;
}

const GRAMMARS: Readonly<Record<TimestampProfile, Grammar>> = {
  record: { separators: "T ", fractionRequired: false, fractionMin: 1, fractionMax: 9, offsets: true, minimumYear: 1 },
  rfc3339: { separators: "T", fractionRequired: false, fractionMin: 1, fractionMax: Number.POSITIVE_INFINITY, offsets: true, minimumYear: 0 },
  utc_ms: { separators: "T", fractionRequired: false, fractionMin: 3, fractionMax: 3, offsets: false, minimumYear: 0 },
  utc_ns: { separators: "T", fractionRequired: false, fractionMin: 1, fractionMax: 9, offsets: false, minimumYear: 0 },
  canonical_utc: { separators: "T", fractionRequired: true, fractionMin: 3, fractionMax: 3, offsets: false, minimumYear: 0 },
};

interface Instant {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
  readonly fraction: string;
  /** Minutes east of UTC. */
  readonly offset: number;
}

function isDigit(code: number): boolean {
  return code >= 0x30 && code <= 0x39;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28;
  return month === 4 || month === 6 || month === 9 || month === 11 ? 30 : 31;
}

/** Tokenise `value` under `grammar`; undefined when the grammar or the calendar refuses it. */
function parse(value: string, grammar: Grammar): Instant | undefined {
  let index = 0;
  const digits = (count: number): number | undefined => {
    let result = 0;
    for (let end = index + count; index < end; index += 1) {
      const code = value.charCodeAt(index);
      if (!isDigit(code)) return undefined;
      result = result * 10 + (code - 0x30);
    }
    return result;
  };
  const literal = (accepted: string): boolean => {
    const character = value[index];
    if (character === undefined || !accepted.includes(character)) return false;
    index += 1;
    return true;
  };

  const year = digits(4);
  if (year === undefined || !literal("-")) return undefined;
  const month = digits(2);
  if (month === undefined || !literal("-")) return undefined;
  const day = digits(2);
  if (day === undefined || !literal(grammar.separators)) return undefined;
  const hour = digits(2);
  if (hour === undefined || !literal(":")) return undefined;
  const minute = digits(2);
  if (minute === undefined || !literal(":")) return undefined;
  const second = digits(2);
  if (second === undefined) return undefined;

  let fraction = "";
  if (value[index] === ".") {
    const start = index + 1;
    index = start;
    while (index < value.length && isDigit(value.charCodeAt(index))) index += 1;
    fraction = value.slice(start, index);
    if (fraction.length < grammar.fractionMin || fraction.length > grammar.fractionMax) return undefined;
  } else if (grammar.fractionRequired) {
    return undefined;
  }

  let offset = 0;
  const sign = value[index];
  if (sign === "Z") {
    index += 1;
  } else if (grammar.offsets && (sign === "+" || sign === "-")) {
    index += 1;
    const offsetHour = digits(2);
    if (offsetHour === undefined) return undefined;
    if (value[index] === ":") index += 1;
    const offsetMinute = digits(2);
    if (offsetMinute === undefined || offsetHour > 23 || offsetMinute > 59) return undefined;
    offset = (sign === "+" ? 1 : -1) * (offsetHour * 60 + offsetMinute);
  } else {
    return undefined;
  }
  if (index !== value.length) return undefined;

  if (year < grammar.minimumYear || month < 1 || month > 12) return undefined;
  if (day < 1 || day > daysInMonth(year, month)) return undefined;
  if (hour > 23 || minute > 59 || second > 59) return undefined;
  return { year, month, day, hour, minute, second, fraction, offset };
}

/** Whether `value` is a timestamp that `profile` accepts and that names a real calendar instant. */
export function isTimestamp(value: unknown, profile: TimestampProfile): value is string {
  return typeof value === "string" && parse(value, GRAMMARS[profile]) !== undefined;
}

/**
 * Epoch milliseconds of an accepted timestamp, or undefined. Fraction digits past
 * the third are truncated, as the ECMAScript date parser does.
 */
export function timestampMillis(value: unknown, profile: TimestampProfile): number | undefined {
  if (typeof value !== "string") return undefined;
  const instant = parse(value, GRAMMARS[profile]);
  if (instant === undefined) return undefined;
  const date = new Date(0);
  date.setUTCFullYear(instant.year, instant.month - 1, instant.day);
  date.setUTCHours(instant.hour, instant.minute, instant.second, Number(instant.fraction.slice(0, 3).padEnd(3, "0")));
  return date.getTime() - instant.offset * 60_000;
}

/**
 * `date.toISOString()`. With a label, an invalid Date throws
 * `${label} returned an invalid date`; without one, it throws as toISOString does.
 */
export function formatTimestamp(date: Date, label?: string): string {
  if (label !== undefined && !Number.isFinite(date.getTime())) throw new Error(`${label} returned an invalid date`);
  return date.toISOString();
}
