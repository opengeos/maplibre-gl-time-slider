import type { CogSourceSpec, Granularity, SourceSpec } from '../core/types';
import { formatDate } from '../template/dateFormat';
import { resolveUrl } from '../template/urlTemplate';
import { GRANULARITIES } from '../time/granularity';
import { getTiTilerBounds } from '../utils/titiler';
import type { DockController } from './types';

/**
 * Imperative handle for the layers popover.
 */
export interface LayersHandle {
  root: HTMLElement;
  /** Rebuild the layer list from the controller's sources. */
  refresh(): void;
  /** Remove global listeners. */
  destroy(): void;
}

/**
 * Source types selectable in the add-data form.
 */
const SOURCE_TYPES: { value: SourceSpec['type']; label: string }[] = [
  { value: 'cog', label: 'COG (TiTiler)' },
  { value: 'mosaic', label: 'Mosaic (STAC / MosaicJSON)' },
  { value: 'xyz', label: 'XYZ / WMTS' },
  { value: 'geojson', label: 'GeoJSON' },
  { value: 'wms', label: 'WMS-Time' },
];

/**
 * Common colormaps offered in the colormap dropdown (TiTiler / matplotlib).
 */
const COLORMAPS = [
  'viridis',
  'plasma',
  'inferno',
  'magma',
  'cividis',
  'turbo',
  'jet',
  'rainbow',
  'rdbu',
  'rdylbu',
  'rdylgn',
  'spectral',
  'coolwarm',
  'bwr',
  'seismic',
  'greys',
  'blues',
  'greens',
  'reds',
  'ylorrd',
  'ylgnbu',
  'terrain',
  'gist_earth',
  'ocean',
];

/**
 * Timeline + settings that accompany an example source.
 */
interface ExampleTimeline {
  startDate: string;
  endDate: string;
  granularity: Granularity;
  granularities: Granularity[];
  speed: number;
}

/**
 * A ready-to-run example, one per source type, taken from the bundled examples.
 * Selecting a type in the add-data form pre-fills the form fields *and* applies
 * the matching timeline/settings to the control, so a user can click "Add layer"
 * and immediately see a working layer (or edit the values first).
 */
interface Example {
  timeline: ExampleTimeline;
  /** Add-form field values to pre-fill (keys match the type's fields). */
  fields: Record<string, string>;
}

const EXAMPLES: Record<Exclude<SourceSpec['type'], 'custom'>, Example> = {
  // Annual Landsat false-color composites served through TiTiler (examples/landsat).
  cog: {
    timeline: {
      startDate: '1984-01-01',
      endDate: '2013-01-01',
      granularity: 'year',
      granularities: ['year'],
      speed: 800,
    },
    fields: {
      url: 'https://data.source.coop/giswqs/opengeos/landsat_ts/{date:YYYY}.tif',
      colormap: '',
      rescaleMin: '0',
      rescaleMax: '110',
      nodata: '0',
      bands: '1,2,3',
    },
  },
  // Monthly Sentinel-2 mosaics (STAC FeatureCollections) over the French Alps,
  // one .json per month, rendered as a deck.gl mosaic by maplibre-gl-raster.
  mosaic: {
    timeline: {
      startDate: '2024-05-01',
      endDate: '2024-09-01',
      granularity: 'month',
      granularities: ['month'],
      speed: 1000,
    },
    fields: {
      url: 'https://data.source.coop/giswqs/opengeos/s2_mosaic_ts/s2_{date:YYYY}_{date:MM}.json',
      colormap: '',
      rescaleMin: '',
      rescaleMax: '',
      bands: '',
    },
  },
  // NASA GIBS MODIS Terra True Color WMTS imagery (examples/worldview).
  xyz: {
    timeline: {
      startDate: '2023-08-01',
      endDate: '2023-08-31',
      granularity: 'day',
      granularities: ['day'],
      speed: 600,
    },
    fields: {
      tiles:
        'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor' +
        '/default/{date:YYYY-MM-DD}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg',
    },
  },
  // Significant earthquakes GeoJSON filtered by a time property (examples/vector).
  geojson: {
    timeline: {
      startDate: '2015-01-01',
      endDate: '2015-12-31',
      granularity: 'month',
      granularities: ['month'],
      speed: 1000,
    },
    fields: {
      data: 'https://maplibre.org/maplibre-gl-js/docs/assets/significant-earthquakes-2015.geojson',
      timeProperty: 'time',
      window: 'month',
    },
  },
  // NASA GIBS time-enabled WMS GetMap endpoint (MapLibre fills {bbox-epsg-3857}).
  wms: {
    timeline: {
      startDate: '2023-08-01',
      endDate: '2023-08-31',
      granularity: 'day',
      granularities: ['day'],
      speed: 600,
    },
    fields: {
      baseUrl:
        'https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi?version=1.3.0&service=WMS' +
        '&request=GetMap&format=image/png&transparent=true&CRS=EPSG:3857' +
        '&width=256&height=256&bbox={bbox-epsg-3857}',
      layers: 'MODIS_Terra_CorrectedReflectance_TrueColor',
    },
  },
};

/**
 * Creates a labeled input row.
 *
 * @param label - Field label
 * @param placeholder - Input placeholder
 * @param type - Input type (text, date, number, ...)
 * @returns The row element and its input
 */
function field(
  label: string,
  placeholder = '',
  type = 'text'
): { row: HTMLElement; input: HTMLInputElement } {
  const row = document.createElement('label');
  row.className = 'ts-field';
  const span = document.createElement('span');
  span.textContent = label;
  const input = document.createElement('input');
  input.type = type;
  input.placeholder = placeholder;
  row.append(span, input);
  return { row, input };
}

/**
 * Builds a labeled `<select>` row.
 *
 * @param label - Field label
 * @param options - Option value/label pairs
 * @returns The row element and its select
 */
function selectField(
  label: string,
  options: { value: string; label: string }[]
): { row: HTMLElement; select: HTMLSelectElement } {
  const row = document.createElement('label');
  row.className = 'ts-field';
  const span = document.createElement('span');
  span.textContent = label;
  const select = document.createElement('select');
  for (const o of options) {
    const opt = document.createElement('option');
    opt.value = o.value;
    opt.textContent = o.label;
    select.appendChild(opt);
  }
  row.append(span, select);
  return { row, select };
}

/**
 * Builds a labeled checkbox row (label text after the box).
 *
 * @param label - Field label
 * @returns The row element and its checkbox input
 */
function checkboxField(label: string): { row: HTMLElement; input: HTMLInputElement } {
  const row = document.createElement('label');
  row.className = 'ts-field ts-field-check';
  const input = document.createElement('input');
  input.type = 'checkbox';
  const span = document.createElement('span');
  span.textContent = label;
  row.append(input, span);
  return { row, input };
}

/**
 * Builds a colormap `<select>` seeded from {@link COLORMAPS}, keeping any
 * pre-existing custom value as the first option.
 *
 * @param current - The currently selected colormap (empty/undefined = none)
 * @returns A select element
 */
function colormapSelect(current?: string): HTMLSelectElement {
  const select = document.createElement('select');
  select.className = 'ts-cmap';
  // A "None" option (empty value) leaves the colormap off, which is required for
  // RGB / multi-band imagery.
  const none = document.createElement('option');
  none.value = '';
  none.textContent = 'None (RGB / multi-band)';
  select.appendChild(none);
  const values = [...new Set([...COLORMAPS, ...(current ? [current] : [])])].sort();
  for (const cmap of values) {
    const opt = document.createElement('option');
    opt.value = cmap;
    opt.textContent = cmap;
    select.appendChild(opt);
  }
  // Default to "None" (empty) when no colormap is set, which is correct for
  // RGB / multi-band COGs and avoids implying a colormap that is not applied.
  select.value = current ?? '';
  return select;
}

/** Min/max popover width (px) enforced while dragging the resize grip. */
const POPOVER_MIN_WIDTH = 240;
const POPOVER_MAX_WIDTH = 640;

/**
 * Makes the popover horizontally resizable via a drag grip. The grip is placed
 * on whichever edge is free to grow (opposite the anchored edge), so it works
 * whether the panel is anchored to the left or the right corner.
 *
 * @param popover - The popover element to make resizable
 * @returns A handle with `syncSide` to re-place the grip when the panel opens
 */
function enablePopoverResize(popover: HTMLElement): { syncSide: () => void } {
  const grip = document.createElement('div');
  grip.className = 'ts-resize-grip';
  popover.appendChild(grip);

  // True when the popover is anchored on its right edge, so it grows leftward.
  let growLeft = true;

  /**
   * Determines the free-to-grow direction by comparing how much space the
   * popover has on each side within the dock bounds (the full-width control),
   * falling back to the viewport. The popover grows toward the side with more
   * room, away from the corner it is anchored to. The dock is used rather than
   * the popover's offset parent because that parent is the narrow right cluster,
   * which the popover overflows and which would give a misleading measurement.
   */
  const measureGrowLeft = (): boolean => {
    const rect = popover.getBoundingClientRect();
    const host = popover.closest('.maplibregl-time-slider-dock') as HTMLElement | null;
    const bounds = host ? host.getBoundingClientRect() : { left: 0, right: window.innerWidth };
    return rect.left - bounds.left > bounds.right - rect.right;
  };

  const syncSide = (): void => {
    growLeft = measureGrowLeft();
    grip.classList.toggle('ts-grip-left', growLeft);
    grip.classList.toggle('ts-grip-right', !growLeft);
  };

  let startX = 0;
  let startWidth = 0;

  const onMove = (e: PointerEvent): void => {
    const dx = e.clientX - startX;
    const delta = growLeft ? -dx : dx;
    const width = Math.min(POPOVER_MAX_WIDTH, Math.max(POPOVER_MIN_WIDTH, startWidth + delta));
    popover.style.width = `${width}px`;
  };

  const onUp = (e: PointerEvent): void => {
    grip.releasePointerCapture?.(e.pointerId);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    document.body.classList.remove('ts-resizing');
  };

  grip.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    growLeft = measureGrowLeft();
    startX = e.clientX;
    startWidth = popover.getBoundingClientRect().width;
    grip.setPointerCapture?.(e.pointerId);
    document.body.classList.add('ts-resizing');
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });
  // Clicking the grip should never bubble up to the document close handler.
  grip.addEventListener('click', (e) => e.stopPropagation());

  return { syncSide };
}

/**
 * Builds the "Add data" button plus its popover: a timeline range section, the
 * current layer list (opacity, COG colormap/rescale, remove), and a form to add
 * new sources.
 *
 * @param controller - The control's UI-facing API
 * @returns A layers handle for refreshing and teardown
 */
export function createLayersPopover(controller: DockController): LayersHandle {
  const root = document.createElement('div');
  root.className = 'ts-layers';

  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = 'time-slider-btn ts-add-data';
  toggleBtn.innerHTML = '&#43; Add data';

  const popover = document.createElement('div');
  popover.className = 'ts-popover';
  // Inner scroll container so the resize grip (a child of the popover) stays
  // pinned to the edge instead of scrolling away with the content.
  const scroll = document.createElement('div');
  scroll.className = 'ts-popover-scroll';

  const timeline = buildTimelineSection(controller);
  const settings = buildSettingsSection(controller);

  // Layers section: a titled wrapper so the layer cards read as their own group
  // rather than floating between the Settings and Add-data sections.
  const layersSection = document.createElement('div');
  layersSection.className = 'ts-layers-section';
  const layersTitle = document.createElement('div');
  layersTitle.className = 'ts-layers-title';
  layersTitle.textContent = 'Layers';
  const list = document.createElement('div');
  list.className = 'ts-layer-list';
  layersSection.append(layersTitle, list);

  // Selecting an example applies its timeline/settings to the control, so the
  // Timeline and Settings sections need to re-read state afterwards.
  const form = buildForm(
    controller,
    () => refresh(),
    () => {
      timeline.sync();
      settings.sync();
    }
  );

  // Section order: the add-data form comes first so that selecting a source
  // (which applies the example's timeline/settings) only updates sections below
  // it, never overwriting selections sitting above. Settings and Timeline
  // follow, with the Layers list last.
  scroll.append(form, settings.section, timeline.section, layersSection);
  popover.append(scroll);
  root.append(toggleBtn, popover);

  const resize = enablePopoverResize(popover);

  const close = (): void => root.classList.remove('ts-open');
  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const opening = !root.classList.contains('ts-open');
    root.classList.toggle('ts-open');
    if (opening) {
      timeline.sync();
      settings.sync();
      // The popover only has measurable dimensions once shown, so place the
      // grip on the free edge now.
      resize.syncSide();
    }
  });
  popover.addEventListener('click', (e) => e.stopPropagation());
  const onDocClick = (): void => close();
  document.addEventListener('click', onDocClick);

  const refresh = (): void => {
    list.replaceChildren();
    const sources = controller.getSources();
    if (sources.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'ts-layer-empty';
      empty.textContent = 'No layers yet. Add one below.';
      list.appendChild(empty);
      return;
    }
    for (const spec of sources) {
      list.appendChild(buildLayerRow(controller, spec));
    }
  };

  refresh();

  const destroy = (): void => {
    document.removeEventListener('click', onDocClick);
  };

  return { root, refresh, destroy };
}

/**
 * Builds the timeline range section (start/end dates + interval), wired to the
 * controller's {@link DockController.setRange}.
 */
function buildTimelineSection(controller: DockController): {
  section: HTMLElement;
  sync: () => void;
} {
  const section = document.createElement('div');
  section.className = 'ts-timeline-section';

  const title = document.createElement('div');
  title.className = 'ts-form-title';
  title.textContent = 'Timeline';

  const fields = document.createElement('div');
  fields.className = 'ts-form-fields';
  const start = field('Start date', '', 'date');
  const end = field('End date', '', 'date');
  // A blank end date tracks today, so the timeline always reaches the latest data.
  end.input.title = 'Leave blank to track the current date (always shows the latest data)';
  const interval = field('Interval', '', 'number');
  interval.input.min = '1';
  const initial = field('Initial date', '', 'date');
  fields.append(start.row, end.row, interval.row, initial.row);

  section.append(title, fields);

  const apply = (): void => {
    if (!start.input.value) return;
    const startDate = new Date(start.input.value);
    if (Number.isNaN(startDate.getTime())) return;
    // A blank End date leaves the range open: it defaults to today and stays
    // auto, so the saved project re-resolves to the current date on reload.
    const endDate = end.input.value ? new Date(end.input.value) : null;
    if (endDate && Number.isNaN(endDate.getTime())) return;
    const step = parseInt(interval.input.value, 10);
    controller.setRange(startDate, endDate, Number.isNaN(step) ? undefined : step);
  };
  start.input.addEventListener('change', apply);
  end.input.addEventListener('change', apply);
  interval.input.addEventListener('change', apply);
  initial.input.addEventListener('change', () => {
    if (!initial.input.value) return;
    const date = new Date(initial.input.value);
    if (!Number.isNaN(date.getTime())) controller.goTo(date);
  });

  const sync = (): void => {
    const state = controller.getState();
    start.input.value = formatDate(state.startDate, 'YYYY-MM-DD');
    // Leave End blank when the range is open so editing Start keeps it open
    // rather than silently pinning the end to today's resolved value.
    end.input.value = state.endDateAuto ? '' : formatDate(state.endDate, 'YYYY-MM-DD');
    interval.input.value = String(state.interval);
    initial.input.value = formatDate(state.currentDate, 'YYYY-MM-DD');
  };
  sync();

  return { section, sync };
}

/**
 * Builds the settings section, exposing the tweakable constructor options in one
 * place: granularity, playback speed, loop, theme, date-label format, and
 * auto-play. Each control is wired to a live controller setter.
 *
 * @param controller - The control's UI-facing API
 * @returns The section element and a `sync` to refresh values from state
 */
function buildSettingsSection(controller: DockController): {
  section: HTMLElement;
  sync: () => void;
} {
  const section = document.createElement('div');
  section.className = 'ts-settings-section';

  const title = document.createElement('div');
  title.className = 'ts-form-title';
  title.textContent = 'Settings';

  const fields = document.createElement('div');
  fields.className = 'ts-form-fields';

  const label = (g: Granularity): string => g[0].toUpperCase() + g.slice(1);

  const granularity = selectField('Granularity', []);
  granularity.select.addEventListener('change', () =>
    controller.setGranularity(granularity.select.value as Granularity)
  );

  // Multi-select of which granularities appear as pills on the slider.
  const granRow = document.createElement('div');
  granRow.className = 'ts-field';
  const granLabel = document.createElement('span');
  granLabel.textContent = 'Show on slider';
  const granGroup = document.createElement('div');
  granGroup.className = 'ts-check-group';
  const granChecks = new Map<Granularity, HTMLInputElement>();
  for (const g of GRANULARITIES) {
    const item = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = g;
    const text = document.createElement('span');
    text.textContent = label(g);
    item.append(input, text);
    granGroup.appendChild(item);
    granChecks.set(g, input);
    input.addEventListener('change', () => {
      const selected = GRANULARITIES.filter((x) => granChecks.get(x)!.checked);
      if (selected.length === 0) {
        // Never allow an empty set; revert this toggle.
        input.checked = true;
        return;
      }
      controller.setGranularities(selected);
      syncGranularitySelect();
    });
  }
  granRow.append(granLabel, granGroup);

  const speed = field('Speed (ms/step)', '', 'number');
  speed.input.min = '100';
  speed.input.step = '100';
  speed.input.addEventListener('change', () => {
    const value = parseInt(speed.input.value, 10);
    if (!Number.isNaN(value)) controller.setSpeed(value);
  });

  const loop = checkboxField('Loop playback');
  loop.input.addEventListener('change', () => controller.setLoop(loop.input.checked));

  const theme = selectField('Theme', [
    { value: 'auto', label: 'Auto' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
  ]);
  theme.select.addEventListener('change', () =>
    controller.setTheme(theme.select.value as 'auto' | 'light' | 'dark')
  );

  const dateFormat = field('Date format', '');
  dateFormat.input.addEventListener('change', () =>
    controller.setDateFormat(dateFormat.input.value.trim() || undefined)
  );

  const autoPlay = checkboxField('Auto-play on load');
  autoPlay.input.addEventListener('change', () => controller.setAutoPlay(autoPlay.input.checked));

  fields.append(
    granularity.row,
    granRow,
    speed.row,
    loop.row,
    theme.row,
    dateFormat.row,
    autoPlay.row
  );
  section.append(title, fields);

  // Repopulate the active-granularity options from the currently offered set.
  const syncGranularitySelect = (): void => {
    const offered = controller.getGranularities();
    const active = controller.getState().granularity;
    granularity.select.replaceChildren();
    for (const g of offered) {
      const opt = document.createElement('option');
      opt.value = g;
      opt.textContent = label(g);
      granularity.select.appendChild(opt);
    }
    granularity.select.value = active;
  };

  const sync = (): void => {
    const state = controller.getState();
    syncGranularitySelect();
    const offered = controller.getGranularities();
    granChecks.forEach((input, g) => (input.checked = offered.includes(g)));
    speed.input.value = String(state.speed);
    loop.input.checked = state.loop;
    theme.select.value = controller.getTheme();
    dateFormat.input.placeholder = controller.getDateFormat();
    autoPlay.input.checked = controller.getAutoPlay();
  };
  sync();

  return { section, sync };
}

/**
 * Builds a single row in the layer list with opacity, COG colormap/rescale
 * (when applicable), and a remove button.
 */
function buildLayerRow(controller: DockController, spec: SourceSpec): HTMLElement {
  const row = document.createElement('div');
  row.className = 'ts-layer-row';

  const header = document.createElement('div');
  header.className = 'ts-layer-head';

  const layerLabel = spec.name ?? spec.id ?? spec.type;

  // Visibility toggle: hides/shows the layer without removing it.
  const visible = document.createElement('label');
  visible.className = 'ts-layer-visible';
  visible.title = 'Toggle visibility';
  const visibleInput = document.createElement('input');
  visibleInput.type = 'checkbox';
  visibleInput.checked = spec.visible !== false;
  visibleInput.setAttribute('aria-label', `Toggle visibility for ${layerLabel}`);
  visibleInput.addEventListener('change', () =>
    controller.setSourceProperty(spec.id!, {
      visible: visibleInput.checked,
    } as Partial<SourceSpec>)
  );
  visible.appendChild(visibleInput);

  const name = document.createElement('span');
  name.className = 'ts-layer-name';
  name.textContent = layerLabel;
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'ts-layer-remove';
  remove.setAttribute('aria-label', 'Remove layer');
  remove.innerHTML = '&times;';
  remove.addEventListener('click', () => controller.removeSource(spec.id!));
  header.append(visible, name, remove);

  const opacity = document.createElement('input');
  opacity.type = 'range';
  opacity.className = 'ts-opacity';
  opacity.min = '0';
  opacity.max = '1';
  opacity.step = '0.05';
  opacity.value = String(spec.opacity ?? 1);
  opacity.title = 'Opacity';
  opacity.addEventListener('input', () =>
    controller.setSourceProperty(spec.id!, {
      opacity: Number(opacity.value),
    } as Partial<SourceSpec>)
  );

  row.append(header, opacity);

  // Colormap + rescale apply to COG layers only.
  if (spec.type === 'cog') {
    row.appendChild(buildCogControls(controller, spec));
  }

  return row;
}

/**
 * Builds COG-specific colormap (dropdown) and rescale controls for a layer row.
 */
function buildCogControls(controller: DockController, spec: CogSourceSpec): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'ts-cog-controls';

  const cmap = colormapSelect(spec.colormap);
  cmap.addEventListener('change', () =>
    controller.setSourceProperty(spec.id!, { colormap: cmap.value } as Partial<SourceSpec>)
  );

  const min = document.createElement('input');
  min.type = 'number';
  min.className = 'ts-rescale-min';
  min.placeholder = 'min';
  if (spec.rescale) min.value = String(spec.rescale[0]);

  const max = document.createElement('input');
  max.type = 'number';
  max.className = 'ts-rescale-max';
  max.placeholder = 'max';
  if (spec.rescale) max.value = String(spec.rescale[1]);

  const applyRescale = (): void => {
    const lo = parseFloat(min.value);
    const hi = parseFloat(max.value);
    if (!Number.isNaN(lo) && !Number.isNaN(hi)) {
      controller.setSourceProperty(spec.id!, { rescale: [lo, hi] } as Partial<SourceSpec>);
    }
  };
  min.addEventListener('change', applyRescale);
  max.addEventListener('change', applyRescale);

  const nodata = document.createElement('input');
  nodata.type = 'text';
  nodata.className = 'ts-nodata';
  nodata.placeholder = 'nodata';
  if (spec.nodata !== undefined) nodata.value = String(spec.nodata);
  nodata.addEventListener('change', () =>
    controller.setSourceProperty(spec.id!, {
      nodata: nodata.value || undefined,
    } as Partial<SourceSpec>)
  );

  wrap.append(cmap, min, max, nodata);
  return wrap;
}

/**
 * Fits the map to a freshly added source's extent so the new layer lands in
 * view. COG specs carry the TiTiler footprint fetched when the layer is added,
 * and any source may supply an explicit `bounds`; GeoJSON bounds are derived
 * from the feature coordinates. Tiled sources (XYZ/WMS) have no intrinsic
 * extent, so they are left untouched. All failures are non-fatal.
 *
 * @param controller - The control's UI-facing API
 * @param spec - The source that was just added
 */
async function fitToSourceBounds(controller: DockController, spec: SourceSpec): Promise<void> {
  const map = controller.getMap();
  if (!map) return;
  let bounds = isLngLatBounds(spec.bounds) ? spec.bounds : undefined;
  if (!bounds && spec.type === 'geojson') {
    bounds = await computeGeoJsonBounds(spec.data).catch(() => undefined);
  }
  if (!bounds) return;
  map.fitBounds(bounds, { padding: 40, duration: 600, maxZoom: 16 });
}

/**
 * Narrows a value to a finite `[west, south, east, north]` extent.
 *
 * @param value - A candidate bounds value
 * @returns The bounds when valid, otherwise undefined
 */
function isLngLatBounds(value: unknown): [number, number, number, number] | undefined {
  return Array.isArray(value) && value.length === 4 && value.every((n) => Number.isFinite(n))
    ? (value as [number, number, number, number])
    : undefined;
}

/**
 * Computes a `[west, south, east, north]` extent for GeoJSON data, fetching it
 * first when given a URL. Returns undefined when the data has no coordinates.
 *
 * @param data - A GeoJSON object or a URL string pointing to one
 * @returns The extent, or undefined when it cannot be determined
 */
async function computeGeoJsonBounds(
  data: unknown
): Promise<[number, number, number, number] | undefined> {
  const geojson = typeof data === 'string' ? ((await (await fetch(data)).json()) as unknown) : data;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const visit = (coords: unknown): void => {
    if (Array.isArray(coords) && typeof coords[0] === 'number') {
      const [x, y] = coords as number[];
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    } else if (Array.isArray(coords)) {
      for (const child of coords) visit(child);
    }
  };
  const visitGeometry = (geometry: unknown): void => {
    if (!geometry || typeof geometry !== 'object') return;
    const g = geometry as { type?: string; coordinates?: unknown; geometries?: unknown };
    if (g.type === 'GeometryCollection' && Array.isArray(g.geometries)) {
      g.geometries.forEach(visitGeometry);
    } else if (g.coordinates !== undefined) {
      visit(g.coordinates);
    }
  };
  if (geojson && typeof geojson === 'object') {
    const obj = geojson as { type?: string; features?: unknown; geometry?: unknown };
    if (obj.type === 'FeatureCollection' && Array.isArray(obj.features)) {
      obj.features.forEach((f) => visitGeometry((f as { geometry?: unknown }).geometry));
    } else if (obj.type === 'Feature') {
      visitGeometry(obj.geometry);
    } else {
      visitGeometry(obj);
    }
  }
  return isLngLatBounds([minX, minY, maxX, maxY]);
}

/**
 * Builds the add-data form: name/id fields, a type selector with type-specific
 * fields (colormap/rescale/bands for COG only), and an Add button. Selecting a
 * type pre-fills the matching example and applies its timeline/settings.
 *
 * @param controller - The control's UI-facing API
 * @param onAdded - Called after a source is successfully added
 * @param onConfigApplied - Called after an example's timeline/settings are
 *   applied, so other sections can re-read control state
 */
function buildForm(
  controller: DockController,
  onAdded: () => void,
  onConfigApplied: () => void
): HTMLElement {
  const form = document.createElement('div');
  form.className = 'ts-add-form';

  const title = document.createElement('div');
  title.className = 'ts-form-title';
  title.textContent = 'Add a data source';

  const typeSelect = document.createElement('select');
  typeSelect.className = 'ts-type-select';
  for (const t of SOURCE_TYPES) {
    const opt = document.createElement('option');
    opt.value = t.value;
    opt.textContent = t.label;
    typeSelect.appendChild(opt);
  }

  // Common fields.
  const nameField = field('Name', 'My layer');
  const idField = field('ID (optional)', 'auto-generated');

  // Per-type fields.
  const urlField = field('COG URL', 'https://.../{date:YYYY-MM-DD}.tif');
  // Mosaic manifest URL (MosaicJSON or STAC FeatureCollection), one per date.
  const mosaicUrlField = field('Mosaic URL', 'https://.../{date:YYYY}/{date:MM}/mosaic.json');
  const cmapRow = document.createElement('label');
  cmapRow.className = 'ts-field';
  const cmapSpan = document.createElement('span');
  cmapSpan.textContent = 'Colormap';
  const cmapSelect = colormapSelect('viridis');
  cmapRow.append(cmapSpan, cmapSelect);
  const rescaleRow = document.createElement('div');
  rescaleRow.className = 'ts-field ts-rescale-field';
  const rescaleSpan = document.createElement('span');
  rescaleSpan.textContent = 'Rescale (min / max)';
  const rescaleInputs = document.createElement('div');
  rescaleInputs.className = 'ts-cog-controls';
  const rescaleMin = document.createElement('input');
  rescaleMin.type = 'number';
  rescaleMin.placeholder = 'min';
  const rescaleMax = document.createElement('input');
  rescaleMax.type = 'number';
  rescaleMax.placeholder = 'max';
  rescaleInputs.append(rescaleMin, rescaleMax);
  rescaleRow.append(rescaleSpan, rescaleInputs);
  const nodataField = field('NoData', 'nan or number');
  // Comma-separated 1-based band indexes, e.g. "1,2,3" for an RGB composite.
  const bandsField = field('Bands (optional)', 'e.g. 1,2,3');

  const tilesField = field('Tile URL', 'https://.../{z}/{x}/{y}.png?d={YYYY}-{MM}-{DD}');
  const dataField = field('GeoJSON URL', 'https://.../data.geojson');
  const timePropField = field('Time property', 'time');
  // Time window: features are kept for `[date, date + 1 unit)`. Defaults to the
  // granularity so features match the active timeline step (a day window with a
  // monthly timeline would show almost nothing).
  const windowField = selectField(
    'Time window',
    GRANULARITIES.map((g) => ({ value: g, label: g[0].toUpperCase() + g.slice(1) }))
  );
  windowField.select.value = 'day';
  const baseUrlField = field('WMS base URL', 'https://.../wms?service=WMS');
  const wmsLayersField = field('WMS layers', 'layer-name');

  const groups: Record<SourceSpec['type'], HTMLElement[]> = {
    cog: [urlField.row, cmapRow, rescaleRow, nodataField.row, bandsField.row],
    // Shares the colormap/rescale/bands rows with COG (only one group is shown
    // at a time, so re-parenting the same nodes is safe); no TiTiler NoData.
    mosaic: [mosaicUrlField.row, cmapRow, rescaleRow, bandsField.row],
    xyz: [tilesField.row],
    geojson: [dataField.row, timePropField.row, windowField.row],
    wms: [baseUrlField.row, wmsLayersField.row],
    custom: [],
  };

  const fieldHost = document.createElement('div');
  fieldHost.className = 'ts-form-fields';

  // Pre-fill the example field values for the selected type, but only when the
  // primary URL field is still empty so a user's own input is never overwritten
  // when they switch types back and forth.
  const applyExampleFields = (type: SourceSpec['type']): void => {
    if (type === 'cog' && !urlField.input.value) {
      const f = EXAMPLES.cog.fields;
      urlField.input.value = f.url;
      cmapSelect.value = f.colormap;
      rescaleMin.value = f.rescaleMin;
      rescaleMax.value = f.rescaleMax;
      nodataField.input.value = f.nodata;
      bandsField.input.value = f.bands;
    } else if (type === 'mosaic' && !mosaicUrlField.input.value) {
      const f = EXAMPLES.mosaic.fields;
      mosaicUrlField.input.value = f.url;
      cmapSelect.value = f.colormap;
      rescaleMin.value = f.rescaleMin;
      rescaleMax.value = f.rescaleMax;
      bandsField.input.value = f.bands;
    } else if (type === 'xyz' && !tilesField.input.value) {
      tilesField.input.value = EXAMPLES.xyz.fields.tiles;
    } else if (type === 'geojson' && !dataField.input.value) {
      const f = EXAMPLES.geojson.fields;
      dataField.input.value = f.data;
      timePropField.input.value = f.timeProperty;
      windowField.select.value = f.window;
    } else if (type === 'wms' && !baseUrlField.input.value) {
      const f = EXAMPLES.wms.fields;
      baseUrlField.input.value = f.baseUrl;
      wmsLayersField.input.value = f.layers;
    }
  };

  // Apply the example's timeline + settings to the control. Only triggered by an
  // explicit type change (not the initial render), so it never clobbers the
  // host page's own configuration when the panel first opens.
  const applyExampleConfig = (type: SourceSpec['type']): void => {
    if (type === 'custom') return;
    const t = EXAMPLES[type].timeline;
    controller.setGranularities(t.granularities);
    controller.setRange(t.startDate, t.endDate, 1, t.granularity);
    controller.setSpeed(t.speed);
    // Start every example at its start date rather than wherever the previous
    // current date happens to snap to within the new range.
    controller.goTo(new Date(t.startDate));
    onConfigApplied();
  };

  const renderFields = (): void => {
    const type = typeSelect.value as SourceSpec['type'];
    applyExampleFields(type);
    fieldHost.replaceChildren(nameField.row, idField.row, ...groups[type]);
  };
  typeSelect.addEventListener('change', () => {
    renderFields();
    applyExampleConfig(typeSelect.value as SourceSpec['type']);
  });
  renderFields();

  const readRescale = (): [number, number] | undefined => {
    const lo = parseFloat(rescaleMin.value);
    const hi = parseFloat(rescaleMax.value);
    return !Number.isNaN(lo) && !Number.isNaN(hi) ? [lo, hi] : undefined;
  };

  // Parse the comma-separated band field into 1-based indexes (e.g. "1,2,3").
  const readBands = (): number[] | undefined => {
    const bands = bandsField.input.value
      .split(',')
      .map((b) => parseInt(b.trim(), 10))
      .filter((b) => Number.isInteger(b) && b > 0);
    return bands.length > 0 ? bands : undefined;
  };

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'time-slider-btn ts-add-submit';
  addBtn.textContent = 'Add layer';
  addBtn.addEventListener('click', async () => {
    const type = typeSelect.value as SourceSpec['type'];
    const name = nameField.input.value || undefined;
    const id = idField.input.value || undefined;
    let spec: SourceSpec | null = null;
    if (type === 'cog' && urlField.input.value) {
      spec = {
        type: 'cog',
        id,
        name,
        url: urlField.input.value,
        colormap: cmapSelect.value || undefined,
        rescale: readRescale(),
        nodata: nodataField.input.value || undefined,
        bidx: readBands(),
      };
    } else if (type === 'mosaic' && mosaicUrlField.input.value) {
      spec = {
        type: 'mosaic',
        id,
        name,
        url: mosaicUrlField.input.value,
        colormap: cmapSelect.value || undefined,
        rescale: readRescale(),
        bidx: readBands(),
      };
    } else if (type === 'xyz' && tilesField.input.value) {
      spec = { type: 'xyz', id, name, tiles: tilesField.input.value };
    } else if (type === 'geojson' && dataField.input.value) {
      spec = {
        type: 'geojson',
        id,
        name,
        data: dataField.input.value,
        timeProperty: timePropField.input.value || 'time',
        window: { unit: windowField.select.value as Granularity, before: 0, after: 1 },
      };
    } else if (type === 'wms' && baseUrlField.input.value) {
      spec = {
        type: 'wms',
        id,
        name,
        baseUrl: baseUrlField.input.value,
        layers: wmsLayersField.input.value || undefined,
      };
    }
    if (!spec) return;

    // For COG, fetch the data footprint from TiTiler so MapLibre only requests
    // tiles inside the COG (out-of-bounds tiles 404 and flood the console). The
    // URL is resolved for the current date; failures are non-fatal.
    if (spec.type === 'cog') {
      const resolved = resolveUrl(spec.url, controller.getState().currentDate);
      const cogUrl = resolved instanceof Promise ? await resolved.catch(() => undefined) : resolved;
      if (cogUrl) {
        addBtn.disabled = true;
        addBtn.textContent = 'Loading...';
        try {
          spec.bounds = await getTiTilerBounds(cogUrl, spec.endpoint);
        } catch {
          // Add without bounds if the footprint cannot be determined.
        } finally {
          addBtn.disabled = false;
          addBtn.textContent = 'Add layer';
        }
      }
    }

    controller.addSource(spec);
    // Zoom to the new layer's extent so it is immediately in view. COG specs
    // carry the TiTiler footprint fetched above; any source may also supply an
    // explicit `bounds`. Tiled sources (XYZ/WMS) have no intrinsic extent.
    // Fire-and-forget: keep the zoom non-fatal so a failed fit cannot surface
    // as an unhandled rejection.
    void fitToSourceBounds(controller, spec).catch(() => undefined);
    // The form fields are intentionally left as-is so the user can tweak and add
    // related layers without re-entering shared values.
    onAdded();
  });

  form.append(title, typeSelect, fieldHost, addBtn);
  return form;
}
