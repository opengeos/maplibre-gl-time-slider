import type { Granularity } from '../core/types';
import { granularityCode } from '../time/granularity';
import type { DockController } from './types';

/**
 * Imperative handle for the granularity pills.
 */
export interface PillsHandle {
  root: HTMLElement;
  /** Highlight the pill matching the active granularity. */
  syncActive(): void;
  /** Rebuild the pill buttons from the controller's current granularity set. */
  rebuild(): void;
}

/**
 * Builds the H/D/M/Y zoom pills. Selecting one changes the control's
 * granularity. The pill set can be rebuilt live via {@link PillsHandle.rebuild}
 * when the offered granularities change.
 *
 * @param controller - The control's UI-facing API
 * @returns A pills handle for syncing the active state
 */
export function createPills(controller: DockController): PillsHandle {
  const root = document.createElement('div');
  root.className = 'ts-pills';
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'Time granularity');

  const buttons = new Map<Granularity, HTMLButtonElement>();

  const rebuild = (): void => {
    buttons.clear();
    root.replaceChildren();
    for (const granularity of controller.getGranularities()) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ts-pill';
      btn.textContent = granularityCode(granularity);
      btn.title = granularity;
      btn.dataset.granularity = granularity;
      btn.addEventListener('click', () => controller.setGranularity(granularity));
      buttons.set(granularity, btn);
      root.appendChild(btn);
    }
    syncActive();
  };

  const syncActive = (): void => {
    const active = controller.getState().granularity;
    buttons.forEach((btn, granularity) => {
      const isActive = granularity === active;
      btn.classList.toggle('ts-active', isActive);
      btn.setAttribute('aria-pressed', String(isActive));
    });
  };

  rebuild();
  return { root, syncActive, rebuild };
}
