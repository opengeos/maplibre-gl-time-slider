import type { CogSourceSpec, SourceSpec } from '../core/types';
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
 * Creates a labeled text input row for the add-data form.
 */
function field(label: string, placeholder = ''): { row: HTMLElement; input: HTMLInputElement } {
  const row = document.createElement('label');
  row.className = 'ts-field';
  const span = document.createElement('span');
  span.textContent = label;
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = placeholder;
  row.append(span, input);
  return { row, input };
}

/**
 * Builds the "Add data" button plus its popover, containing the current layer
 * list (opacity, COG colormap/rescale, remove) and a form to add new sources.
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

  const list = document.createElement('div');
  list.className = 'ts-layer-list';

  const form = buildForm(controller, () => refresh());

  popover.append(list, form);
  root.append(toggleBtn, popover);

  const close = (): void => root.classList.remove('ts-open');
  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    root.classList.toggle('ts-open');
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

  if (spec.type === 'cog') {
    row.appendChild(buildCogControls(controller, spec));
  }

  return row;
}

/**
 * Builds COG-specific colormap and rescale controls for a layer row.
 */
function buildCogControls(controller: DockController, spec: CogSourceSpec): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'ts-cog-controls';

  const cmap = document.createElement('input');
  cmap.type = 'text';
  cmap.className = 'ts-cmap';
  cmap.placeholder = 'colormap';
  cmap.value = spec.colormap ?? '';
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

  wrap.append(cmap, min, max);
  return wrap;
}

/**
 * Builds the add-data form: a type selector plus type-specific fields and an
 * Add button. Calls `onAdded` after a successful add.
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

  const nameField = field('Name', 'My layer');

  // Per-type field sets.
  const urlField = field('COG URL', 'https://.../{date:YYYY-MM-DD}.tif');
  const cmapField = field('Colormap', 'viridis');
  const tilesField = field('Tile URL', 'https://.../{z}/{x}/{y}.png?d={YYYY}-{MM}-{DD}');
  const dataField = field('GeoJSON URL', 'https://.../data.geojson');
  const timePropField = field('Time property', 'time');
  const baseUrlField = field('WMS base URL', 'https://.../wms?service=WMS');
  const wmsLayersField = field('WMS layers', 'layer-name');

  const groups: Record<SourceSpec['type'], HTMLElement[]> = {
    cog: [urlField.row, cmapField.row],
    xyz: [tilesField.row],
    geojson: [dataField.row, timePropField.row],
    wms: [baseUrlField.row, wmsLayersField.row],
    custom: [],
  };

  const fieldHost = document.createElement('div');
  fieldHost.className = 'ts-form-fields';

  const renderFields = (): void => {
    fieldHost.replaceChildren(nameField.row, ...groups[typeSelect.value as SourceSpec['type']]);
  };
  typeSelect.addEventListener('change', renderFields);
  renderFields();

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'time-slider-btn ts-add-submit';
  addBtn.textContent = 'Add layer';
  addBtn.addEventListener('click', () => {
    const type = typeSelect.value as SourceSpec['type'];
    const name = nameField.input.value || undefined;
    let spec: SourceSpec | null = null;
    if (type === 'cog' && urlField.input.value) {
      spec = {
        type: 'cog',
        name,
        url: urlField.input.value,
        colormap: cmapField.input.value || undefined,
      };
    } else if (type === 'xyz' && tilesField.input.value) {
      spec = { type: 'xyz', name, tiles: tilesField.input.value };
    } else if (type === 'geojson' && dataField.input.value) {
      spec = {
        type: 'geojson',
        name,
        data: dataField.input.value,
        timeProperty: timePropField.input.value || 'time',
      };
    } else if (type === 'wms' && baseUrlField.input.value) {
      spec = {
        type: 'wms',
        name,
        baseUrl: baseUrlField.input.value,
        layers: wmsLayersField.input.value || undefined,
      };
    }
    if (!spec) return;
    controller.addSource(spec);
    // Reset the text inputs.
    [
      nameField,
      urlField,
      cmapField,
      tilesField,
      dataField,
      timePropField,
      baseUrlField,
      wmsLayersField,
    ].forEach((f) => (f.input.value = ''));
    onAdded();
  });

  form.append(title, typeSelect, fieldHost, addBtn);
  return form;
}
