import { describe, it, expect, vi, afterEach } from 'vitest';
import { detectDateListFormat, fetchDateList, isDateListUrl, parseDateList } from './dateSource';

const days = (dates: Date[]) => dates.map((d) => d.toISOString().slice(0, 10));

/** Stubs `fetch` with one canned response. */
function stubFetch(body: string, { ok = true, status = 200, contentType = '' } = {}): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok,
      status,
      headers: { get: () => contentType || null },
      text: async () => body,
    }))
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parseDateList: JSON', () => {
  it('reads a bare array of dates', () => {
    expect(parseDateList('["2023-01-28", "2023-02-20"]', 'json')).toEqual([
      '2023-01-28',
      '2023-02-20',
    ]);
  });

  it('reads a date field out of an array of records', () => {
    const text = JSON.stringify([
      { id: 'a', date: '2023-01-28', clouds: 3 },
      { id: 'b', date: '2023-02-20', clouds: 0 },
    ]);
    expect(parseDateList(text, 'json')).toEqual(['2023-01-28', '2023-02-20']);
  });

  it('matches the date field case-insensitively', () => {
    expect(parseDateList('[{"Date": "2023-01-28"}]', 'json')).toEqual(['2023-01-28']);
  });

  it('unwraps an object that holds the list under a named key', () => {
    expect(parseDateList('{"dates": ["2023-01-28"]}', 'json')).toEqual(['2023-01-28']);
  });

  it('reads a STAC / GeoJSON FeatureCollection', () => {
    const text = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { datetime: '2023-01-28T18:53:14Z' } },
        { type: 'Feature', properties: { datetime: '2023-02-20T18:12:01Z' } },
      ],
    });
    expect(parseDateList(text, 'json')).toEqual(['2023-01-28T18:53:14Z', '2023-02-20T18:12:01Z']);
  });

  it('falls back to an unrecognized wrapper first array', () => {
    expect(parseDateList('{"whatever": ["2023-01-28"]}', 'json')).toEqual(['2023-01-28']);
  });

  it('falls back to text parsing when the body is not valid JSON', () => {
    expect(parseDateList('2023-01-28, 2023-02-20', 'json')).toEqual(['2023-01-28', '2023-02-20']);
  });

  it('skips records with no recognizable date field', () => {
    expect(parseDateList('[{"id": 1}, {"date": "2023-01-28"}]', 'json')).toEqual(['2023-01-28']);
  });
});

describe('parseDateList: CSV', () => {
  it('picks the named date column under a header row', () => {
    const text = 'scene_id,acquired,clouds\nEMIT_001,2023-01-28,3\nEMIT_002,2023-02-20,0';
    expect(parseDateList(text, 'csv')).toEqual(['2023-01-28', '2023-02-20']);
  });

  it('falls back to the first column when the header names no date field', () => {
    const text = 'when,clouds\n2023-01-28,3\n2023-02-20,0';
    expect(parseDateList(text, 'csv')).toEqual(['2023-01-28', '2023-02-20']);
  });

  it('reads from row one when there is no header', () => {
    expect(parseDateList('2023-01-28,3\n2023-02-20,0', 'csv')).toEqual([
      '2023-01-28',
      '2023-02-20',
    ]);
  });

  it('strips quotes and whitespace', () => {
    expect(parseDateList('date\n"2023-01-28" \n  \'2023-02-20\'', 'csv')).toEqual([
      '2023-01-28',
      '2023-02-20',
    ]);
  });
});

describe('parseDateList: text', () => {
  it('splits on newlines, commas, semicolons, and spaces', () => {
    expect(parseDateList('2023-01-28\n2023-02-20, 2023-03-27; 2023-05-27', 'text')).toEqual([
      '2023-01-28',
      '2023-02-20',
      '2023-03-27',
      '2023-05-27',
    ]);
  });

  it('ignores blank lines and trailing separators', () => {
    expect(parseDateList('\n2023-01-28,\n\n  \n2023-02-20\n', 'text')).toEqual([
      '2023-01-28',
      '2023-02-20',
    ]);
  });
});

describe('detectDateListFormat', () => {
  it('trusts a JSON body over a misleading extension', () => {
    expect(detectDateListFormat('https://x/dates.txt', 'text/plain', '["2023-01-28"]')).toBe(
      'json'
    );
  });

  it('uses the extension', () => {
    expect(detectDateListFormat('https://x/dates.csv', '', 'date\n2023-01-28')).toBe('csv');
  });

  it('uses the content type when the URL has no extension', () => {
    expect(detectDateListFormat('https://x/api/dates', 'application/json', '')).toBe('json');
  });

  it('treats multi-column text as CSV', () => {
    expect(detectDateListFormat('https://x/list', '', '2023-01-28,3\n2023-02-20,0')).toBe('csv');
  });

  it('treats a single-line comma list as text', () => {
    expect(detectDateListFormat('https://x/list', '', '2023-01-28, 2023-02-20')).toBe('text');
  });
});

describe('isDateListUrl', () => {
  it.each([
    'https://example.com/dates.json',
    'http://example.com/api/scenes',
    './data/dates.csv',
    '/data/dates.txt',
  ])('accepts %s', (value) => {
    expect(isDateListUrl(value)).toBe(true);
  });

  it.each([
    '2023-01-28, 2023-02-20',
    '2023-01-28',
    'https://example.com/a.json 2023-01-28',
    '',
    '   ',
  ])('rejects %s', (value) => {
    expect(isDateListUrl(value)).toBe(false);
  });
});

describe('fetchDateList', () => {
  it('fetches, parses, sorts, and de-duplicates', async () => {
    stubFetch('["2023-02-20", "2023-01-28", "2023-01-28"]', {
      contentType: 'application/json',
    });
    expect(days(await fetchDateList('https://example.com/dates.json'))).toEqual([
      '2023-01-28',
      '2023-02-20',
    ]);
  });

  it('throws on a non-OK response', async () => {
    stubFetch('nope', { ok: false, status: 404 });
    await expect(fetchDateList('https://example.com/missing.json')).rejects.toThrow(/404/);
  });

  it('throws when the document holds no dates', async () => {
    stubFetch('[]', { contentType: 'application/json' });
    await expect(fetchDateList('https://example.com/empty.json')).rejects.toThrow(/No dates/);
  });

  it('passes fetch options through', async () => {
    stubFetch('["2023-01-28"]');
    const init = { headers: { authorization: 'token' } };
    await fetchDateList('https://example.com/dates.json', init);
    expect(fetch).toHaveBeenCalledWith('https://example.com/dates.json', init);
  });
});
