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
import { nextStep, prevStep, snapToStep } from '../time/timeline';
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
  beforeId?: string;
  sources: SourceSpec[];
  onChange?: (date: Date) => void;
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
  private _savedContainerCss?: string;
  private _view?: DockView;
  private _state: TimeSliderState;
  private _options: ResolvedOptions;
  private _adapters: SourceAdapter[] = [];
  private _eventHandlers: EventHandlersMap = new globalThis.Map();
  private _playbackInterval?: ReturnType<typeof setInterval>;

  /**
   * Creates a new TimeSliderControl.
   *
   * @param options - Configuration options
   */
  constructor(options: TimeSliderOptions) {
    const startDate = toDate(options.startDate);
    const endDate = toDate(options.endDate);
    const interval = Math.max(1, Math.floor(options.interval ?? 1));
    const granularity = options.granularity ?? 'day';
    const initial = options.initialDate ? toDate(options.initialDate) : startDate;

    this._state = {
      collapsed: options.collapsed ?? false,
      startDate,
      endDate,
      interval,
      granularity,
      currentDate: snapToStep(initial, startDate, endDate, interval, granularity),
      isPlaying: false,
      speed: Math.max(100, options.speed ?? 1000),
      loop: options.loop ?? true,
    };

    this._options = {
      granularities: options.granularities ?? GRANULARITIES,
      dateFormat: options.dateFormat,
      theme: options.theme ?? 'auto',
      className: options.className,
      collapsible: options.collapsible ?? true,
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
    };
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

    this._map?.resize();
  }

  /**
   * Restores the original DOM/styles undone by {@link _installLayout}.
   */
  private _uninstallLayout(): void {
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
    const snapped = snapToStep(date, s.startDate, s.endDate, s.interval, s.granularity);
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
    const candidate = nextStep(s.currentDate, s.startDate, s.endDate, s.interval, s.granularity);
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
    const candidate = prevStep(s.currentDate, s.startDate, s.endDate, s.interval, s.granularity);
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
    const candidate = nextStep(s.currentDate, s.startDate, s.endDate, s.interval, s.granularity);
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

  // ----- Range / granularity ----------------------------------------------

  /**
   * Changes the active granularity, resetting the interval to 1 and re-snapping
   * the current date.
   *
   * @param granularity - The new granularity
   */
  setGranularity(granularity: Granularity): void {
    const s = this._state;
    const prev = s.currentDate.getTime();
    s.granularity = granularity;
    s.interval = 1;
    s.currentDate = snapToStep(s.currentDate, s.startDate, s.endDate, s.interval, granularity);
    this._view?.syncGranularity();
    this._view?.syncDate();
    this._notifyDateChanged(s.currentDate, prev);
    this._emit('granularitychange');
    this._emit('statechange');
  }

  /**
   * Updates the timeline range (and optionally interval/granularity),
   * re-snapping the current date.
   *
   * @param start - New range start
   * @param end - New range end
   * @param interval - Optional new interval
   * @param granularity - Optional new granularity
   */
  setRange(
    start: Date | string,
    end: Date | string,
    interval?: number,
    granularity?: Granularity
  ): void {
    const s = this._state;
    const prev = s.currentDate.getTime();
    s.startDate = toDate(start);
    s.endDate = toDate(end);
    if (interval != null) s.interval = Math.max(1, Math.floor(interval));
    if (granularity != null) s.granularity = granularity;
    s.currentDate = snapToStep(s.currentDate, s.startDate, s.endDate, s.interval, s.granularity);
    this._view?.syncRange();
    this._view?.syncGranularity();
    this._view?.syncDate();
    this._notifyDateChanged(s.currentDate, prev);
    this._emit('rangechange');
    this._emit('statechange');
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
    });
    this._adapters.push(adapter);
    void Promise.resolve(adapter.add(this._state.currentDate)).catch(() => undefined);
    this._view?.refreshLayers();
    this._emit('sourceadd');
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
    if (Object.keys(rest).length > 0 && adapter.setProperty) {
      void Promise.resolve(adapter.setProperty(rest as Partial<SourceSpec>)).catch(() => undefined);
    }
  }

  // ----- Config -----------------------------------------------------------

  /**
   * Serializes the full timeline + layers configuration.
   */
  getConfig(): TimeSliderConfig {
    const s = this._state;
    return {
      startDate: s.startDate.toISOString(),
      endDate: s.endDate.toISOString(),
      interval: s.interval,
      granularity: s.granularity,
      granularities: [...this._options.granularities],
      currentDate: s.currentDate.toISOString(),
      speed: s.speed,
      loop: s.loop,
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
    s.startDate = toDate(config.startDate);
    s.endDate = toDate(config.endDate);
    s.interval = Math.max(1, Math.floor(config.interval));
    s.granularity = config.granularity;
    s.currentDate = snapToStep(
      toDate(config.currentDate),
      s.startDate,
      s.endDate,
      s.interval,
      s.granularity
    );
    s.speed = Math.max(100, config.speed);
    s.loop = config.loop;
    if (config.collapsed !== undefined) s.collapsed = config.collapsed;
    if (config.granularities) this._options.granularities = [...config.granularities];
    if (config.theme) this._options.theme = config.theme;
    if (config.dateFormat !== undefined) this._options.dateFormat = config.dateFormat;
    if (config.beforeId !== undefined) this._options.beforeId = config.beforeId;

    if (this._map) {
      for (const spec of config.sources) {
        const adapter = createAdapter(spec, { map: this._map, beforeId: this._options.beforeId });
        this._adapters.push(adapter);
        void Promise.resolve(adapter.add(s.currentDate)).catch(() => undefined);
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
