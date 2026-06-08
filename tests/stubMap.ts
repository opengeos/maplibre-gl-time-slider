import { vi } from 'vitest';
import type { Map as MapLibreMap } from 'maplibre-gl';

/**
 * A minimal in-memory stand-in for a MapLibre map, sufficient for exercising
 * adapters and the control without a real GL context. Sources and layers are
 * tracked so getSource/getLayer behave after add calls. Each source carries its
 * own `setTiles` spy.
 */
export interface StubMap {
  map: MapLibreMap;
  sources: Map<string, { setTiles: ReturnType<typeof vi.fn>; data?: unknown }>;
  layers: Map<string, { layer: Record<string, unknown>; beforeId?: string }>;
  container: HTMLElement;
}

/**
 * Creates a stub map plus handles to its internal source/layer registries.
 *
 * @returns The stub map and its tracked state
 */
export function createStubMap(): StubMap {
  const sources = new Map<string, { setTiles: ReturnType<typeof vi.fn>; data?: unknown }>();
  const layers = new Map<string, { layer: Record<string, unknown>; beforeId?: string }>();
  const container = document.createElement('div');
  Object.defineProperty(container, 'getBoundingClientRect', {
    value: () => ({ top: 0, left: 0, right: 800, bottom: 600, width: 800, height: 600 }),
  });

  const controls = new Set<{ onAdd: (m: MapLibreMap) => HTMLElement; onRemove: () => void }>();

  const map = {
    addSource: vi.fn((id: string, src: Record<string, unknown>) => {
      sources.set(id, { setTiles: vi.fn(), data: src.data });
    }),
    getSource: vi.fn((id: string) => sources.get(id)),
    removeSource: vi.fn((id: string) => {
      sources.delete(id);
    }),
    addLayer: vi.fn((layer: Record<string, unknown>, beforeId?: string) => {
      layers.set(layer.id as string, { layer, beforeId });
    }),
    getLayer: vi.fn((id: string) => layers.get(id)?.layer),
    removeLayer: vi.fn((id: string) => {
      layers.delete(id);
    }),
    setPaintProperty: vi.fn(),
    setFilter: vi.fn(),
    getContainer: vi.fn(() => container),
    resize: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  } as unknown as MapLibreMap;

  // Control lifecycle (mirrors MapLibre): addControl invokes onAdd and mounts
  // the returned element into the container.
  Object.assign(map, {
    addControl: vi.fn((control: { onAdd: (m: MapLibreMap) => HTMLElement }) => {
      controls.add(control as never);
      const el = control.onAdd(map);
      container.appendChild(el);
    }),
    removeControl: vi.fn((control: { onRemove: () => void }) => {
      control.onRemove();
      controls.delete(control as never);
    }),
    hasControl: vi.fn((control: unknown) => controls.has(control as never)),
  });

  return { map, sources, layers, container };
}
