import { normalizeDates } from './dateList';

/**
 * Property names searched, case-insensitively, for a record's timestamp. Ordered
 * most-specific first so a STAC item's `datetime` wins over a generic `date`.
 */
const DATE_KEYS = ['datetime', 'date', 'time', 'timestamp', 'start_datetime', 'acquired', 'dt'];

/**
 * Property names searched for the *array* of dates inside a wrapper object.
 */
const LIST_KEYS = ['dates', 'datetimes', 'times', 'timestamps', 'values', 'items', 'features'];

/**
 * A raw, not-yet-parsed date as it appeared in the source document.
 */
type RawDate = string | number;

/**
 * The document shapes a date list can arrive in.
 */
export type DateListFormat = 'json' | 'csv' | 'text';

/**
 * How long {@link fetchDateList} waits before giving up, when the caller
 * supplies no `AbortSignal` of its own.
 */
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Case-insensitive lookup of the first present key.
 *
 * @param record - The object to search
 * @param keys - Candidate key names, in priority order
 * @returns The first string/number value found, or undefined
 */
function pick(record: Record<string, unknown>, keys: string[]): unknown {
  const lower = new Map(Object.keys(record).map((key) => [key.toLowerCase(), key]));
  for (const key of keys) {
    const actual = lower.get(key);
    if (actual !== undefined) return record[actual];
  }
  return undefined;
}

/**
 * Extracts the timestamp from one record. Handles both flat objects
 * (`{ date: ... }`) and GeoJSON/STAC features, whose timestamp sits under
 * `properties`.
 *
 * @param record - A record from the source document
 * @returns The timestamp value, or undefined when the record has none
 */
function dateOf(record: Record<string, unknown>): RawDate | undefined {
  const props = record.properties;
  for (const source of [record, props]) {
    if (!source || typeof source !== 'object') continue;
    const value = pick(source as Record<string, unknown>, DATE_KEYS);
    if (typeof value === 'string' || typeof value === 'number') return value;
  }
  return undefined;
}

/**
 * Pulls dates out of a parsed JSON value. Accepts a bare array of dates, an
 * array of records (each contributing its own timestamp field), or a wrapper
 * object holding either — including a GeoJSON/STAC `FeatureCollection`.
 *
 * @param value - The parsed JSON
 * @param depth - Recursion guard for nested wrappers
 * @returns The raw dates found
 */
function fromJson(value: unknown, depth = 0): RawDate[] {
  if (depth > 3) return [];
  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        if (typeof entry === 'string' || typeof entry === 'number') return entry;
        if (entry && typeof entry === 'object') return dateOf(entry as Record<string, unknown>);
        return undefined;
      })
      .filter((entry): entry is RawDate => entry !== undefined);
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const named = pick(record, LIST_KEYS);
    if (named !== undefined) return fromJson(named, depth + 1);
    // Unrecognized wrapper: fall back to its first array-valued property.
    const firstArray = Object.values(record).find(Array.isArray);
    if (firstArray) return fromJson(firstArray, depth + 1);
  }
  return [];
}

/**
 * Splits one CSV row, trimming whitespace and stripping surrounding quotes.
 *
 * @param line - A single CSV line
 * @returns The row's cell values
 */
function splitRow(line: string): string[] {
  return line.split(',').map((cell) => cell.trim().replace(/^["']|["']$/g, ''));
}

/**
 * Pulls dates out of CSV text. A header row (one whose cells do not parse as
 * dates) selects the column: the first cell named like a date field, or column
 * zero. Without a header, column zero is read from the first row on.
 *
 * @param text - The CSV document
 * @returns The raw dates found
 */
function fromCsv(text: string): RawDate[] {
  const rows = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(splitRow);
  if (rows.length === 0) return [];

  const header = rows[0];
  const headerIsData = header.some((cell) => !Number.isNaN(new Date(cell).getTime()));
  let column = 0;
  let firstRow = 0;
  if (!headerIsData) {
    firstRow = 1;
    const named = header.findIndex((cell) => DATE_KEYS.includes(cell.toLowerCase()));
    column = named >= 0 ? named : 0;
  }
  return rows
    .slice(firstRow)
    .map((row) => row[column])
    .filter((cell): cell is string => Boolean(cell));
}

/**
 * Pulls dates out of plain text: one per line, or several per line separated by
 * commas, semicolons, or spaces.
 *
 * @param text - The text document
 * @returns The raw dates found
 */
function fromText(text: string): RawDate[] {
  return text
    .split(/[,;\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Picks the format of a fetched document from its URL, its `Content-Type`, and
 * finally the shape of the body itself.
 *
 * @param url - The source URL
 * @param contentType - The response's `Content-Type`, if any
 * @param text - The response body
 * @returns The detected format
 */
export function detectDateListFormat(
  url: string,
  contentType: string,
  text: string
): DateListFormat {
  const body = text.trimStart();
  // A JSON body is unmistakable, and outranks a misleading extension.
  if (body.startsWith('[') || body.startsWith('{')) return 'json';
  if (/\.json(\?|#|$)/i.test(url) || /json/i.test(contentType)) return 'json';
  if (/\.csv(\?|#|$)/i.test(url) || /csv/i.test(contentType)) return 'csv';
  // Multi-column text is CSV in all but name; a single column parses the same
  // either way, so only commas *and* line breaks together imply columns.
  if (/,/.test(text) && /\r?\n/.test(text.trim())) return 'csv';
  return 'text';
}

/**
 * Parses a document into the raw dates it contains.
 *
 * @param text - The document body
 * @param format - The document's format
 * @returns The raw dates, unnormalized
 */
export function parseDateList(text: string, format: DateListFormat): RawDate[] {
  if (format === 'json') {
    try {
      return fromJson(JSON.parse(text));
    } catch {
      // Not valid JSON after all; treat it as plain text rather than failing.
      return fromText(text);
    }
  }
  return format === 'csv' ? fromCsv(text) : fromText(text);
}

/**
 * Whether a field value looks like a link to a date list rather than the list
 * itself. Anything containing whitespace is a typed list, not a URL.
 *
 * @param value - The raw field value
 * @returns True when the value should be fetched
 */
export function isDateListUrl(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === '' || /\s/.test(trimmed)) return false;
  return /^https?:\/\//i.test(trimmed) || /^\.{0,2}\/[^\s]*\.(json|csv|txt)(\?|#|$)/i.test(trimmed);
}

/**
 * Fetches a date list from a URL and parses it into dates.
 *
 * Accepts JSON, CSV, or plain text, detected from the extension, the
 * `Content-Type`, and the body:
 *
 * - **JSON** — a bare array (`["2023-01-28", ...]`), an array of records with a
 *   `date` / `datetime` / `time` field, a wrapper object (`{ "dates": [...] }`),
 *   or a GeoJSON / STAC `FeatureCollection` (each feature's
 *   `properties.datetime`).
 * - **CSV** — a `date` / `datetime` column when there is a header row,
 *   otherwise the first column.
 * - **Text** — one date per line, or separated by commas, semicolons, or spaces.
 *
 * @param url - URL of the document listing the dates
 * @param init - Optional fetch options (headers, abort signal, credentials).
 *   Without a `signal`, the request times out after 30 seconds.
 * @returns The parsed dates, sorted and de-duplicated
 * @throws If the request fails, times out, or no dates can be parsed from it
 *
 * @example
 * ```typescript
 * const dates = await fetchDateList('https://example.com/scenes.json');
 * timeSlider.setDates(dates);
 * ```
 */
export async function fetchDateList(url: string, init?: RequestInit): Promise<Date[]> {
  // An unresponsive host would otherwise leave the caller (and the dock's
  // "Loading dates…" indicator) waiting forever. A caller-supplied signal wins.
  const signal = init?.signal ?? AbortSignal.timeout(DEFAULT_TIMEOUT_MS);
  const response = await fetch(url, { ...init, signal });
  if (!response.ok) {
    throw new Error(`Could not load dates: ${url} responded ${response.status}`);
  }
  const text = await response.text();
  const format = detectDateListFormat(url, response.headers.get('content-type') ?? '', text);
  const dates = normalizeDates(parseDateList(text, format));
  if (dates.length === 0) {
    throw new Error(`No dates found in ${url}`);
  }
  return dates;
}
