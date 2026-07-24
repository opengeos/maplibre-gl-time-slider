import { describe, it, expect, vi, afterEach } from 'vitest';
import { createAxis } from './axisRenderer';
import { createLayersPopover } from './layersPopover';
import type { DockController } from './types';
import type { SourceSpec, TimeSliderState } from '../core/types';

const STATE: TimeSliderState = {
  collapsed: false,
  startDate: new Date('2024-04-18T00:00:00Z'),
  endDate: new Date('2024-04-22T00:00:00Z'),
  endDateAuto: false,
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
    getTheme: () => 'auto',
    getAutoPlay: () => false,
    getMap: () => undefined,
    goTo: vi.fn(),
    next: vi.fn(),
    prev: vi.fn(),
    togglePlayback: vi.fn(),
    setSpeed: vi.fn(),
    setLoop: vi.fn(),
    setAutoPlay: vi.fn(),
    setTheme: vi.fn(),
    setDateFormat: vi.fn(),
    setGranularity: vi.fn(),
    setGranularities: vi.fn(),
    setRange: vi.fn(),
    collapse: vi.fn(),
    getSources: () => [],
    addSource: vi.fn(() => 'id'),
    removeSource: vi.fn(),
    setSourceOpacity: vi.fn(),
    setSourceProperty: vi.fn(),
    ...overrides,
  };
}

// Always remove any global stubs (e.g. a stubbed `fetch`) so a failed assertion
// in one test cannot leak its stub into the next.
afterEach(() => {
  vi.unstubAllGlobals();
  // Restore prototype spies (e.g. getBoundingClientRect) so a mock from one
  // test cannot leak into the next.
  vi.restoreAllMocks();
  // Several tests mount their popover into the document to exercise real event
  // dispatch; drop the mounted nodes so one test's DOM cannot reach the next.
  document.body.replaceChildren();
});

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

  it('thins overlapping tick labels to fit the track width', () => {
    const axis = createAxis(
      baseController({
        getState: () => ({
          ...STATE,
          startDate: new Date('2020-01-01T00:00:00Z'),
          endDate: new Date('2022-12-31T00:00:00Z'),
          granularity: 'day',
        }),
      })
    );
    document.body.appendChild(axis.root);
    const track = axis.root.querySelector('.ts-axis-track') as HTMLElement;
    const origRect = Element.prototype.getBoundingClientRect;
    // 200px-wide track; each label measures 40px. Only a few fit without overlap.
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element
    ) {
      if (this === track)
        return { left: 0, width: 200, top: 0, right: 200, bottom: 10, height: 10 } as DOMRect;
      if ((this as HTMLElement).classList.contains('ts-tick-label'))
        return { left: 0, width: 40, top: 0, right: 40, bottom: 10, height: 10 } as DOMRect;
      return origRect.call(this);
    });

    axis.renderTicks();
    const labels = Array.from(axis.root.querySelectorAll('.ts-tick-label')) as HTMLElement[];
    const visible = labels.filter((l) => l.style.display !== 'none');
    // ~36 monthly labels are generated, but a 200px track fits at most ~5 of 40px.
    expect(labels.length).toBeGreaterThan(10);
    expect(visible.length).toBeLessThan(labels.length);
    expect(visible.length).toBeLessThanOrEqual(6);
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

    // Add-form fields for xyz: name, id, tiles.
    const inputs = popover.root.querySelectorAll('.ts-add-form .ts-form-fields .ts-field input');
    (inputs[2] as HTMLInputElement).value = 'https://t/{z}/{x}/{y}.png';

    (popover.root.querySelector('.ts-add-submit') as HTMLButtonElement).click();
    expect(addSource).toHaveBeenCalledTimes(1);
    expect((addSource.mock.calls[0][0] as SourceSpec).type).toBe('xyz');
    expect(popover.root.querySelectorAll('.ts-layer-row')).toHaveLength(1);

    (popover.root.querySelector('.ts-layer-remove') as HTMLButtonElement).click();
    expect(removeSource).toHaveBeenCalledWith('new');

    popover.destroy();
  });

  it('stays open on outside clicks; only "+ Add data" toggles it shut', () => {
    const popover = createLayersPopover(baseController());
    document.body.appendChild(popover.root);
    const toggle = popover.root.querySelector('.ts-add-data') as HTMLButtonElement;

    toggle.click();
    expect(popover.root.classList.contains('ts-open')).toBe(true);

    // A click on the map (or anywhere else in the document) must not dismiss it.
    document.body.click();
    expect(popover.root.classList.contains('ts-open')).toBe(true);

    toggle.click();
    expect(popover.root.classList.contains('ts-open')).toBe(false);

    popover.destroy();
  });

  it('shows an empty state when there are no layers', () => {
    const popover = createLayersPopover(baseController());
    expect(popover.root.querySelector('.ts-layer-empty')).not.toBeNull();
    popover.destroy();
  });

  const timelineInputs = (root: HTMLElement): HTMLInputElement[] =>
    Array.from(
      root.querySelectorAll('.ts-timeline-section .ts-form-fields .ts-field input')
    ) as HTMLInputElement[];

  it('Timeline form: a blank End date opens the range (setRange end = null)', () => {
    const setRange = vi.fn();
    const popover = createLayersPopover(baseController({ setRange }));
    document.body.appendChild(popover.root);

    const [start, end] = timelineInputs(popover.root);
    start.value = '2024-01-01';
    end.value = '';
    start.dispatchEvent(new Event('change'));

    expect(setRange).toHaveBeenCalledTimes(1);
    const [, endArg] = setRange.mock.calls[0];
    expect(endArg).toBeNull();
    popover.destroy();
  });

  it('Timeline form: an explicit End date sets a fixed range', () => {
    const setRange = vi.fn();
    const popover = createLayersPopover(baseController({ setRange }));
    document.body.appendChild(popover.root);

    const [start, end] = timelineInputs(popover.root);
    start.value = '2024-01-01';
    end.value = '2024-06-30';
    end.dispatchEvent(new Event('change'));

    expect(setRange).toHaveBeenCalledTimes(1);
    const endArg = setRange.mock.calls[0][1] as Date;
    expect(endArg).toBeInstanceOf(Date);
    expect(endArg.getTime()).toBe(new Date('2024-06-30').getTime());
    popover.destroy();
  });

  it('Timeline form: leaves End blank when the range end is auto', () => {
    const popover = createLayersPopover(
      baseController({ getState: () => ({ ...STATE, endDateAuto: true }) })
    );
    document.body.appendChild(popover.root);
    const [, end] = timelineInputs(popover.root);
    expect(end.value).toBe('');
    popover.destroy();
  });

  it('pre-fills the example URL when a source type is selected', () => {
    const popover = createLayersPopover(baseController());
    document.body.appendChild(popover.root);
    const select = popover.root.querySelector('.ts-type-select') as HTMLSelectElement;
    const tiles = (): HTMLInputElement =>
      popover.root.querySelectorAll(
        '.ts-add-form .ts-form-fields .ts-field input'
      )[2] as HTMLInputElement;

    select.value = 'xyz';
    select.dispatchEvent(new Event('change'));
    const filled = tiles().value;
    expect(filled).toContain('gibs.earthdata.nasa.gov');
    expect(filled).toContain('{z}/{y}/{x}');

    // An edited value is preserved when switching types away and back.
    tiles().value = 'https://custom/{z}/{x}/{y}.png';
    select.value = 'geojson';
    select.dispatchEvent(new Event('change'));
    select.value = 'xyz';
    select.dispatchEvent(new Event('change'));
    expect(tiles().value).toBe('https://custom/{z}/{x}/{y}.png');

    popover.destroy();
  });

  it('applies the example timeline/settings when a source type is selected on an empty timeline', () => {
    const setRange = vi.fn();
    const setGranularities = vi.fn();
    const setSpeed = vi.fn();
    const goTo = vi.fn();
    const popover = createLayersPopover(
      baseController({ setRange, setGranularities, setSpeed, goTo })
    );
    document.body.appendChild(popover.root);
    const select = popover.root.querySelector('.ts-type-select') as HTMLSelectElement;

    select.value = 'geojson';
    select.dispatchEvent(new Event('change'));
    expect(setGranularities).toHaveBeenCalledWith(['month']);
    expect(setRange).toHaveBeenCalledWith('2015-01-01', '2015-12-31', 1, 'month');
    expect(setSpeed).toHaveBeenCalledWith(1000);
    // Every example starts at its start date.
    expect(goTo).toHaveBeenCalledWith(new Date('2015-01-01'));

    popover.destroy();
  });

  it('does not apply an example timeline when a source already exists', () => {
    const setRange = vi.fn();
    const setGranularities = vi.fn();
    const setSpeed = vi.fn();
    const goTo = vi.fn();
    const existing: SourceSpec = { id: 'chla', type: 'mosaic', url: 'https://x/{date:YYYYMMDD}.json' };
    const popover = createLayersPopover(
      baseController({
        getSources: () => [existing],
        setRange,
        setGranularities,
        setSpeed,
        goTo,
      })
    );
    document.body.appendChild(popover.root);
    const select = popover.root.querySelector('.ts-type-select') as HTMLSelectElement;

    // Switching the add-form type to pick a second source must not overwrite the
    // range/granularity/speed/date the existing (or restored) timeline already has.
    select.value = 'geojson';
    select.dispatchEvent(new Event('change'));
    expect(setRange).not.toHaveBeenCalled();
    expect(setGranularities).not.toHaveBeenCalled();
    expect(setSpeed).not.toHaveBeenCalled();
    expect(goTo).not.toHaveBeenCalled();

    popover.destroy();
  });

  it('does not apply an example timeline after the user edits the timeline', () => {
    const setRange = vi.fn();
    const setGranularities = vi.fn();
    const setSpeed = vi.fn();
    const goTo = vi.fn();
    const popover = createLayersPopover(
      baseController({ setRange, setGranularities, setSpeed, goTo })
    );
    document.body.appendChild(popover.root);

    // The user enters a start date in the Timeline section (a real change event
    // that bubbles up to the section, marking the timeline user-configured).
    const [start] = timelineInputs(popover.root);
    start.value = '2024-01-01';
    start.dispatchEvent(new Event('change', { bubbles: true }));
    setRange.mockClear();
    setGranularities.mockClear();
    setSpeed.mockClear();
    goTo.mockClear();

    // Switching the add-form type must now leave the user's timeline alone even
    // though no source has been added yet.
    const select = popover.root.querySelector('.ts-type-select') as HTMLSelectElement;
    select.value = 'geojson';
    select.dispatchEvent(new Event('change'));
    expect(setRange).not.toHaveBeenCalled();
    expect(setGranularities).not.toHaveBeenCalled();
    expect(setSpeed).not.toHaveBeenCalled();
    expect(goTo).not.toHaveBeenCalled();

    popover.destroy();
  });

  it('resizes the popover content height by dragging the vertical grip', () => {
    const popover = createLayersPopover(baseController());
    document.body.appendChild(popover.root);
    const scroll = popover.root.querySelector('.ts-popover-scroll') as HTMLElement;
    // Stub the starting height the drag measures from.
    scroll.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 0, bottom: 300, width: 0, height: 300 }) as DOMRect;

    const vGrip = popover.root.querySelector('.ts-resize-grip-v') as HTMLElement;
    expect(vGrip).not.toBeNull();

    vGrip.dispatchEvent(new MouseEvent('pointerdown', { clientY: 400, bubbles: true }));
    // The popover is bottom-anchored and grows upward, so dragging the top grip
    // up 100px (400 -> 300) enlarges the content area to 300 + 100 = 400px.
    window.dispatchEvent(new MouseEvent('pointermove', { clientY: 300 }));
    expect(scroll.style.maxHeight).toBe('400px');
    window.dispatchEvent(new MouseEvent('pointerup', {}));

    popover.destroy();
  });

  it('includes the COG bands field as bidx when adding a layer', async () => {
    // COG adds fetch the data bounds; stub fetch so the add path is deterministic.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no network')));
    const addSource = vi.fn(() => 'id');
    const popover = createLayersPopover(baseController({ addSource }));
    document.body.appendChild(popover.root);
    (popover.root.querySelector('.ts-add-data') as HTMLButtonElement).click();

    // COG is the default type; its example (Landsat) pre-fills url + bands 1,2,3.
    (popover.root.querySelector('.ts-add-submit') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(addSource).toHaveBeenCalledTimes(1));
    const spec = addSource.mock.calls[0][0] as { bidx?: number[]; url?: string };
    expect(spec.url).toContain('landsat_ts');
    expect(spec.bidx).toEqual([1, 2, 3]);

    popover.destroy();
  });

  it('fetches and attaches the COG footprint as bounds on add', async () => {
    const bounds = [-74.7, -8.6, -74.2, -8.3];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ bounds }) }));
    const addSource = vi.fn(() => 'id');
    const popover = createLayersPopover(baseController({ addSource }));
    document.body.appendChild(popover.root);
    (popover.root.querySelector('.ts-add-data') as HTMLButtonElement).click();

    (popover.root.querySelector('.ts-add-submit') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(addSource).toHaveBeenCalledTimes(1));
    const spec = addSource.mock.calls[0][0] as { bounds?: number[] };
    expect(spec.bounds).toEqual(bounds);

    popover.destroy();
  });

  it('includes the selected time window when adding a GeoJSON layer', () => {
    const addSource = vi.fn(() => 'id');
    const popover = createLayersPopover(baseController({ addSource }));
    document.body.appendChild(popover.root);
    const select = popover.root.querySelector('.ts-type-select') as HTMLSelectElement;
    select.value = 'geojson';
    select.dispatchEvent(new Event('change'));

    (popover.root.querySelector('.ts-add-submit') as HTMLButtonElement).click();
    expect(addSource).toHaveBeenCalledTimes(1);
    const spec = addSource.mock.calls[0][0] as {
      type: string;
      window?: { unit: string; before: number; after: number };
    };
    expect(spec.type).toBe('geojson');
    // The GeoJSON example uses a monthly window so features match its timeline.
    expect(spec.window).toEqual({ unit: 'month', before: 0, after: 1 });

    popover.destroy();
  });

  it('renders the settings section and wires controls to controller setters', () => {
    const setGranularity = vi.fn();
    const setSpeed = vi.fn();
    const setLoop = vi.fn();
    const setTheme = vi.fn();
    const setDateFormat = vi.fn();
    const setAutoPlay = vi.fn();
    const controller = baseController({
      setGranularity,
      setSpeed,
      setLoop,
      setTheme,
      setDateFormat,
      setAutoPlay,
    });

    const popover = createLayersPopover(controller);
    document.body.appendChild(popover.root);
    const section = popover.root.querySelector('.ts-settings-section') as HTMLElement;
    expect(section).not.toBeNull();

    const selects = section.querySelectorAll('select');
    const [granularitySel, themeSel] = selects;
    granularitySel.value = 'month';
    granularitySel.dispatchEvent(new Event('change'));
    expect(setGranularity).toHaveBeenCalledWith('month');

    themeSel.value = 'dark';
    themeSel.dispatchEvent(new Event('change'));
    expect(setTheme).toHaveBeenCalledWith('dark');

    const speedInput = section.querySelector('input[type="number"]') as HTMLInputElement;
    speedInput.value = '500';
    speedInput.dispatchEvent(new Event('change'));
    expect(setSpeed).toHaveBeenCalledWith(500);

    // Loop / auto-play live in single-checkbox rows (.ts-field-check); the
    // granularity multi-select checkboxes live in .ts-check-group.
    const [loopCheck, autoPlayCheck] = section.querySelectorAll(
      '.ts-field-check input[type="checkbox"]'
    ) as unknown as HTMLInputElement[];
    loopCheck.checked = false;
    loopCheck.dispatchEvent(new Event('change'));
    expect(setLoop).toHaveBeenCalledWith(false);

    autoPlayCheck.checked = true;
    autoPlayCheck.dispatchEvent(new Event('change'));
    expect(setAutoPlay).toHaveBeenCalledWith(true);

    const dateFormatInput = section.querySelector('input[type="text"]') as HTMLInputElement;
    dateFormatInput.value = 'YYYY';
    dateFormatInput.dispatchEvent(new Event('change'));
    expect(setDateFormat).toHaveBeenCalledWith('YYYY');

    popover.destroy();
  });

  it('multi-selects which granularities show on the slider', () => {
    const setGranularities = vi.fn();
    const popover = createLayersPopover(baseController({ setGranularities }));
    document.body.appendChild(popover.root);
    const section = popover.root.querySelector('.ts-settings-section') as HTMLElement;

    const checks = section.querySelectorAll(
      '.ts-check-group input[type="checkbox"]'
    ) as unknown as HTMLInputElement[];
    expect(checks).toHaveLength(4);
    // All four start checked (the mock offers all granularities).
    expect([...checks].every((c) => c.checked)).toBe(true);

    // Unchecking 'hour' applies the remaining three in canonical order.
    checks[0].checked = false;
    checks[0].dispatchEvent(new Event('change'));
    expect(setGranularities).toHaveBeenCalledWith(['day', 'month', 'year']);

    popover.destroy();
  });

  it('refuses to clear the last granularity, reverting the toggle', () => {
    const setGranularities = vi.fn();
    const popover = createLayersPopover(
      baseController({ getGranularities: () => ['day'], setGranularities })
    );
    document.body.appendChild(popover.root);
    const section = popover.root.querySelector('.ts-settings-section') as HTMLElement;
    const dayCheck = section.querySelector(
      '.ts-check-group input[value="day"]'
    ) as HTMLInputElement;

    dayCheck.checked = false;
    dayCheck.dispatchEvent(new Event('change'));
    expect(setGranularities).not.toHaveBeenCalled();
    expect(dayCheck.checked).toBe(true);

    popover.destroy();
  });

  it('offers a None colormap option for multi-band COG imagery', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no network')));
    const addSource = vi.fn(() => 'id');
    const popover = createLayersPopover(baseController({ addSource }));
    document.body.appendChild(popover.root);
    (popover.root.querySelector('.ts-add-data') as HTMLButtonElement).click();

    // COG is the default type; its colormap select should include an empty None.
    const cmap = popover.root.querySelector('.ts-add-form .ts-cmap') as HTMLSelectElement;
    const noneOption = [...cmap.options].find((o) => o.value === '');
    expect(noneOption).toBeDefined();

    const url = popover.root.querySelectorAll(
      '.ts-add-form .ts-form-fields .ts-field input'
    )[2] as HTMLInputElement;
    url.value = 'https://e/{date:YYYY-MM-DD}.tif';
    cmap.value = '';
    (popover.root.querySelector('.ts-add-submit') as HTMLButtonElement).click();

    await vi.waitFor(() => expect(addSource).toHaveBeenCalledTimes(1));
    expect((addSource.mock.calls[0][0] as { colormap?: string }).colormap).toBeUndefined();

    popover.destroy();
  });

  // A mosaic renders client-side through maplibre-gl-raster rather than
  // TiTiler, so its NoData field takes that renderer's auto/off/number
  // vocabulary instead of TiTiler's number/'nan'.
  describe('mosaic NoData field', () => {
    /** Opens the add form on the mosaic type and returns its NoData input. */
    const openMosaicForm = (
      addSource: ReturnType<typeof vi.fn>
    ): { popover: ReturnType<typeof createLayersPopover>; nodata: HTMLInputElement } => {
      const popover = createLayersPopover(baseController({ addSource }));
      document.body.appendChild(popover.root);
      (popover.root.querySelector('.ts-add-data') as HTMLButtonElement).click();

      const typeSelect = popover.root.querySelector(
        '.ts-add-form .ts-type-select'
      ) as HTMLSelectElement;
      typeSelect.value = 'mosaic';
      typeSelect.dispatchEvent(new Event('change'));

      // Locate by label rather than index so adding a field cannot silently
      // point this at the wrong input.
      const rows = [
        ...popover.root.querySelectorAll('.ts-add-form .ts-form-fields .ts-field'),
      ] as HTMLElement[];
      const row = rows.find((r) => r.querySelector('span')?.textContent === 'NoData');
      expect(row, 'the mosaic form must expose a NoData field').toBeDefined();
      return { popover, nodata: row!.querySelector('input') as HTMLInputElement };
    };

    const submittedSpec = (addSource: ReturnType<typeof vi.fn>): { nodata?: unknown } =>
      addSource.mock.calls[0][0] as { nodata?: unknown };

    it.each([
      ['-9999', -9999],
      ['auto', 'auto'],
      ['off', 'off'],
      ['OFF', 'off'],
    ])('parses %o into %o', async (typed, expected) => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no network')));
      const addSource = vi.fn(() => 'id');
      const { popover, nodata } = openMosaicForm(addSource);
      nodata.value = typed;
      (popover.root.querySelector('.ts-add-submit') as HTMLButtonElement).click();

      await vi.waitFor(() => expect(addSource).toHaveBeenCalledTimes(1));
      expect(submittedSpec(addSource).nodata).toBe(expected);
      popover.destroy();
    });

    it.each([
      ['', 'empty'],
      ['not-a-number', 'unparsable'],
    ])('leaves nodata unset for an %s entry', async (typed) => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no network')));
      const addSource = vi.fn(() => 'id');
      const { popover, nodata } = openMosaicForm(addSource);
      nodata.value = typed;
      (popover.root.querySelector('.ts-add-submit') as HTMLButtonElement).click();

      await vi.waitFor(() => expect(addSource).toHaveBeenCalledTimes(1));
      // Undefined, not a guessed value: the renderer then keeps its 'auto'
      // default and honours whatever each COG declares.
      expect(submittedSpec(addSource).nodata).toBeUndefined();
      popover.destroy();
    });
  });
});
