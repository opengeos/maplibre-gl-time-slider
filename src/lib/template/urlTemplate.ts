import type { UrlInput } from '../core/types';
import { formatDate } from './dateFormat';

/**
 * Date tokens recognized inside `{...}` placeholders.
 */
const DATE_TOKEN_RE = /^(YYYY|YY|MMMM|MMM|MM|M|DD|D|HH|H|mm|m|ss|s)$/;

/**
 * Expands date tokens in a template string for a given date.
 *
 * Recognized placeholders:
 * - `{YYYY}`, `{MM}`, `{DD}`, `{HH}`, ... — individual date tokens
 * - `{date:FORMAT}` — an arbitrary {@link formatDate} format, e.g. `{date:YYYY-MM-DD}`
 *
 * Unknown placeholders (such as `{z}`, `{x}`, `{y}` used by XYZ tile URLs) are
 * left untouched so the result remains a valid tile template.
 *
 * @param template - The template string
 * @param date - The date to substitute
 * @returns The expanded string
 *
 * @example
 * ```typescript
 * expandTokens('https://x/{YYYY}/{MM}/{z}/{x}/{y}.png', new Date('2024-04-18T00:00:00Z'));
 * // 'https://x/2024/04/{z}/{x}/{y}.png'
 * ```
 */
export function expandTokens(template: string, date: Date): string {
  return template.replace(/\{([^}]+)\}/g, (match, token: string) => {
    if (token.startsWith('date:')) {
      return formatDate(date, token.slice('date:'.length));
    }
    if (DATE_TOKEN_RE.test(token)) {
      return formatDate(date, token);
    }
    // Unknown placeholder (e.g. {z}/{x}/{y}) — leave intact.
    return match;
  });
}

/**
 * Resolves a {@link UrlInput} to a concrete URL for a date. String templates are
 * token-expanded synchronously; resolver functions are invoked and may return a
 * string or a promise. The union return type lets adapters take a synchronous
 * fast path for the common string case (so layers render without a microtask
 * delay).
 *
 * @param input - A template string or resolver function
 * @param date - The date to resolve for
 * @returns The final URL, or a promise resolving to it
 */
export function resolveUrl(input: UrlInput, date: Date): string | Promise<string> {
  if (typeof input === 'function') {
    return input(date);
  }
  return expandTokens(input, date);
}
