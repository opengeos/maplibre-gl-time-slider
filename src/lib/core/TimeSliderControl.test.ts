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
});

describe('TimeSliderControl sources', () => {
  it('adds a source, renders it, and dispatches date changes', () => {
    const { control, stub } = mount({
      sources: [{ type: 'cog', id: 'c', url: 'https://e/{date:YYYY-MM-DD}.tif' }],
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
