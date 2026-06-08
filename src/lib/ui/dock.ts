import { createPlayback } from './playbackCluster';
import { createAxis } from './axisRenderer';
import { createPills } from './granularityPills';
import { createLayersPopover } from './layersPopover';
import type { DockController, DockView } from './types';

/**
 * Visual options for the dock.
 */
export interface DockOptions {
  /** Theme override; 'auto' defers to the system preference. */
  theme?: 'auto' | 'light' | 'dark';
  /** Extra CSS class for the dock root. */
  className?: string;
}

/**
 * Assembles the full bottom dock from its clusters and returns an imperative
 * {@link DockView} the control uses to push state into the DOM.
 *
 * Layout: `[ left: date + transport ] [ center: scrubbable axis ] [ right:
 * granularity pills + add-data ]`.
 *
 * @param controller - The control's UI-facing API
 * @param options - Theme and class options
 * @returns A dock view
 */
export function createDockView(controller: DockController, options: DockOptions = {}): DockView {
  const root = document.createElement('div');
  root.className = 'maplibregl-time-slider-dock';
  if (options.theme === 'light') root.classList.add('ts-theme-light');
  if (options.theme === 'dark') root.classList.add('ts-theme-dark');
  if (options.className) root.classList.add(options.className);

  const playback = createPlayback(controller);
  const axis = createAxis(controller);
  const pills = createPills(controller);
  const layers = createLayersPopover(controller);

  const right = document.createElement('div');
  right.className = 'ts-right';

  // Hide button collapses the dock to the corner toggle.
  const hideBtn = document.createElement('button');
  hideBtn.type = 'button';
  hideBtn.className = 'time-slider-btn ts-collapse-btn';
  hideBtn.setAttribute('aria-label', 'Hide timeline');
  hideBtn.title = 'Hide timeline';
  hideBtn.innerHTML = '&#9662;'; // down triangle
  hideBtn.addEventListener('click', () => controller.collapse());

  right.append(pills.root, layers.root, hideBtn);

  root.append(playback.root, axis.root, right);

  return {
    root,
    syncDate() {
      axis.setMarker();
    },
    syncPlayState() {
      playback.syncPlayState();
    },
    syncGranularity() {
      pills.syncActive();
      axis.renderTicks();
      axis.setMarker();
    },
    syncControls() {
      playback.syncInputs();
    },
    syncRange() {
      axis.renderTicks();
      axis.setMarker();
      playback.syncInputs();
    },
    refreshLayers() {
      layers.refresh();
    },
    destroy() {
      axis.destroy();
      layers.destroy();
      root.parentNode?.removeChild(root);
    },
  };
}
