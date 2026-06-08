import { describe, it, expect, vi } from 'vitest';
import { createAxis } from './axisRenderer';
import { createLayersPopover } from './layersPopover';
import type { DockController } from './types';
import type { SourceSpec, TimeSliderState } from '../core/types';

const STATE: TimeSliderState = {
  startDate: new Date('2024-04-18T00:00:00Z'),
  endDate: new Date('2024-04-22T00:00:00Z'),
  currentDate: new Date('2024-04-18T00:00:00Z'),
  interval: 1,
  granularity: 'day',
  isPlaying: false,
  speed: 1000,
  loop: true,
};

function baseController(overrides: Partial<DockController> = {}): DockController {
  return {
    getState: () => ({ ...STATE }),
    getGranularities: () => ['hour', 'day', 'month', 'year'],
    getDateFormat: () => 'YYYY-MM-DD',
    goTo: vi.fn(),
    next: vi.fn(),
    prev: vi.fn(),
    togglePlayback: vi.fn(),
    setSpeed: vi.fn(),
    setLoop: vi.fn(),
    setGranularity: vi.fn(),
    collapse: vi.fn(),
    getSources: () => [],
    addSource: vi.fn(() => 'id'),
    removeSource: vi.fn(),
    setSourceOpacity: vi.fn(),
    setSourceProperty: vi.fn(),
    ...overrides,
  };
}

describe('axisRenderer', () => {
  it('renders ticks for the range', () => {
    const axis = createAxis(baseController());
    axis.renderTicks();
    expect(axis.root.querySelectorAll('.ts-tick').length).toBeGreaterThan(0);
    expect(axis.root.querySelector('.ts-marker')).not.toBeNull();
  });

  it('navigates to the snapped date under the pointer on drag', () => {
    const goTo = vi.fn();
    const axis = createAxis(baseController({ goTo }));
    document.body.appendChild(axis.root);
    const track = axis.root.querySelector('.ts-axis-track') as HTMLElement;
    track.getBoundingClientRect = () =>
      ({ left: 0, width: 100, top: 0, right: 100, bottom: 10, height: 10 }) as DOMRect;

    track.dispatchEvent(new MouseEvent('mousedown', { clientX: 50, bubbles: true }));
    expect(goTo).toHaveBeenCalledTimes(1);
    // Midpoint of an 18->22 range is the 20th.
    expect(goTo.mock.calls[0][0].toISOString()).toBe('2024-04-20T00:00:00.000Z');
    axis.destroy();
  });

  it('positions the marker at the current date fraction', () => {
    const axis = createAxis(
      baseController({
        getState: () => ({ ...STATE, currentDate: new Date('2024-04-20T00:00:00Z') }),
      })
    );
    axis.setMarker();
    const marker = axis.root.querySelector('.ts-marker') as HTMLElement;
    expect(marker.style.left).toBe('50%');
  });
});

describe('layersPopover', () => {
  it('opens, adds an XYZ source, lists it, and removes it', () => {
    let sources: SourceSpec[] = [];
    const addSource = vi.fn((spec: SourceSpec) => {
      sources = [...sources, { ...spec, id: 'new' }];
      return 'new';
    });
    const removeSource = vi.fn((id: string) => {
      sources = sources.filter((s) => s.id !== id);
    });
    const controller = baseController({
      getSources: () => sources,
      addSource,
      removeSource,
    });

    const popover = createLayersPopover(controller);
    document.body.appendChild(popover.root);

    (popover.root.querySelector('.ts-add-data') as HTMLButtonElement).click();
    expect(popover.root.classList.contains('ts-open')).toBe(true);

    const select = popover.root.querySelector('.ts-type-select') as HTMLSelectElement;
    select.value = 'xyz';
    select.dispatchEvent(new Event('change'));

    const inputs = popover.root.querySelectorAll('.ts-form-fields .ts-field input');
    (inputs[1] as HTMLInputElement).value = 'https://t/{z}/{x}/{y}.png';

    (popover.root.querySelector('.ts-add-submit') as HTMLButtonElement).click();
    expect(addSource).toHaveBeenCalledTimes(1);
    expect((addSource.mock.calls[0][0] as SourceSpec).type).toBe('xyz');
    expect(popover.root.querySelectorAll('.ts-layer-row')).toHaveLength(1);

    (popover.root.querySelector('.ts-layer-remove') as HTMLButtonElement).click();
    expect(removeSource).toHaveBeenCalledWith('new');

    popover.destroy();
  });

  it('shows an empty state when there are no layers', () => {
    const popover = createLayersPopover(baseController());
    expect(popover.root.querySelector('.ts-layer-empty')).not.toBeNull();
    popover.destroy();
  });
});
