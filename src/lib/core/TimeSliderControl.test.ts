import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TimeSliderControl } from './TimeSliderControl';
import type { TimeSliderOptions } from './types';
import { createStubMap } from '../../../tests/stubMap';

const BASE: TimeSliderOptions = {
  startDate: '2024-04-18T00:00:00Z',
  endDate: '2024-04-22T00:00:00Z',
  granularity: 'day',
};

function mount(opts: Partial<TimeSliderOptions> = {}) {
  const control = new TimeSliderControl({ ...BASE, ...opts });
  const stub = createStubMap();
  control.onAdd(stub.map);
  return { control, stub };
}

const iso = (d: Date) => d.toISOString();

describe('TimeSliderControl state', () => {
  it('snaps the initial date to a step', () => {
    const { control } = mount({ initialDate: '2024-04-20T18:00:00Z' });
    expect(iso(control.getCurrentDate())).toBe('2024-04-21T00:00:00.000Z');
  });

  it('goTo snaps, fires onChange, and emits events', () => {
    const onChange = vi.fn();
    const change = vi.fn();
    const { control } = mount({ onChange });
    control.on('change', change);

    control.goTo(new Date('2024-04-20T05:00:00Z'));
    expect(iso(control.getCurrentDate())).toBe('2024-04-20T00:00:00.000Z');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(iso(onChange.mock.calls[0][0])).toBe('2024-04-20T00:00:00.000Z');
    expect(change).toHaveBeenCalledTimes(1);
  });

  it('goTo is a no-op when the snapped date is unchanged', () => {
    const onChange = vi.fn();
    const { control } = mount({ onChange });
    control.goTo(control.getCurrentDate());
    expect(onChange).not.toHaveBeenCalled();
  });

  it('next and prev honor loop at the bounds', () => {
    const { control } = mount({ loop: true });
    control.prev(); // at start, wraps to end
    expect(iso(control.getCurrentDate())).toBe('2024-04-22T00:00:00.000Z');
    control.next(); // at end, wraps to start
    expect(iso(control.getCurrentDate())).toBe('2024-04-18T00:00:00.000Z');
  });

  it('next stops at the end when loop is disabled', () => {
    const { control } = mount({ loop: false, initialDate: '2024-04-22T00:00:00Z' });
    control.next();
    expect(iso(control.getCurrentDate())).toBe('2024-04-22T00:00:00.000Z');
  });

  it('derives the date format from granularity when none is set', () => {
    const control = new TimeSliderControl({
      startDate: '2024-01-01T00:00:00Z',
      endDate: '2024-12-31T00:00:00Z',
      granularity: 'hour',
    });
    expect(control.getDateFormat()).toContain('HH');
    control.setGranularity('year');
    expect(control.getDateFormat()).toBe('YYYY');
    control.setGranularity('month');
    expect(control.getDateFormat()).toBe('MMM YYYY');
  });

  it('uses an explicit dateFormat over the granularity default', () => {
    const control = new TimeSliderControl({ ...BASE, granularity: 'hour', dateFormat: 'YYYY' });
    expect(control.getDateFormat()).toBe('YYYY');
  });

  it('setGranularity resets interval and re-snaps', () => {
    const granchange = vi.fn();
    const { control } = mount({ interval: 2 });
    control.on('granularitychange', granchange);
    control.setGranularity('month');
    const state = control.getState();
    expect(state.granularity).toBe('month');
    expect(state.interval).toBe(1);
    expect(granchange).toHaveBeenCalledTimes(1);
  });

  it('fires onChange/change when setGranularity moves the current date', () => {
    const onChange = vi.fn();
    const change = vi.fn();
    const { control } = mount({
      startDate: '2024-01-15T00:00:00Z',
      endDate: '2024-06-15T00:00:00Z',
      granularity: 'day',
      onChange,
    });
    control.goTo(new Date('2024-01-20T00:00:00Z'));
    onChange.mockClear();
    control.on('change', change);
    control.setGranularity('month'); // re-snaps Jan 20 -> Jan 15 (nearest month step)
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(change).toHaveBeenCalledTimes(1);
  });

  it('fires onChange/change when setRange moves the current date', () => {
    const onChange = vi.fn();
    const { control } = mount({ onChange });
    control.setRange('2024-05-01T00:00:00Z', '2024-05-10T00:00:00Z');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].toISOString()).toBe('2024-05-01T00:00:00.000Z');
  });
});

describe('TimeSliderControl playback', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('advances on each tick and emits play/pause', () => {
    const { control } = mount({ speed: 1000, loop: false });
    const play = vi.fn();
    const pause = vi.fn();
    control.on('play', play);
    control.on('pause', pause);

    control.play();
    expect(control.getState().isPlaying).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(iso(control.getCurrentDate())).toBe('2024-04-19T00:00:00.000Z');
    vi.advanceTimersByTime(3000);
    expect(iso(control.getCurrentDate())).toBe('2024-04-22T00:00:00.000Z');
    // One more tick at the end pauses (loop disabled).
    vi.advanceTimersByTime(1000);
    expect(control.getState().isPlaying).toBe(false);
    expect(play).toHaveBeenCalledTimes(1);
    expect(pause).toHaveBeenCalledTimes(1);
  });

  it('loops back to the start at the end', () => {
    const { control } = mount({ speed: 1000, loop: true, initialDate: '2024-04-22T00:00:00Z' });
    control.play();
    vi.advanceTimersByTime(1000);
    expect(iso(control.getCurrentDate())).toBe('2024-04-18T00:00:00.000Z');
  });

  it('setSpeed restarts the timer with the new interval', () => {
    const { control } = mount({ speed: 1000 });
    control.play();
    control.setSpeed(500);
    expect(control.getState().speed).toBe(500);
    vi.advanceTimersByTime(500);
    expect(iso(control.getCurrentDate())).toBe('2024-04-19T00:00:00.000Z');
  });

  it('autoPlay starts playback once the control is added', () => {
    const { control } = mount({ autoPlay: true, speed: 1000 });
    expect(control.getState().isPlaying).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(iso(control.getCurrentDate())).toBe('2024-04-19T00:00:00.000Z');
    control.pause();
  });

  it('does not auto-play by default', () => {
    const { control } = mount();
    expect(control.getState().isPlaying).toBe(false);
  });
});

describe('TimeSliderControl sources', () => {
  it('adds a source, renders it, and dispatches date changes', () => {
    // An XYZ source renders synchronously (no availability probe), so the source
    // is added and re-tiled within the synchronous call. COG-specific rendering
    // and its per-date availability probe are covered in adapters.test.ts.
    const { control, stub } = mount({
      sources: [{ type: 'xyz', id: 'c', tiles: 'https://t/{z}/{x}/{y}.png?d={date:YYYY-MM-DD}' }],
    });
    expect(control.getSources()).toHaveLength(1);
    expect(stub.map.addSource).toHaveBeenCalled();

    control.goTo(new Date('2024-04-20T00:00:00Z'));
    expect(stub.sources.get('c')!.setTiles).toHaveBeenCalled();
  });

  it('removes a source', () => {
    const { control } = mount({
      sources: [{ type: 'xyz', id: 'x', tiles: 'https://t/{z}/{x}/{y}.png' }],
    });
    control.removeSource('x');
    expect(control.getSources()).toHaveLength(0);
  });

  it('setSourceOpacity updates the layer paint', () => {
    const { control, stub } = mount({
      sources: [{ type: 'xyz', id: 'x', tiles: 'https://t/{z}/{x}/{y}.png' }],
    });
    control.setSourceOpacity('x', 0.3);
    expect(stub.map.setPaintProperty).toHaveBeenCalledWith('x', 'raster-opacity', 0.3);
  });

  it('toggles source visibility via setSourceProperty', () => {
    const { control, stub } = mount({
      sources: [{ type: 'xyz', id: 'x', tiles: 'https://t/{z}/{x}/{y}.png' }],
    });
    control.setSourceProperty('x', { visible: false });
    expect(stub.map.setLayoutProperty).toHaveBeenCalledWith('x', 'visibility', 'none');
  });

  it('auto-plays when a layer is added live and autoPlay is enabled', () => {
    const { control } = mount();
    control.setAutoPlay(true);
    expect(control.getState().isPlaying).toBe(false);
    control.addSource({ type: 'xyz', id: 'x', tiles: 'https://t/{z}/{x}/{y}.png' });
    expect(control.getState().isPlaying).toBe(true);
    control.pause();
  });
});

describe('TimeSliderControl open-ended end date', () => {
  it('defaults an omitted end date to the current date (auto)', () => {
    const before = Date.now();
    const control = new TimeSliderControl({
      startDate: '2024-04-18T00:00:00Z',
      granularity: 'day',
    });
    const after = Date.now();
    const state = control.getState();
    expect(state.endDateAuto).toBe(true);
    expect(state.endDate.getTime()).toBeGreaterThanOrEqual(before);
    expect(state.endDate.getTime()).toBeLessThanOrEqual(after);
  });

  it('keeps an explicit end date fixed (not auto)', () => {
    const control = new TimeSliderControl({ ...BASE });
    expect(control.getState().endDateAuto).toBe(false);
    expect(iso(control.getState().endDate)).toBe('2024-04-22T00:00:00.000Z');
  });

  it('omits an auto end date from getConfig and re-resolves it on setConfig', () => {
    const control = new TimeSliderControl({
      startDate: '2024-04-18T00:00:00Z',
      granularity: 'day',
    });
    const config = control.getConfig();
    expect('endDate' in config).toBe(false);

    // A round-trip (simulating reopening a saved project later) re-resolves the
    // end to "now" rather than pinning it to the original save time.
    const before = Date.now();
    const fresh = new TimeSliderControl({ ...BASE });
    fresh.setConfig(config);
    const after = Date.now();
    expect(fresh.getState().endDateAuto).toBe(true);
    expect(fresh.getState().endDate.getTime()).toBeGreaterThanOrEqual(before);
    expect(fresh.getState().endDate.getTime()).toBeLessThanOrEqual(after);
  });

  it('serializes an explicit end date in getConfig', () => {
    const control = new TimeSliderControl({ ...BASE });
    expect(control.getConfig().endDate).toBe('2024-04-22T00:00:00.000Z');
  });

  it('setRange with a null end opens the range (auto = current date)', () => {
    const before = Date.now();
    const control = new TimeSliderControl({ ...BASE });
    expect(control.getState().endDateAuto).toBe(false);
    control.setRange('2024-05-01T00:00:00Z', null);
    const after = Date.now();
    const state = control.getState();
    expect(state.endDateAuto).toBe(true);
    expect(state.endDate.getTime()).toBeGreaterThanOrEqual(before);
    expect(state.endDate.getTime()).toBeLessThanOrEqual(after);
    expect('endDate' in control.getConfig()).toBe(false);
  });

  it('setRange with an explicit end closes the range again', () => {
    const control = new TimeSliderControl({
      startDate: '2024-04-18T00:00:00Z',
      granularity: 'day',
    });
    expect(control.getState().endDateAuto).toBe(true);
    control.setRange('2024-05-01T00:00:00Z', '2024-05-10T00:00:00Z');
    expect(control.getState().endDateAuto).toBe(false);
    expect(iso(control.getState().endDate)).toBe('2024-05-10T00:00:00.000Z');
  });
});

describe('TimeSliderControl config', () => {
  it('round-trips getConfig / setConfig', () => {
    const { control } = mount({
      sources: [{ type: 'xyz', id: 'x', tiles: 'https://t/{z}/{x}/{y}.png' }],
    });
    control.goTo(new Date('2024-04-20T00:00:00Z'));
    const config = control.getConfig();

    control.goTo(new Date('2024-04-18T00:00:00Z'));
    control.removeSource('x');
    expect(control.getSources()).toHaveLength(0);

    control.setConfig(config);
    expect(iso(control.getCurrentDate())).toBe('2024-04-20T00:00:00.000Z');
    expect(control.getSources()).toHaveLength(1);
  });

  it('serializes and restores control fields (theme, collapsed, granularities)', () => {
    const { control } = mount({ theme: 'dark', granularities: ['day', 'month'] });
    control.collapse();
    const config = control.getConfig();
    expect(config.theme).toBe('dark');
    expect(config.collapsed).toBe(true);
    expect(config.granularities).toEqual(['day', 'month']);

    const fresh = new TimeSliderControl({ ...BASE });
    const stub = createStubMap();
    fresh.onAdd(stub.map);
    fresh.setConfig(config);
    expect(fresh.getState().collapsed).toBe(true);
    expect(fresh.getConfig().theme).toBe('dark');
  });

  it('round-trips autoPlay through getConfig / setConfig', () => {
    const { control } = mount({ autoPlay: true });
    expect(control.getConfig().autoPlay).toBe(true);

    const fresh = new TimeSliderControl({ ...BASE });
    const stub = createStubMap();
    fresh.onAdd(stub.map);
    expect(fresh.getAutoPlay()).toBe(false);
    fresh.setConfig(control.getConfig());
    expect(fresh.getAutoPlay()).toBe(true);
    control.pause();
  });
});

describe('TimeSliderControl explicit dates', () => {
  // Sparse, irregular dates in the shape real archives take: a few scenes in
  // 2023, a gap of a year, then two more. A continuous daily timeline over the
  // same span would draw ~1,000 ticks, nearly all of them with no data.
  const DATES = ['2023-01-28', '2023-02-20', '2023-03-27', '2024-04-01', '2025-10-03'];
  const day = (date: Date) => date.toISOString().slice(0, 10);

  /** Mounts a control whose timeline is the explicit date list. */
  function mountDates(opts: Partial<TimeSliderOptions> = {}) {
    const control = new TimeSliderControl({ dates: DATES, granularity: 'day', ...opts });
    const stub = createStubMap();
    control.onAdd(stub.map);
    return { control, stub };
  }

  it('derives the range from the list and needs no startDate', () => {
    const { control } = mountDates();
    const state = control.getState();
    expect(day(state.startDate)).toBe('2023-01-28');
    expect(day(state.endDate)).toBe('2025-10-03');
    expect(state.dates?.map(day)).toEqual(DATES);
    expect(control.getState().endDateAuto).toBe(false);
  });

  it('throws when given neither a startDate nor dates', () => {
    expect(() => new TimeSliderControl({} as TimeSliderOptions)).toThrow(/startDate/);
    expect(() => new TimeSliderControl({ dates: [] } as TimeSliderOptions)).toThrow(/dates/);
  });

  it('snaps every navigation onto a date that has data', () => {
    const { control } = mountDates();
    // A date deep inside the year-long gap still lands on real data.
    control.goTo(new Date('2023-09-15T00:00:00Z'));
    expect(day(control.getCurrentDate())).toBe('2023-03-27');
  });

  it('steps between consecutive dates, skipping the empty span', () => {
    const { control } = mountDates({ initialDate: '2023-03-27' });
    control.next();
    expect(day(control.getCurrentDate())).toBe('2024-04-01');
    control.prev();
    expect(day(control.getCurrentDate())).toBe('2023-03-27');
  });

  it('plays through exactly the listed dates and loops', () => {
    vi.useFakeTimers();
    const seen: string[] = [];
    const { control } = mountDates({ speed: 100, loop: true, onChange: (d) => seen.push(day(d)) });
    control.play();
    // Five steps from the first date: four advances, then a wrap to the start.
    vi.advanceTimersByTime(500);
    control.pause();
    vi.useRealTimers();
    expect(seen).toEqual(['2023-02-20', '2023-03-27', '2024-04-01', '2025-10-03', '2023-01-28']);
  });

  it('treats startDate / endDate as clips on the list', () => {
    const { control } = mountDates({ startDate: '2023-03-01', endDate: '2024-12-31' });
    const state = control.getState();
    expect(state.dates?.map(day)).toEqual(['2023-03-27', '2024-04-01']);
    expect(day(state.startDate)).toBe('2023-03-27');
    expect(day(state.endDate)).toBe('2024-04-01');
    // The full list is retained, so a later widening can restore the dropped dates.
    expect(control.getDates()?.map(day)).toEqual(DATES);
  });

  it('re-clips the original list on setRange rather than eroding it', () => {
    const { control } = mountDates();
    control.setRange('2023-03-01', '2024-12-31');
    expect(control.getState().dates?.map(day)).toEqual(['2023-03-27', '2024-04-01']);
    // Widening again recovers everything, because the clip applies to the original.
    control.setRange('2000-01-01', '2030-01-01');
    expect(control.getState().dates?.map(day)).toEqual(DATES);
  });

  it('ignores a clip that would leave no dates at all', () => {
    const { control } = mountDates({ startDate: '2030-01-01', endDate: '2031-01-01' });
    expect(control.getState().dates?.map(day)).toEqual(DATES);
  });

  it('steps `interval` dates at a time', () => {
    const { control } = mountDates({ interval: 2 });
    control.next();
    expect(day(control.getCurrentDate())).toBe('2023-03-27');
  });

  it('applies a list added later with setDates and re-snaps the marker', () => {
    const control = new TimeSliderControl({
      startDate: '2023-01-01',
      endDate: '2025-12-31',
      granularity: 'day',
    });
    const stub = createStubMap();
    control.onAdd(stub.map);
    expect(control.getState().dates).toBeUndefined();

    control.goTo(new Date('2023-09-15T00:00:00Z'));
    control.setDates(DATES);
    expect(control.getState().dates?.map(day)).toEqual(DATES);
    // The marker was sitting on a date with no data; it moves to the nearest real one.
    expect(day(control.getCurrentDate())).toBe('2023-03-27');
    expect(day(control.getState().endDate)).toBe('2025-10-03');
  });

  it('drops back to a continuous timeline over the same span when cleared', () => {
    const { control } = mountDates();
    control.setDates(null);
    const state = control.getState();
    expect(state.dates).toBeUndefined();
    expect(day(state.startDate)).toBe('2023-01-28');
    expect(day(state.endDate)).toBe('2025-10-03');
    // Continuous again: stepping advances a single day.
    control.goTo(new Date('2023-01-28T00:00:00Z'));
    control.next();
    expect(day(control.getCurrentDate())).toBe('2023-01-29');
  });

  it('collapses catalog timestamps that share a granularity unit into one step', () => {
    // A STAC search reports one feature per tile, so a single overpass arrives
    // as several timestamps seconds apart. At day granularity that is one step,
    // not a run of identical-looking ticks.
    const { control } = mountDates({
      dates: [
        '2023-02-18T16:12:31Z',
        '2023-02-18T16:12:35Z',
        '2023-02-18T16:12:39Z',
        '2023-02-20T16:22:11Z',
      ],
    });
    expect(control.getDates()?.map(day)).toEqual(['2023-02-18', '2023-02-20']);
    // The surviving entry keeps its exact time, so a URL template embedding the
    // full timestamp still resolves.
    expect(control.getDates()?.[0].toISOString()).toBe('2023-02-18T16:12:31.000Z');
  });

  it('keeps sub-day steps at hour granularity', () => {
    const { control } = mountDates({
      granularity: 'hour',
      dates: ['2023-02-18T16:12:31Z', '2023-02-18T18:40:00Z'],
    });
    expect(control.getDates()).toHaveLength(2);
  });

  it('loadDates fetches a list from a URL and applies it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        text: async () => JSON.stringify(DATES),
      }))
    );
    const control = new TimeSliderControl({ startDate: '2020-01-01', endDate: '2026-01-01' });
    const stub = createStubMap();
    control.onAdd(stub.map);

    await control.loadDates('https://example.com/scenes.json');
    expect(control.getDates()?.map(day)).toEqual(DATES);
    expect(control.getDatesUrl()).toBe('https://example.com/scenes.json');
    expect(control.getState().dates?.map(day)).toEqual(DATES);
    // Serialized alongside the resolved dates, so restoring never refetches.
    const config = control.getConfig();
    expect(config.datesUrl).toBe('https://example.com/scenes.json');
    expect(config.dates).toHaveLength(DATES.length);
    vi.unstubAllGlobals();
  });

  it('loadDates leaves the timeline untouched when the fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 404,
        headers: { get: () => null },
        text: async () => '',
      }))
    );
    const { control } = mountDates();
    await expect(control.loadDates('https://example.com/missing.json')).rejects.toThrow(/404/);
    // The working list survives a failed load.
    expect(control.getDates()?.map(day)).toEqual(DATES);
    expect(control.getDatesUrl()).toBeUndefined();
    vi.unstubAllGlobals();
  });

  it('setDates supersedes a URL the list was loaded from', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: { get: () => 'text/plain' },
        text: async () => DATES.join('\n'),
      }))
    );
    const { control } = mountDates();
    await control.loadDates('https://example.com/scenes.txt');
    expect(control.getDatesUrl()).toBe('https://example.com/scenes.txt');
    control.setDates(['2024-01-01']);
    expect(control.getDatesUrl()).toBeUndefined();
    expect(control.getConfig().datesUrl).toBeUndefined();
    vi.unstubAllGlobals();
  });

  it('keeps an already-open end open when clearing a list that was never set', () => {
    const control = new TimeSliderControl({ startDate: '2023-01-01' });
    const stub = createStubMap();
    control.onAdd(stub.map);
    expect(control.getState().endDateAuto).toBe(true);
    // A no-op clear (e.g. an add-form example that declares no dates) must not
    // pin the open end to today.
    control.setDates(null);
    expect(control.getState().endDateAuto).toBe(true);
    expect(control.getConfig().endDate).toBeUndefined();
  });

  it('round-trips the list through getConfig / setConfig with clips intact', () => {
    const { control } = mountDates({ startDate: '2023-03-01' });
    control.goTo(new Date('2024-04-01T00:00:00Z'));
    const config = control.getConfig();
    // Saved unclipped, so restoring can re-apply (or widen) the clip.
    expect(config.dates).toHaveLength(DATES.length);

    const fresh = new TimeSliderControl({ startDate: '2020-01-01' });
    const stub = createStubMap();
    fresh.onAdd(stub.map);
    fresh.setConfig(config);
    expect(fresh.getState().dates?.map(day)).toEqual(['2023-03-27', '2024-04-01', '2025-10-03']);
    expect(day(fresh.getCurrentDate())).toBe('2024-04-01');
    expect(fresh.getDates()?.map(day)).toEqual(DATES);
  });

  it('omits dates from the config for a continuous timeline', () => {
    const { control } = mount();
    expect(control.getConfig().dates).toBeUndefined();
  });

  it('hides the granularity pills, which cannot change an ordinal step size', () => {
    const { control, stub } = mountDates();
    const pills = stub.container.querySelector('.ts-pills') as HTMLElement;
    expect(pills.style.display).toBe('none');
    control.setDates(null);
    expect(pills.style.display).toBe('');
  });

  it('renders one axis tick per date instead of one per day', () => {
    const { stub } = mountDates();
    // The same span at day granularity would be ~1,000 ticks.
    expect(stub.container.querySelectorAll('.ts-tick')).toHaveLength(DATES.length);
    expect(
      [...stub.container.querySelectorAll('.ts-tick-label')].map((el) => el.textContent)
    ).toEqual(['2023 Jan 28', 'Feb 20', 'Mar 27', '2024 Apr 01', '2025 Oct 03']);
  });
});

describe('TimeSliderControl appearance', () => {
  it('setTheme updates the option and toggles dock theme classes live', () => {
    const { control, stub } = mount({ theme: 'auto' });
    const dock = stub.container.querySelector('.maplibregl-time-slider-dock') as HTMLElement;

    control.setTheme('dark');
    expect(control.getTheme()).toBe('dark');
    expect(dock.classList.contains('ts-theme-dark')).toBe(true);
    expect(dock.classList.contains('ts-theme-light')).toBe(false);

    control.setTheme('light');
    expect(dock.classList.contains('ts-theme-light')).toBe(true);
    expect(dock.classList.contains('ts-theme-dark')).toBe(false);

    control.setTheme('auto');
    expect(dock.classList.contains('ts-theme-light')).toBe(false);
    expect(dock.classList.contains('ts-theme-dark')).toBe(false);
  });

  it('setDateFormat overrides the granularity-derived default and resets to it', () => {
    const { control } = mount({ granularity: 'day' });
    expect(control.getDateFormat()).toBe('YYYY MMM DD');

    control.setDateFormat('YYYY-MM-DD');
    expect(control.getDateFormat()).toBe('YYYY-MM-DD');

    control.setDateFormat(undefined);
    expect(control.getDateFormat()).toBe('YYYY MMM DD');
  });

  it('setAutoPlay updates the stored preference without changing playback', () => {
    const { control } = mount();
    expect(control.getAutoPlay()).toBe(false);
    control.setAutoPlay(true);
    expect(control.getAutoPlay()).toBe(true);
    expect(control.getState().isPlaying).toBe(false);
  });

  it('setGranularities updates the offered set in canonical order', () => {
    const { control, stub } = mount({ granularities: ['hour', 'day', 'month', 'year'] });
    control.setGranularities(['year', 'day']);
    expect(control.getGranularities()).toEqual(['day', 'year']);
    const pills = stub.container.querySelectorAll('.ts-pill');
    expect(pills).toHaveLength(2);
  });

  it('setGranularities switches the active granularity when it is dropped', () => {
    const { control } = mount({ granularity: 'hour', granularities: ['hour', 'day'] });
    expect(control.getState().granularity).toBe('hour');
    control.setGranularities(['month', 'year']);
    expect(control.getState().granularity).toBe('month');
  });

  it('setGranularities ignores an empty set', () => {
    const { control } = mount({ granularities: ['day', 'month'] });
    control.setGranularities([]);
    expect(control.getGranularities()).toEqual(['day', 'month']);
  });
});

describe('TimeSliderControl DOM', () => {
  it('builds the dock with the three clusters', () => {
    const { stub } = mount();
    const dock = stub.container.querySelector('.maplibregl-time-slider-dock');
    expect(dock).not.toBeNull();
    expect(dock!.querySelector('.ts-left')).not.toBeNull();
    expect(dock!.querySelector('.ts-axis')).not.toBeNull();
    expect(dock!.querySelector('.ts-right')).not.toBeNull();
    expect(dock!.querySelectorAll('.ts-pill')).toHaveLength(4);
  });

  it('toggles playback from the play button', () => {
    const { control, stub } = mount();
    const playBtn = stub.container.querySelector('.ts-play') as HTMLButtonElement;
    playBtn.click();
    expect(control.getState().isPlaying).toBe(true);
    playBtn.click();
    expect(control.getState().isPlaying).toBe(false);
    control.pause();
  });

  it('changes granularity from a pill', () => {
    const { control, stub } = mount();
    const yearPill = stub.container.querySelector(
      '.ts-pill[data-granularity="year"]'
    ) as HTMLButtonElement;
    yearPill.click();
    expect(control.getState().granularity).toBe('year');
  });

  it('applies a theme class', () => {
    const { stub } = mount({ theme: 'dark' });
    expect(
      stub.container.querySelector('.maplibregl-time-slider-dock.ts-theme-dark')
    ).not.toBeNull();
  });
});

describe('TimeSliderControl collapse', () => {
  it('starts expanded with the toggle button hidden', () => {
    const { control } = mount();
    expect(control.getState().collapsed).toBe(false);
    expect(control.getContainer()!.style.display).toBe('none');
  });

  it('toggle collapses and expands the dock', () => {
    const { control, stub } = mount();
    const collapse = vi.fn();
    const expand = vi.fn();
    control.on('collapse', collapse);
    control.on('expand', expand);

    control.toggle();
    expect(control.getState().collapsed).toBe(true);
    expect(
      stub.container.querySelector('.maplibregl-time-slider-dock.ts-collapsed')
    ).not.toBeNull();
    expect(control.getContainer()!.style.display).toBe('');
    expect(collapse).toHaveBeenCalledTimes(1);

    control.toggle();
    expect(control.getState().collapsed).toBe(false);
    expect(control.getContainer()!.style.display).toBe('none');
    expect(expand).toHaveBeenCalledTimes(1);
  });

  it('collapses from the hide button on the dock', () => {
    const { control, stub } = mount();
    (stub.container.querySelector('.ts-collapse-btn') as HTMLButtonElement).click();
    expect(control.getState().collapsed).toBe(true);
  });

  it('respects collapsed: true', () => {
    const { control } = mount({ collapsed: true });
    expect(control.getState().collapsed).toBe(true);
    expect(control.getContainer()!.style.display).toBe('');
  });

  it('hides the toggle button when collapsible is false', () => {
    const { control } = mount({ collapsible: false });
    expect(control.getContainer()!.style.display).toBe('none');
  });
});

describe('TimeSliderControl reserve-space layout', () => {
  it('wraps the map container and docks the timeline below it', () => {
    const stub = createStubMap();
    document.body.appendChild(stub.container);
    const control = new TimeSliderControl(BASE);
    control.onAdd(stub.map);

    const wrapper = stub.container.parentElement!;
    expect(wrapper.classList.contains('maplibregl-time-slider-layout')).toBe(true);
    const dock = wrapper.querySelector('.maplibregl-time-slider-dock.ts-docked');
    expect(dock).not.toBeNull();
    expect(dock!.parentElement).toBe(wrapper);
    expect(stub.map.resize).toHaveBeenCalled();

    control.onRemove();
    expect(stub.container.parentElement).toBe(document.body);
    expect(document.querySelector('.maplibregl-time-slider-layout')).toBeNull();

    stub.container.remove();
  });

  it('resizes the map when toggling collapse in reserve layout', () => {
    const stub = createStubMap();
    document.body.appendChild(stub.container);
    const control = new TimeSliderControl(BASE);
    control.onAdd(stub.map);
    (stub.map.resize as ReturnType<typeof vi.fn>).mockClear();

    control.collapse();
    expect(stub.map.resize).toHaveBeenCalledTimes(1);
    control.expand();
    expect(stub.map.resize).toHaveBeenCalledTimes(2);

    control.onRemove();
    stub.container.remove();
  });
});
