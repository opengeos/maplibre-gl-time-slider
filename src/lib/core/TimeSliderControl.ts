import type { IControl, Map as MapLibreMap } from 'maplibre-gl';
import type {
  Granularity,
  SourceSpec,
  TimeSliderConfig,
  TimeSliderEvent,
  TimeSliderEventHandler,
  TimeSliderOptions,
  TimeSliderState,
} from './types';
import { GRANULARITIES, toDate } from '../time/granularity';
import { clipDates, collapseByUnit, normalizeDates } from '../time/dateList';
import { fetchDateList } from '../time/dateSource';
import { createTimeScale, type TimeScale } from '../time/scale';
import { clamp } from '../utils/helpers';
import { createAdapter } from '../adapters/registry';
import type { SourceAdapter } from '../adapters/types';
import { createDockView } from '../ui/dock';
import type { DockController, DockView } from '../ui/types';

/**
 * Event handlers map type.
 */
type EventHandlersMap = globalThis.Map<TimeSliderEvent, Set<TimeSliderEventHandler>>;

/**
 * Resolved internal options (defaults applied).
 */
interface ResolvedOptions {
  granularities: Granularity[];
  dateFormat?: string;
  theme: 'auto' | 'light' | 'dark';
  className?: string;
  collapsible: boolean;
  autoPlay: boolean;
  beforeId?: string;
  sources: SourceSpec[];
  onChange?: (date: Date) => void;
}

/**
 * The range fields derived from the requested bounds and, for an ordinal
 * timeline, the stored date list.
 */
type RangeFields = Pick<TimeSliderState, 'startDate' | 'endDate' | 'endDateAuto' | 'dates'>;

/**
 * Resolves a timeline range. With an explicit date list the requested bounds
 * act as clips and the list's own first/last entries become the range, so the
 * timeline can never extend past the data. Without one, the bounds are the
 * range, and an absent end stays "open" (defaulted to now, re-resolved on load).
 *
 * @param allDates - The unclipped date list, or undefined for a continuous timeline
 * @param start - Requested range start (a clip when `allDates` is given)
 * @param end - Requested range end; `null`/`undefined` leaves it open
 * @returns The range fields to write into state
 */
function resolveRange(allDates?: Date[], start?: Date, end?: Date | null): RangeFields {
  if (allDates && allDates.length > 0) {
    const dates = clipDates(allDates, start, end ?? undefined);
    return {
      dates,
      startDate: new Date(dates[0].getTime()),
      endDate: new Date(dates[dates.length - 1].getTime()),
      // The list bounds the timeline, so there is no open end to re-resolve.
      endDateAuto: false,
    };
  }
  return {
    dates: undefined,
    startDate: start ?? new Date(),
    endDate: end == null ? new Date() : end,
    endDateAuto: end == null,
  };
}

/**
 * Turns caller-supplied dates into the canonical ordinal list: parsed, sorted,
 * de-duplicated, then collapsed so at most one step falls in each granularity
 * unit (see {@link collapseByUnit}).
 *
 * @param dates - Dates as supplied
 * @param granularity - The active granularity
 * @returns The canonical list, or undefined when nothing usable remains
 */
function ingestDates(
  dates: Array<Date | string | number>,
  granularity: Granularity
): Date[] | undefined {
  const list = collapseByUnit(normalizeDates(dates), granularity);
  return list.length > 0 ? list : undefined;
}

/**
 * A MapLibre GL control presenting a NASA-Worldview-style bottom-docked
 * timeline. Time is modeled as a continuous date range plus an interval; the
 * control manages map sources/layers for built-in data types (COG, XYZ/WMTS,
 * WMS-Time, GeoJSON) through adapters, and also exposes an `onChange` escape
 * hatch for custom wiring.
 *
 * @example
 * ```typescript
 * const slider = new TimeSliderControl({
 *   startDate: '2024-04-18',
 *   endDate: '2024-04-28',
 *   granularity: 'day',
 *   sources: [
 *     { type: 'cog', url: 'https://.../{date:YYYY-MM-DD}.tif', colormap: 'jet', rescale: [0, 1] },
 *   ],
 * });
 * map.addControl(slider, 'bottom-left');
 * ```
 */
export class TimeSliderControl implements IControl, DockController {
  private _map?: MapLibreMap;
  private _mapContainer?: HTMLElement;
  private _container?: HTMLElement;
  private _wrapper?: HTMLElement;
  private _resizeObserver?: ResizeObserver;
  private _savedContainerCss?: string;
  private _view?: DockView;
  private _state: TimeSliderState;
  private _scale: TimeScale;
  /** The full ordinal date list as supplied, before start/end clipping. Kept so
   * a later range change re-clips the original rather than eroding the list. */
  private _allDates?: Date[];
  /** URL the current date list was loaded from, when it came from one. Kept for
   * display and serialization; the resolved dates are what actually drive the
   * timeline, so a restored config never has to refetch. */
  private _datesUrl?: string;
  private _options: ResolvedOptions;
  private _adapters: SourceAdapter[] = [];
  private _eventHandlers: EventHandlersMap = new globalThis.Map();
  private _playbackInterval?: ReturnType<typeof setInterval>;
  /** Ids of sources reporting no data for the current date (drives the dock's
   * "no data" indicator). A source is added on a failed/absent load and removed
   * once it loads a date. */
  private _unavailableSources = new globalThis.Set<string>();

  /**
   * Creates a new TimeSliderControl.
   *
   * @param options - Configuration options
   */
  constructor(options: TimeSliderOptions) {
    const granularity = options.granularity ?? 'day';
    const dates = options.dates ? ingestDates(options.dates, granularity) : undefined;
    if (!dates?.length && options.startDate == null) {
      throw new TypeError(
        'TimeSliderControl requires either `startDate` or a non-empty `dates` list.'
      );
    }
    this._allDates = dates;
    // An omitted end date is "open": default it to now so the timeline always
    // reaches the latest data, and remember it was auto so getConfig() leaves it
    // out and a restored config re-resolves to the then-current date. With a
    // date list, start/end are only clips and the list sets the actual range.
    const range = resolveRange(
      this._allDates,
      options.startDate == null ? undefined : toDate(options.startDate),
      options.endDate == null ? null : toDate(options.endDate)
    );
    const interval = Math.max(1, Math.floor(options.interval ?? 1));
    const initial = options.initialDate ? toDate(options.initialDate) : range.startDate;

    this._state = {
      collapsed: options.collapsed ?? false,
      ...range,
      interval,
      granularity,
      currentDate: new Date(range.startDate.getTime()),
      isPlaying: false,
      speed: Math.max(100, options.speed ?? 1000),
      loop: options.loop ?? true,
    };
    this._scale = createTimeScale(this._state);
    this._state.currentDate = this._scale.snap(initial);

    this._options = {
      granularities: options.granularities ?? GRANULARITIES,
      dateFormat: options.dateFormat,
      theme: options.theme ?? 'auto',
      className: options.className,
      collapsible: options.collapsible ?? true,
      autoPlay: options.autoPlay ?? false,
      beforeId: options.beforeId,
      sources: options.sources ?? [],
      onChange: options.onChange,
    };
  }

  // ----- IControl ---------------------------------------------------------

  /**
   * Adds the control: builds the dock, appends it to the map container, and
   * creates the initial data layers.
   *
   * @param map - The MapLibre map
   * @returns An (empty) anchor element required by the control stack
   */
  onAdd(map: MapLibreMap): HTMLElement {
    this._map = map;
    this._mapContainer = map.getContainer();

    // The control-stack element is a corner toggle button (clock icon) that
    // shows/hides the dock. Hidden entirely when `collapsible` is false.
    this._container = document.createElement('div');
    this._container.className =
      'maplibregl-ctrl maplibregl-ctrl-group maplibregl-time-slider-toggle';
    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'maplibregl-time-slider-toggle-btn';
    toggleBtn.setAttribute('aria-label', 'Toggle time slider');
    toggleBtn.title = 'Toggle time slider';
    toggleBtn.innerHTML = `
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <polyline points="12 6 12 12 16 14"/>
      </svg>`;
    toggleBtn.addEventListener('click', () => this.toggle());
    this._container.appendChild(toggleBtn);
    if (!this._options.collapsible) {
      this._container.style.display = 'none';
    }

    this._view = createDockView(this, {
      theme: this._options.theme,
      className: this._options.className,
    });
    this._installLayout();

    for (const spec of this._options.sources) {
      this.addSource(spec);
    }

    this._applyCollapsed();
    this._syncAll();

    // Kick off playback once everything is wired up, when requested.
    if (this._options.autoPlay) {
      this.play();
    }
    return this._container;
  }

  /**
   * Removes the control, all managed layers, and the dock.
   */
  onRemove(): void {
    this.pause();
    for (const adapter of [...this._adapters]) {
      adapter.remove();
    }
    this._adapters = [];
    this._view?.destroy();
    this._uninstallLayout();
    this._view = undefined;
    this._container?.parentNode?.removeChild(this._container);
    this._map = undefined;
    this._mapContainer = undefined;
    this._container = undefined;
    this._eventHandlers.clear();
  }

  // ----- State accessors (DockController) ---------------------------------

  /**
   * Returns a copy of the current state with cloned dates.
   */
  getState(): TimeSliderState {
    return {
      ...this._state,
      currentDate: new Date(this._state.currentDate),
      startDate: new Date(this._state.startDate),
      endDate: new Date(this._state.endDate),
      dates: this._state.dates?.map((d) => new Date(d.getTime())),
    };
  }

  /**
   * Returns the scale mapping dates onto the axis — ordinal when an explicit
   * date list is active, continuous otherwise. Used by the axis renderer to
   * position the marker and generate ticks.
   */
  getScale(): TimeScale {
    return this._scale;
  }

  /**
   * Returns the explicit dates the timeline steps through (unclipped, as
   * supplied), or `undefined` for a continuous timeline.
   */
  getDates(): Date[] | undefined {
    return this._allDates?.map((d) => new Date(d.getTime()));
  }

  /**
   * Returns the URL the current date list was loaded from via
   * {@link loadDates}, or `undefined` when the list was supplied directly.
   */
  getDatesUrl(): string | undefined {
    return this._datesUrl;
  }

  /**
   * Rebuilds the scale from the current state. Must be called after any change
   * to the range, interval, granularity, or date list.
   */
  private _rebuildScale(): void {
    this._scale = createTimeScale(this._state);
  }

  /**
   * Returns the current date.
   */
  getCurrentDate(): Date {
    return new Date(this._state.currentDate);
  }

  /**
   * Returns the granularities offered as pills.
   */
  getGranularities(): Granularity[] {
    return [...this._options.granularities];
  }

  /**
   * Returns the date-display token format. When no explicit `dateFormat` was
   * provided, derives one from the active granularity (so an hourly timeline
   * shows the hour, a yearly one shows just the year, etc.).
   */
  getDateFormat(): string {
    return this._options.dateFormat ?? this._defaultDateFormat();
  }

  /**
   * Returns the active color theme.
   */
  getTheme(): 'auto' | 'light' | 'dark' {
    return this._options.theme;
  }

  /**
   * Returns whether playback starts automatically when the control is added.
   */
  getAutoPlay(): boolean {
    return this._options.autoPlay;
  }

  /**
   * Granularity-appropriate default date format.
   */
  private _defaultDateFormat(): string {
    switch (this._state.granularity) {
      case 'hour':
        return 'YYYY MMM DD HH:00';
      case 'day':
        return 'YYYY MMM DD';
      case 'month':
        return 'MMM YYYY';
      case 'year':
        return 'YYYY';
    }
  }

  // ----- Collapse / expand ------------------------------------------------

  /**
   * Collapses the dock (hides it, leaving the corner toggle visible).
   */
  collapse(): void {
    if (!this._state.collapsed) this.toggle();
  }

  /**
   * Expands the dock.
   */
  expand(): void {
    if (this._state.collapsed) this.toggle();
  }

  /**
   * Toggles the dock between collapsed and expanded.
   */
  toggle(): void {
    this._state.collapsed = !this._state.collapsed;
    this._applyCollapsed();
    this._emit(this._state.collapsed ? 'collapse' : 'expand');
    this._emit('statechange');
  }

  /**
   * Reflects the collapsed state in the DOM: shows/hides the dock and the corner
   * toggle button, then resizes the map so it reclaims/yields the dock row.
   */
  private _applyCollapsed(): void {
    const collapsed = this._state.collapsed;
    if (this._view) {
      this._view.root.classList.toggle('ts-collapsed', collapsed);
    }
    if (this._options.collapsible && this._container) {
      this._container.style.display = collapsed ? '' : 'none';
    }
    // In reserve-space layout the map must resize to fill/yield the dock row.
    if (this._wrapper) {
      this._map?.resize();
    }
  }

  /**
   * Installs the reserve-space layout: wraps the map container in a flex column
   * and places the dock below it, so the map shrinks rather than being overlaid.
   * Falls back to overlaying the dock when the container has no parent (e.g. a
   * detached container in tests).
   */
  private _installLayout(): void {
    const container = this._mapContainer;
    const dock = this._view?.root;
    if (!container || !dock) return;

    const parent = container.parentElement;
    if (!parent) {
      // Detached container: overlay the dock at the bottom.
      container.appendChild(dock);
      return;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'maplibregl-time-slider-layout';
    this._wrapper = wrapper;

    const cs = getComputedStyle(container);
    wrapper.style.display = 'flex';
    wrapper.style.flexDirection = 'column';
    wrapper.style.overflow = 'hidden';
    wrapper.style.position = cs.position === 'static' ? 'relative' : cs.position;
    for (const side of ['top', 'right', 'bottom', 'left'] as const) {
      const inline = container.style.getPropertyValue(side);
      const value = inline || (cs.position !== 'static' ? cs.getPropertyValue(side) : '');
      if (value && value !== 'auto') wrapper.style.setProperty(side, value);
    }
    wrapper.style.margin = cs.margin;
    wrapper.style.zIndex = cs.zIndex !== 'auto' ? cs.zIndex : '';
    wrapper.style.width = this._fillSize(container, 'width', cs.width);
    const height = this._fillSize(container, 'height', cs.height);
    wrapper.style.height = height;
    if (height === '100vh') {
      // Prefer the dynamic viewport height so the docked timeline is not hidden
      // behind the mobile browser's URL bar. Ignored (keeps 100vh) where `dvh`
      // is unsupported.
      wrapper.style.height = '100dvh';
    }

    parent.insertBefore(wrapper, container);

    // Demote the map container to a flex child that fills the space above the dock.
    this._savedContainerCss = container.getAttribute('style') ?? '';
    container.style.position = 'relative';
    container.style.top = '';
    container.style.right = '';
    container.style.bottom = '';
    container.style.left = '';
    container.style.margin = '0';
    container.style.width = '100%';
    container.style.height = 'auto';
    container.style.flex = '1 1 auto';
    container.style.minHeight = '0';

    wrapper.appendChild(container);
    dock.classList.add('ts-docked');
    wrapper.appendChild(dock);

    // Only the dimensions captured as a fixed pixel snapshot need active
    // tracking. Responsive values ('100%', '100vh'/'100dvh') already follow the
    // window through CSS, and re-pinning them to pixels would freeze them (and,
    // for a content-sized parent like a full-viewport `<body>`, leave a gap
    // below the dock when the window grows).
    this._trackParentSize(
      parent,
      wrapper.style.width.endsWith('px'),
      wrapper.style.height.endsWith('px')
    );
    this._map?.resize();
  }

  /**
   * Keeps the reserve-space wrapper matched to the box its parent allots it so
   * the docked timeline tracks the map size when the window resizes or a side
   * panel opens/closes. Only pixel-pinned dimensions are tracked: the initial
   * {@link _fillSize} snapshot goes stale inside a responsive (e.g. flex) parent,
   * whereas viewport/percentage values stay responsive on their own. A no-op
   * where `ResizeObserver` is unavailable or neither dimension is pinned.
   *
   * @param parent - The wrapper's parent element to track.
   * @param trackWidth - Whether the wrapper width was pinned to pixels.
   * @param trackHeight - Whether the wrapper height was pinned to pixels.
   */
  private _trackParentSize(parent: HTMLElement, trackWidth: boolean, trackHeight: boolean): void {
    const wrapper = this._wrapper;
    if (!wrapper || typeof ResizeObserver === 'undefined') return;
    if (!trackWidth && !trackHeight) return;
    this._resizeObserver = new ResizeObserver(() => {
      let changed = false;
      // Skip zero sizes (e.g. the parent is briefly display:none) so a hidden
      // panel cannot collapse the dock; the guard also prevents a feedback loop
      // with shrink-to-fit parents.
      if (trackWidth && parent.clientWidth > 0) {
        const width = `${parent.clientWidth}px`;
        if (wrapper.style.width !== width) {
          wrapper.style.width = width;
          changed = true;
        }
      }
      if (trackHeight && parent.clientHeight > 0) {
        const height = `${parent.clientHeight}px`;
        if (wrapper.style.height !== height) {
          wrapper.style.height = height;
          changed = true;
        }
      }
      if (changed) this._map?.resize();
    });
    this._resizeObserver.observe(parent);
  }

  /**
   * Restores the original DOM/styles undone by {@link _installLayout}.
   */
  private _uninstallLayout(): void {
    this._resizeObserver?.disconnect();
    this._resizeObserver = undefined;
    this._view?.root.classList.remove('ts-docked');
    if (this._wrapper && this._mapContainer) {
      const parent = this._wrapper.parentElement;
      this._mapContainer.setAttribute('style', this._savedContainerCss ?? '');
      parent?.insertBefore(this._mapContainer, this._wrapper);
      this._wrapper.remove();
      this._wrapper = undefined;
      this._map?.resize();
    }
  }

  /**
   * Picks a CSS size for the wrapper that preserves responsiveness where
   * possible: an inline value, a viewport unit when the container fills the
   * viewport, otherwise the computed pixel size.
   *
   * @param el - The map container
   * @param prop - 'width' or 'height'
   * @param computed - The computed pixel value (fallback)
   * @returns A CSS length string
   */
  private _fillSize(el: HTMLElement, prop: 'width' | 'height', computed: string): string {
    const inline = el.style.getPropertyValue(prop);
    if (inline) return inline;
    const rect = el.getBoundingClientRect();
    // Use '100%' for width (fills the content box without the vw scrollbar
    // gutter that otherwise triggers a spurious horizontal scrollbar).
    if (prop === 'width' && Math.abs(rect.width - window.innerWidth) <= 2) return '100%';
    if (prop === 'height' && Math.abs(rect.height - window.innerHeight) <= 2) return '100vh';
    return computed;
  }

  // ----- Navigation -------------------------------------------------------

  /**
   * Navigates to a date, snapping it to the nearest step. No-op if unchanged.
   *
   * @param date - The target date
   */
  goTo(date: Date): void {
    const s = this._state;
    const snapped = this._scale.snap(date);
    if (snapped.getTime() === s.currentDate.getTime()) return;
    s.currentDate = snapped;
    this._view?.syncDate();
    this._notifyDateChanged(snapped);
    this._emit('statechange');
  }

  /**
   * Advances one interval, wrapping to the start when looping at the end.
   */
  next(): void {
    const s = this._state;
    const candidate = this._scale.next(s.currentDate);
    if (candidate.getTime() === s.currentDate.getTime()) {
      if (s.loop) this.goTo(s.startDate);
    } else {
      this.goTo(candidate);
    }
  }

  /**
   * Rewinds one interval, wrapping to the end when looping at the start.
   */
  prev(): void {
    const s = this._state;
    const candidate = this._scale.prev(s.currentDate);
    if (candidate.getTime() === s.currentDate.getTime()) {
      if (s.loop) this.goTo(s.endDate);
    } else {
      this.goTo(candidate);
    }
  }

  // ----- Playback ---------------------------------------------------------

  /**
   * Starts playback.
   */
  play(): void {
    if (this._state.isPlaying) return;
    this._state.isPlaying = true;
    this._view?.syncPlayState();
    this._playbackInterval = setInterval(() => this._advance(), this._state.speed);
    this._emit('play');
    this._emit('statechange');
  }

  /**
   * Pauses playback.
   */
  pause(): void {
    if (!this._state.isPlaying) return;
    this._state.isPlaying = false;
    this._view?.syncPlayState();
    if (this._playbackInterval) {
      clearInterval(this._playbackInterval);
      this._playbackInterval = undefined;
    }
    this._emit('pause');
    this._emit('statechange');
  }

  /**
   * Toggles playback.
   */
  togglePlayback(): void {
    if (this._state.isPlaying) this.pause();
    else this.play();
  }

  /**
   * Advances one step during playback, pausing at the end when not looping.
   */
  private _advance(): void {
    const s = this._state;
    const candidate = this._scale.next(s.currentDate);
    if (candidate.getTime() === s.currentDate.getTime()) {
      if (s.loop) this.goTo(s.startDate);
      else this.pause();
    } else {
      this.goTo(candidate);
    }
  }

  /**
   * Sets playback speed in milliseconds per step (minimum 100). Restarts the
   * timer if currently playing.
   *
   * @param ms - Milliseconds per step
   */
  setSpeed(ms: number): void {
    this._state.speed = Math.max(100, ms);
    this._view?.syncControls();
    if (this._state.isPlaying) {
      clearInterval(this._playbackInterval);
      this._playbackInterval = setInterval(() => this._advance(), this._state.speed);
    }
    this._emit('statechange');
  }

  /**
   * Enables or disables looping.
   *
   * @param enabled - Whether to loop
   */
  setLoop(enabled: boolean): void {
    this._state.loop = enabled;
    this._view?.syncControls();
    this._emit('statechange');
  }

  /**
   * Enables or disables auto-play (whether playback starts when the control is
   * added). Updating this after the control is added affects future re-adds and
   * the serialized config; it does not start or stop the current playback.
   *
   * @param enabled - Whether to auto-play on add
   */
  setAutoPlay(enabled: boolean): void {
    this._options.autoPlay = enabled;
    this._emit('statechange');
  }

  // ----- Appearance -------------------------------------------------------

  /**
   * Sets the color theme and applies it to the dock live.
   *
   * @param theme - `'auto'` (system preference), `'light'`, or `'dark'`
   */
  setTheme(theme: 'auto' | 'light' | 'dark'): void {
    this._options.theme = theme;
    const root = this._view?.root;
    if (root) {
      root.classList.toggle('ts-theme-light', theme === 'light');
      root.classList.toggle('ts-theme-dark', theme === 'dark');
    }
    this._emit('statechange');
  }

  /**
   * Sets the token format for the current-date label, applying it live. Pass
   * `undefined` to fall back to the granularity-derived default.
   *
   * @param format - A date token format string, or `undefined` for the default
   */
  setDateFormat(format?: string): void {
    this._options.dateFormat = format;
    this._view?.syncRange();
    this._view?.syncDate();
    this._emit('statechange');
  }

  // ----- Range / granularity ----------------------------------------------

  /**
   * Changes the active granularity, resetting the interval to 1 and re-snapping
   * the current date. On an ordinal timeline the date list keeps setting the
   * step size, so this only changes the tick label and date-display formats.
   *
   * @param granularity - The new granularity
   */
  setGranularity(granularity: Granularity): void {
    const s = this._state;
    const prev = s.currentDate.getTime();
    s.granularity = granularity;
    s.interval = 1;
    this._rebuildScale();
    s.currentDate = this._scale.snap(s.currentDate);
    this._view?.syncGranularity();
    this._view?.syncDate();
    this._notifyDateChanged(s.currentDate, prev);
    this._emit('granularitychange');
    this._emit('statechange');
  }

  /**
   * Sets which granularities are offered as zoom pills, rebuilding them live.
   * The set is kept in canonical order (hour, day, month, year); empty input is
   * ignored. If the active granularity is dropped, it switches to the first
   * remaining one.
   *
   * @param granularities - The granularities to offer
   */
  setGranularities(granularities: Granularity[]): void {
    const ordered = GRANULARITIES.filter((g) => granularities.includes(g));
    if (ordered.length === 0) return;
    this._options.granularities = ordered;
    this._view?.syncGranularities();
    if (!ordered.includes(this._state.granularity)) {
      // setGranularity already emits granularitychange + statechange.
      this.setGranularity(ordered[0]);
      return;
    }
    this._emit('statechange');
  }

  /**
   * Updates the timeline range (and optionally interval/granularity),
   * re-snapping the current date.
   *
   * On an ordinal timeline the bounds clip the date list instead of defining
   * the range: the resulting range is the first/last date that survives the
   * clip, and a clip that would empty the list is ignored.
   *
   * @param start - New range start
   * @param end - New range end. Pass `null` (or omit) to leave the end "open":
   *   it defaults to the current date and is treated as auto, so it re-resolves
   *   to the then-current date when a persisted config is restored.
   * @param interval - Optional new interval
   * @param granularity - Optional new granularity
   */
  setRange(
    start: Date | string,
    end?: Date | string | null,
    interval?: number,
    granularity?: Granularity
  ): void {
    const s = this._state;
    const prev = s.currentDate.getTime();
    Object.assign(s, resolveRange(this._allDates, toDate(start), end == null ? null : toDate(end)));
    if (interval != null) s.interval = Math.max(1, Math.floor(interval));
    if (granularity != null) s.granularity = granularity;
    this._rebuildScale();
    s.currentDate = this._scale.snap(s.currentDate);
    this._view?.syncRange();
    this._view?.syncGranularity();
    this._view?.syncDate();
    this._notifyDateChanged(s.currentDate, prev);
    this._emit('rangechange');
    this._emit('statechange');
  }

  /**
   * Replaces the explicit dates the timeline steps through, switching it to an
   * ordinal timeline that visits only those dates (see
   * {@link TimeSliderOptions.dates}). Any existing start/end clip is dropped, so
   * the whole list is shown; the range becomes the list's first and last entry.
   *
   * Use this when the dates are only known after an async lookup — a bucket
   * listing, a STAC search, or any other catalog request:
   *
   * @example
   * ```typescript
   * const slider = new TimeSliderControl({ startDate: '2023-01-01', sources: [...] });
   * map.addControl(slider, 'bottom-left');
   * slider.setDates(await fetchAvailableDates());
   * ```
   *
   * @param dates - The dates to step through. Pass `null`, `undefined`, or an
   *   empty list to drop back to a continuous timeline over the same span.
   */
  setDates(dates?: Array<Date | string | number> | null): void {
    const s = this._state;
    const prev = s.currentDate.getTime();
    this._allDates = dates ? ingestDates(dates, s.granularity) : undefined;
    // An explicitly supplied list supersedes whatever URL was loaded before.
    this._datesUrl = undefined;
    Object.assign(
      s,
      this._allDates
        ? resolveRange(this._allDates)
        : // Dropping the list leaves a continuous timeline spanning whatever the
          // list last covered, so the dock does not jump to an unrelated range.
          // An end that was already open stays open rather than being pinned here.
          resolveRange(undefined, s.startDate, s.endDateAuto ? null : s.endDate)
    );
    this._rebuildScale();
    s.currentDate = this._scale.snap(s.currentDate);
    this._view?.syncRange();
    this._view?.syncGranularities();
    this._view?.syncDate();
    this._notifyDateChanged(s.currentDate, prev);
    this._emit('rangechange');
    this._emit('statechange');
  }

  /**
   * Loads the timeline's dates from a URL and applies them, so the list can live
   * next to the data instead of in the calling code.
   *
   * Accepts JSON, CSV, or plain text (see {@link fetchDateList} for the shapes
   * recognized, which include a GeoJSON / STAC `FeatureCollection`). The URL is
   * remembered for {@link getDatesUrl} and serialized alongside the resolved
   * dates, so restoring a config never has to refetch.
   *
   * @param url - URL of the document listing the dates
   * @param init - Optional fetch options (headers, abort signal, credentials)
   * @returns The dates that were applied
   * @throws If the request fails or no dates can be parsed from the response.
   *   The existing timeline is left untouched when that happens.
   *
   * @example
   * ```typescript
   * await timeSlider.loadDates('https://example.com/scenes.json');
   * ```
   */
  async loadDates(url: string, init?: RequestInit): Promise<Date[]> {
    // Resolve before touching state, so a failed fetch cannot blank the timeline.
    const dates = await fetchDateList(url, init);
    this.setDates(dates);
    // setDates clears the URL (an explicit list supersedes one); record it after.
    this._datesUrl = url;
    this._view?.syncRange();
    // Return what was actually applied, not what was fetched: a catalog often
    // reports several timestamps per step (one per tile), and those collapse.
    return this.getDates() ?? [];
  }

  // ----- Sources ----------------------------------------------------------

  /**
   * Returns shallow copies of the current source specs.
   */
  getSources(): SourceSpec[] {
    return this._adapters.map((a) => ({ ...a.spec }));
  }

  /**
   * Adds a managed source and renders it for the current date.
   *
   * @param spec - The source specification
   * @returns The source/layer id
   */
  addSource(spec: SourceSpec): string {
    if (!this._map) {
      // Defer to onAdd by stashing the spec in options.
      this._options.sources = [...this._options.sources, spec];
      return spec.id ?? '';
    }
    const adapter = createAdapter(spec, {
      map: this._map,
      beforeId: this._options.beforeId,
      onDataStatus: (id, available) => this._handleDataStatus(id, available),
    });
    this._adapters.push(adapter);
    void Promise.resolve(adapter.add(this._state.currentDate))
      .then(() => {
        // The layer only exists after `add` resolves, so apply an initial
        // hidden state here rather than at construction time.
        if (spec.visible === false) adapter.setVisible(false);
      })
      .catch(() => undefined);
    this._view?.refreshLayers();
    this._emit('sourceadd');
    // "Auto-play on load" should also kick in when a layer is added live (the
    // constructor-time autoplay in onAdd has already passed by then).
    if (this._options.autoPlay && !this._state.isPlaying) this.play();
    return adapter.id;
  }

  /**
   * Removes a managed source by id.
   *
   * @param id - The source id
   */
  removeSource(id: string): void {
    const index = this._adapters.findIndex((a) => a.id === id);
    if (index === -1) return;
    this._adapters[index].remove();
    this._adapters.splice(index, 1);
    // Drop any "no data" state the removed source was holding, and clear the
    // indicator if it was the last unavailable source.
    if (this._unavailableSources.delete(id) && this._unavailableSources.size === 0) {
      this._view?.syncDataStatus(false);
    }
    this._view?.refreshLayers();
    this._emit('sourceremove');
  }

  /**
   * Sets a managed source's opacity.
   *
   * @param id - The source id
   * @param opacity - Opacity in [0, 1]
   */
  setSourceOpacity(id: string, opacity: number): void {
    this.setSourceProperty(id, { opacity } as Partial<SourceSpec>);
  }

  /**
   * Applies a live property patch to a managed source (opacity and, for COG,
   * colormap/rescale).
   *
   * @param id - The source id
   * @param patch - Partial spec fields to merge
   */
  setSourceProperty(id: string, patch: Partial<SourceSpec>): void {
    const adapter = this._adapters.find((a) => a.id === id);
    if (!adapter) return;
    const merged = { ...patch } as Record<string, unknown>;
    if ('opacity' in merged && typeof merged.opacity === 'number') {
      merged.opacity = clamp(merged.opacity, 0, 1);
    }
    Object.assign(adapter.spec as unknown as Record<string, unknown>, merged);
    const rest = { ...merged };
    if ('opacity' in rest && typeof rest.opacity === 'number') {
      adapter.setOpacity(rest.opacity);
      delete rest.opacity;
    }
    if ('visible' in rest && typeof rest.visible === 'boolean') {
      adapter.setVisible(rest.visible);
      delete rest.visible;
    }
    if (Object.keys(rest).length > 0 && adapter.setProperty) {
      void Promise.resolve(adapter.setProperty(rest as Partial<SourceSpec>)).catch(() => undefined);
    }
    // Notify hosts so they can mirror live opacity/visibility/style changes
    // (e.g. reflecting a layer's opacity into an external layers panel).
    this._emit('statechange');
  }

  // ----- Config -----------------------------------------------------------

  /**
   * Serializes the full timeline + layers configuration.
   */
  getConfig(): TimeSliderConfig {
    const s = this._state;
    return {
      startDate: s.startDate.toISOString(),
      // Omit an auto (open) end so a restored config re-resolves it to the
      // then-current date rather than pinning it to this save time.
      ...(s.endDateAuto ? {} : { endDate: s.endDate.toISOString() }),
      // Saved unclipped: startDate/endDate above re-apply as clips on restore.
      ...(this._allDates ? { dates: this._allDates.map((d) => d.toISOString()) } : {}),
      ...(this._datesUrl ? { datesUrl: this._datesUrl } : {}),
      interval: s.interval,
      granularity: s.granularity,
      granularities: [...this._options.granularities],
      currentDate: s.currentDate.toISOString(),
      speed: s.speed,
      loop: s.loop,
      autoPlay: this._options.autoPlay,
      collapsed: s.collapsed,
      theme: this._options.theme,
      dateFormat: this._options.dateFormat,
      beforeId: this._options.beforeId,
      sources: this.getSources(),
    };
  }

  /**
   * Restores a configuration produced by {@link getConfig}, replacing all
   * current layers.
   *
   * @param config - The configuration to apply
   */
  setConfig(config: TimeSliderConfig): void {
    this.pause();
    for (const adapter of [...this._adapters]) {
      adapter.remove();
    }
    this._adapters = [];

    const s = this._state;
    this._allDates = config.dates ? ingestDates(config.dates, config.granularity) : undefined;
    // The resolved dates were serialized too, so restoring is offline-safe: the
    // URL is kept for display only and is never refetched here.
    this._datesUrl = this._allDates ? config.datesUrl : undefined;
    // A missing end date means the saved range was open: re-resolve it to the
    // current date so reopening an old project still reaches the latest data.
    Object.assign(
      s,
      resolveRange(
        this._allDates,
        toDate(config.startDate),
        config.endDate == null ? null : toDate(config.endDate)
      )
    );
    s.interval = Math.max(1, Math.floor(config.interval));
    s.granularity = config.granularity;
    this._rebuildScale();
    s.currentDate = this._scale.snap(toDate(config.currentDate));
    s.speed = Math.max(100, config.speed);
    s.loop = config.loop;
    if (config.autoPlay !== undefined) this._options.autoPlay = config.autoPlay;
    if (config.collapsed !== undefined) s.collapsed = config.collapsed;
    if (config.granularities) this._options.granularities = [...config.granularities];
    if (config.theme) this._options.theme = config.theme;
    if (config.dateFormat !== undefined) this._options.dateFormat = config.dateFormat;
    if (config.beforeId !== undefined) this._options.beforeId = config.beforeId;

    if (this._map) {
      for (const spec of config.sources) {
        const adapter = createAdapter(spec, {
          map: this._map,
          beforeId: this._options.beforeId,
          onDataStatus: (id, available) => this._handleDataStatus(id, available),
        });
        this._adapters.push(adapter);
        void Promise.resolve(adapter.add(s.currentDate))
          .then(() => {
            // Mirror addSource: apply an initial hidden state once the layer exists.
            if (spec.visible === false) adapter.setVisible(false);
          })
          .catch(() => undefined);
      }
    } else {
      this._options.sources = [...config.sources];
    }

    this._applyCollapsed();
    this._syncAll();
    // Adapters were (re)created above, so notify without re-dispatching.
    this._options.onChange?.(new Date(s.currentDate));
    this._emit('change');
    this._emit('statechange');
  }

  // ----- Events -----------------------------------------------------------

  /**
   * Registers an event handler.
   *
   * @param event - The event type
   * @param handler - The callback
   */
  on(event: TimeSliderEvent, handler: TimeSliderEventHandler): void {
    if (!this._eventHandlers.has(event)) {
      this._eventHandlers.set(event, new Set());
    }
    this._eventHandlers.get(event)!.add(handler);
  }

  /**
   * Removes an event handler.
   *
   * @param event - The event type
   * @param handler - The callback to remove
   */
  off(event: TimeSliderEvent, handler: TimeSliderEventHandler): void {
    this._eventHandlers.get(event)?.delete(handler);
  }

  /**
   * Returns the map instance, if added.
   */
  getMap(): MapLibreMap | undefined {
    return this._map;
  }

  /**
   * Returns the control anchor element, if added.
   */
  getContainer(): HTMLElement | undefined {
    return this._container;
  }

  // ----- Internals --------------------------------------------------------

  /**
   * Pushes a date change to every active adapter (async, fire-and-forget).
   *
   * @param date - The new date
   */
  private _dispatch(date: Date): void {
    for (const adapter of this._adapters) {
      void Promise.resolve(adapter.update(date)).catch(() => undefined);
    }
  }

  /**
   * Records an adapter's per-date data availability and toggles the dock's "no
   * data" indicator. The badge shows whenever any source reports no data for the
   * current date (the common case being a single sparse mosaic), and clears once
   * every reporting source has data again.
   *
   * @param id - The reporting source's id
   * @param available - Whether the current date has data for that source
   */
  private _handleDataStatus(id: string, available: boolean): void {
    const had = this._unavailableSources.size > 0;
    if (available) this._unavailableSources.delete(id);
    else this._unavailableSources.add(id);
    const has = this._unavailableSources.size > 0;
    if (has !== had) this._view?.syncDataStatus(has);
  }

  /**
   * Notifies listeners (adapters, `onChange`, `change` event) of a date change.
   * When `prevTime` is given, no-ops if the date did not actually change, so
   * `setGranularity`/`setRange` only fire when re-snapping moved the marker.
   *
   * @param date - The new current date
   * @param prevTime - Optional previous date timestamp for change detection
   */
  private _notifyDateChanged(date: Date, prevTime?: number): void {
    if (prevTime !== undefined && date.getTime() === prevTime) return;
    this._dispatch(date);
    this._options.onChange?.(new Date(date));
    this._emit('change');
  }

  /**
   * Re-renders all dock surfaces from the current state.
   */
  private _syncAll(): void {
    this._view?.syncRange();
    // Rebuild (not just re-highlight) the pills: an ordinal timeline hides them,
    // so restoring a config can flip their visibility either way.
    this._view?.syncGranularities();
    this._view?.syncGranularity();
    this._view?.syncDate();
    this._view?.syncControls();
    this._view?.refreshLayers();
  }

  /**
   * Emits an event to all registered handlers.
   *
   * @param event - The event type
   */
  private _emit(event: TimeSliderEvent): void {
    const handlers = this._eventHandlers.get(event);
    if (handlers) {
      const data = { type: event, state: this.getState() };
      handlers.forEach((handler) => handler(data));
    }
  }
}
