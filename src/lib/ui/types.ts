import type { Map as MapLibreMap } from 'maplibre-gl';
import type { Granularity, SourceSpec, TimeSliderState } from '../core/types';

/**
 * The slice of the control's public API that the dock UI depends on. UI modules
 * target this interface rather than the concrete control class, which keeps the
 * dependency one-directional (control -> ui) and avoids circular imports.
 */
export interface DockController {
  /** Current observable state. */
  getState(): TimeSliderState;
  /** Granularities offered as zoom pills. */
  getGranularities(): Granularity[];
  /** Token format for the large date display. */
  getDateFormat(): string;
  /** Current color theme. */
  getTheme(): 'auto' | 'light' | 'dark';
  /** Whether playback starts automatically when the control is added. */
  getAutoPlay(): boolean;
  /** The MapLibre map the control is attached to, if added. */
  getMap(): MapLibreMap | undefined;

  /** Navigate to a specific date (snapped internally). */
  goTo(date: Date): void;
  /** Advance one step (honoring loop). */
  next(): void;
  /** Rewind one step (honoring loop). */
  prev(): void;
  /** Toggle playback. */
  togglePlayback(): void;
  /** Set playback speed in ms per step. */
  setSpeed(ms: number): void;
  /** Enable/disable looping. */
  setLoop(enabled: boolean): void;
  /** Enable/disable auto-play on add. */
  setAutoPlay(enabled: boolean): void;
  /** Set the color theme (applied live). */
  setTheme(theme: 'auto' | 'light' | 'dark'): void;
  /** Set the date-label token format (applied live; undefined = default). */
  setDateFormat(format?: string): void;
  /** Change the active granularity. */
  setGranularity(granularity: Granularity): void;
  /** Set which granularities are offered as pills. */
  setGranularities(granularities: Granularity[]): void;
  /**
   * Update the timeline range (and optionally interval/granularity). Pass `null`
   * (or omit) for `end` to leave it open: it defaults to the current date and is
   * persisted as auto so a restored config re-resolves to the then-current date.
   */
  setRange(
    start: Date | string,
    end?: Date | string | null,
    interval?: number,
    granularity?: Granularity
  ): void;
  /** Collapse (hide) the dock. */
  collapse(): void;

  /** Current managed sources (spec snapshots). */
  getSources(): SourceSpec[];
  /** Add a managed source; returns its id. */
  addSource(spec: SourceSpec): string;
  /** Remove a managed source by id. */
  removeSource(id: string): void;
  /** Set a managed source's opacity. */
  setSourceOpacity(id: string, opacity: number): void;
  /** Apply a live property patch to a managed source (e.g. COG colormap/rescale). */
  setSourceProperty(id: string, patch: Partial<SourceSpec>): void;
}

/**
 * Imperative handle returned by the dock builder so the control can push state
 * changes into the DOM without re-rendering everything.
 */
export interface DockView {
  /** Root dock element (appended to the map container). */
  root: HTMLElement;
  /** Update the date display and marker position. */
  syncDate(): void;
  /** Update the play/pause button. */
  syncPlayState(): void;
  /** Update the active granularity pill. */
  syncGranularity(): void;
  /** Rebuild the granularity pills after the offered set changes. */
  syncGranularities(): void;
  /** Sync the speed/loop inputs without re-rendering ticks. */
  syncControls(): void;
  /** Re-render the axis ticks and playback inputs (after a range/granularity change). */
  syncRange(): void;
  /** Rebuild the layers list in the popover. */
  refreshLayers(): void;
  /** Toggle the "no data for this date" indicator on the timeline marker. */
  syncDataStatus(unavailable: boolean): void;
  /** Detach listeners and remove the dock from the DOM. */
  destroy(): void;
}
