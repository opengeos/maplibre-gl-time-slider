import type { CogSourceSpec, SourceSpec } from '../core/types';
import { formatDate } from '../template/dateFormat';
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
 * Builds a colormap `<select>` seeded from {@link COLORMAPS}, keeping any
 * pre-existing custom value as the first option.
 *
 * @param current - The currently selected colormap
 * @returns A select element
 */
function colormapSelect(current?: string): HTMLSelectElement {
  const select = document.createElement('select');
  select.className = 'ts-cmap';
  const values = [...new Set([...COLORMAPS, ...(current ? [current] : [])])].sort();
  for (const cmap of values) {
    const opt = document.createElement('option');
    opt.value = cmap;
    opt.textContent = cmap;
    select.appendChild(opt);
  }
  select.value = current ?? 'viridis';
  return select;
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

  const timeline = buildTimelineSection(controller);

  const list = document.createElement('div');
  list.className = 'ts-layer-list';

  const form = buildForm(controller, () => refresh());

  popover.append(timeline.section, list, form);
  root.append(toggleBtn, popover);

  const close = (): void => root.classList.remove('ts-open');
  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const opening = !root.classList.contains('ts-open');
    root.classList.toggle('ts-open');
    if (opening) timeline.sync();
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
  const interval = field('Interval', '', 'number');
  interval.input.min = '1';
  fields.append(start.row, end.row, interval.row);

  section.append(title, fields);

  const apply = (): void => {
    if (!start.input.value || !end.input.value) return;
    const startDate = new Date(start.input.value);
    const endDate = new Date(end.input.value);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return;
    const step = parseInt(interval.input.value, 10);
    controller.setRange(startDate, endDate, Number.isNaN(step) ? undefined : step);
  };
  start.input.addEventListener('change', apply);
  end.input.addEventListener('change', apply);
  interval.input.addEventListener('change', apply);

  const sync = (): void => {
    const state = controller.getState();
    start.input.value = formatDate(state.startDate, 'YYYY-MM-DD');
    end.input.value = formatDate(state.endDate, 'YYYY-MM-DD');
    interval.input.value = String(state.interval);
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
  const name = document.createElement('span');
  name.className = 'ts-layer-name';
  name.textContent = spec.name ?? spec.id ?? spec.type;
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'ts-layer-remove';
  remove.setAttribute('aria-label', 'Remove layer');
  remove.innerHTML = '&times;';
  remove.addEventListener('click', () => controller.removeSource(spec.id!));
  header.append(name, remove);

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
 * Builds the add-data form: name/id fields, a type selector with type-specific
 * fields (colormap/rescale for COG only), and an Add button. Calls `onAdded`
 * after a successful add.
 */
function buildForm(controller: DockController, onAdded: () => void): HTMLElement {
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

  const tilesField = field('Tile URL', 'https://.../{z}/{x}/{y}.png?d={YYYY}-{MM}-{DD}');
  const dataField = field('GeoJSON URL', 'https://.../data.geojson');
  const timePropField = field('Time property', 'time');
  const baseUrlField = field('WMS base URL', 'https://.../wms?service=WMS');
  const wmsLayersField = field('WMS layers', 'layer-name');

  const groups: Record<SourceSpec['type'], HTMLElement[]> = {
    cog: [urlField.row, cmapRow, rescaleRow, nodataField.row],
    xyz: [tilesField.row],
    geojson: [dataField.row, timePropField.row],
    wms: [baseUrlField.row, wmsLayersField.row],
    custom: [],
  };

  const fieldHost = document.createElement('div');
  fieldHost.className = 'ts-form-fields';

  const renderFields = (): void => {
    fieldHost.replaceChildren(
      nameField.row,
      idField.row,
      ...groups[typeSelect.value as SourceSpec['type']]
    );
  };
  typeSelect.addEventListener('change', renderFields);
  renderFields();

  const readRescale = (): [number, number] | undefined => {
    const lo = parseFloat(rescaleMin.value);
    const hi = parseFloat(rescaleMax.value);
    return !Number.isNaN(lo) && !Number.isNaN(hi) ? [lo, hi] : undefined;
  };

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'time-slider-btn ts-add-submit';
  addBtn.textContent = 'Add layer';
  addBtn.addEventListener('click', () => {
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
    controller.addSource(spec);
    // Reset the form inputs.
    [
      nameField,
      idField,
      urlField,
      nodataField,
      tilesField,
      dataField,
      timePropField,
      baseUrlField,
      wmsLayersField,
    ].forEach((f) => (f.input.value = ''));
    rescaleMin.value = '';
    rescaleMax.value = '';
    cmapSelect.value = 'viridis';
    onAdded();
  });

  form.append(title, typeSelect, fieldHost, addBtn);
  return form;
}
