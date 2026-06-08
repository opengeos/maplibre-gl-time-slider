import { clamp } from '../utils/helpers';
import { dateToFraction, fractionToDate } from '../time/timeline';
import { generateTicks } from '../time/ticks';
import { formatDate } from '../template/dateFormat';
import type { DockController } from './types';

/**
 * Imperative handle for the timeline axis.
 */
export interface AxisHandle {
  root: HTMLElement;
  /** Regenerate tick marks from the current range/granularity. */
  renderTicks(): void;
  /** Reposition the marker to the current date. */
  setMarker(): void;
  /** Remove global listeners. */
  destroy(): void;
}

/**
 * Reads the horizontal client coordinate from a mouse or touch event.
 *
 * @param e - A mouse or touch event
 * @returns The clientX value
 */
function clientXOf(e: Event): number {
  const touch = (e as TouchEvent).touches?.[0];
  return touch ? touch.clientX : (e as MouseEvent).clientX;
}

/**
 * Builds the scrubbable timeline axis: a track of tick marks with a draggable
 * marker. Dragging or clicking the track navigates the controller to the
 * snapped date under the pointer.
 *
 * @param controller - The control's UI-facing API
 * @returns An axis handle for updating ticks and the marker
 */
export function createAxis(controller: DockController): AxisHandle {
  const root = document.createElement('div');
  root.className = 'ts-axis';

  const track = document.createElement('div');
  track.className = 'ts-axis-track';

  const ticksLayer = document.createElement('div');
  ticksLayer.className = 'ts-ticks';

  const marker = document.createElement('div');
  marker.className = 'ts-marker';
  // The current-date label rides with the marker, beneath the pointer.
  const markerLabel = document.createElement('div');
  markerLabel.className = 'ts-marker-label';
  const knob = document.createElement('div');
  knob.className = 'ts-marker-knob';
  marker.append(knob, markerLabel);

  track.appendChild(ticksLayer);
  track.appendChild(marker);
  root.appendChild(track);

  let dragging = false;

  const fractionFromClientX = (clientX: number): number => {
    const rect = track.getBoundingClientRect();
    if (rect.width === 0) return 0;
    return clamp((clientX - rect.left) / rect.width, 0, 1);
  };

  const navigateTo = (clientX: number): void => {
    const { startDate, endDate } = controller.getState();
    controller.goTo(fractionToDate(fractionFromClientX(clientX), startDate, endDate));
  };

  const onDown = (e: Event): void => {
    dragging = true;
    navigateTo(clientXOf(e));
    e.preventDefault();
  };
  const onMove = (e: Event): void => {
    if (!dragging) return;
    navigateTo(clientXOf(e));
  };
  const onUp = (): void => {
    dragging = false;
  };

  track.addEventListener('mousedown', onDown);
  track.addEventListener('touchstart', onDown, { passive: false });
  window.addEventListener('mousemove', onMove);
  window.addEventListener('touchmove', onMove, { passive: false });
  window.addEventListener('mouseup', onUp);
  window.addEventListener('touchend', onUp);

  // Labeled ticks from the most recent render, in left-to-right order. Kept so
  // the labels can be re-thinned on resize without rebuilding the tick DOM.
  let labelEls: { el: HTMLElement; fraction: number }[] = [];

  // Minimum gap, in pixels, to leave between two adjacent label boxes.
  const LABEL_GAP = 6;

  /**
   * Hides tick labels that would overlap at the track's current pixel width,
   * keeping a left-to-right subset spaced far enough apart to stay legible.
   * Skipped when the track has no measurable width (e.g. before layout), which
   * leaves every label visible until the next resize.
   */
  const thinLabels = (): void => {
    if (labelEls.length === 0) return;
    const width = track.getBoundingClientRect().width;
    // Reset before measuring so previously hidden labels can reappear when the
    // track grows; a hidden element reports zero width.
    for (const { el } of labelEls) el.style.display = '';
    if (width === 0) return;
    // Measure all half-widths first (one layout pass) before mutating display,
    // so hiding one label never forces a reflow while measuring the next.
    const halves = labelEls.map(({ el }) => el.getBoundingClientRect().width / 2);
    let lastRight = -Infinity;
    labelEls.forEach(({ el, fraction }, i) => {
      const center = fraction * width;
      if (center - halves[i] < lastRight + LABEL_GAP) {
        el.style.display = 'none';
      } else {
        lastRight = center + halves[i];
      }
    });
  };

  const renderTicks = (): void => {
    const { startDate, endDate, granularity } = controller.getState();
    ticksLayer.replaceChildren();
    labelEls = [];
    const ticks = generateTicks(startDate, endDate, granularity);
    for (const tick of ticks) {
      const el = document.createElement('div');
      el.className = tick.major ? 'ts-tick ts-tick-major' : 'ts-tick';
      el.style.left = `${tick.fraction * 100}%`;
      if (tick.label) {
        const label = document.createElement('span');
        label.className = 'ts-tick-label';
        label.textContent = tick.label;
        el.appendChild(label);
        labelEls.push({ el: label, fraction: tick.fraction });
      }
      ticksLayer.appendChild(el);
    }
    thinLabels();
  };

  // Re-thin labels when the dock width changes (responsive reflow, window
  // resize, device rotation) so they never cluster on a narrowed track.
  let resizeRaf = 0;
  const observer =
    typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
          if (resizeRaf) return;
          resizeRaf = requestAnimationFrame(() => {
            resizeRaf = 0;
            thinLabels();
          });
        })
      : null;
  observer?.observe(track);

  const setMarker = (): void => {
    const { currentDate, startDate, endDate } = controller.getState();
    const fraction = dateToFraction(currentDate, startDate, endDate);
    marker.style.left = `${fraction * 100}%`;
    markerLabel.textContent = formatDate(currentDate, controller.getDateFormat());
    // Keep the label inside the track near the edges instead of centering it.
    const shift = fraction <= 0.1 ? '0' : fraction >= 0.9 ? '-100%' : '-50%';
    markerLabel.style.transform = `translateX(${shift})`;
  };

  const destroy = (): void => {
    observer?.disconnect();
    if (resizeRaf) cancelAnimationFrame(resizeRaf);
    track.removeEventListener('mousedown', onDown);
    track.removeEventListener('touchstart', onDown);
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('touchmove', onMove);
    window.removeEventListener('mouseup', onUp);
    window.removeEventListener('touchend', onUp);
  };

  return { root, renderTicks, setMarker, destroy };
}
