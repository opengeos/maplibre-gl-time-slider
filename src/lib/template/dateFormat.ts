/**
 * Full English month names, indexed 0-11.
 */
const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/**
 * Abbreviated English month names, indexed 0-11.
 */
const MONTHS_SHORT = MONTHS_LONG.map((m) => m.slice(0, 3));

/**
 * Supported tokens, ordered longest-first so the matcher is greedy.
 */
const TOKEN_RE = /YYYY|YY|MMMM|MMM|MM|M|DD|D|HH|H|mm|m|ss|s/g;

/**
 * Left-pads a number with zeros to the given width.
 *
 * @param value - The number to pad
 * @param width - Target string width
 * @returns The zero-padded string
 */
function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0');
}

/**
 * Returns the rendered value for a single format token, using UTC fields.
 *
 * @param date - The date to read
 * @param token - One of the supported tokens
 * @returns The token's string value
 */
function tokenValue(date: Date, token: string): string {
  switch (token) {
    case 'YYYY':
      return pad(date.getUTCFullYear(), 4);
    case 'YY':
      return pad(date.getUTCFullYear() % 100);
    case 'MMMM':
      return MONTHS_LONG[date.getUTCMonth()];
    case 'MMM':
      return MONTHS_SHORT[date.getUTCMonth()];
    case 'MM':
      return pad(date.getUTCMonth() + 1);
    case 'M':
      return String(date.getUTCMonth() + 1);
    case 'DD':
      return pad(date.getUTCDate());
    case 'D':
      return String(date.getUTCDate());
    case 'HH':
      return pad(date.getUTCHours());
    case 'H':
      return String(date.getUTCHours());
    case 'mm':
      return pad(date.getUTCMinutes());
    case 'm':
      return String(date.getUTCMinutes());
    case 'ss':
      return pad(date.getUTCSeconds());
    case 's':
      return String(date.getUTCSeconds());
    default:
      return token;
  }
}

/**
 * Formats a date using a token string. Tokens are resolved in UTC so output is
 * independent of the host timezone.
 *
 * Supported tokens: `YYYY`, `YY`, `MMMM`, `MMM`, `MM`, `M`, `DD`, `D`, `HH`,
 * `H`, `mm`, `m`, `ss`, `s`. Any other characters are emitted verbatim.
 *
 * @param date - The date to format
 * @param format - The token string (e.g. `'YYYY-MM-DD'`)
 * @returns The formatted date string
 *
 * @example
 * ```typescript
 * formatDate(new Date('2024-04-18T00:00:00Z'), 'YYYY MMM DD'); // '2024 Apr 18'
 * ```
 */
export function formatDate(date: Date, format: string): string {
  return format.replace(TOKEN_RE, (token) => tokenValue(date, token));
}
