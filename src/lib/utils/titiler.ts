/**
 * Options for building a TiTiler tile URL.
 */
export interface TiTilerOptions {
  /**
   * URL to the Cloud Optimized GeoTIFF (COG) file.
   */
  url: string;

  /**
   * TiTiler endpoint URL.
   * @default 'https://titiler.xyz'
   */
  endpoint?: string;

  /**
   * Min and max values for rescaling the data.
   * @example [0, 255]
   */
  rescale?: [number, number];

  /**
   * Colormap name to apply.
   * @see https://cogeotiff.github.io/rio-tiler/colormap/
   * @default 'viridis'
   */
  colormap?: string;

  /**
   * Band indexes to read (1-based).
   * @example [1] for single band, [1, 2, 3] for RGB
   */
  bidx?: number[];

  /**
   * NoData value to use. Can be a number or 'nan' for NaN values.
   */
  nodata?: number | string;

  /**
   * Resampling method.
   * @default 'nearest'
   */
  resampling?: 'nearest' | 'bilinear' | 'cubic' | 'lanczos';

  /**
   * Return data as masked array.
   * @default true
   */
  return_mask?: boolean;
}

/**
 * Builds a TiTiler XYZ tile URL for use with MapLibre GL raster sources.
 *
 * TiTiler is an open-source dynamic tile server for Cloud Optimized GeoTIFFs (COGs).
 * This function constructs a tile URL template that can be used with MapLibre's
 * raster source type.
 *
 * @param options - Options for building the tile URL
 * @returns A tile URL template with {z}, {x}, {y} placeholders
 *
 * @example
 * ```typescript
 * // Basic usage with default viridis colormap
 * const tileUrl = buildTiTilerTileUrl({
 *   url: 'https://example.com/my-cog.tif',
 * });
 *
 * // With custom options
 * const tileUrl = buildTiTilerTileUrl({
 *   url: 'https://example.com/my-cog.tif',
 *   endpoint: 'https://titiler.xyz',
 *   colormap: 'rdbu',
 *   rescale: [-10, 10],
 *   bidx: [1],
 * });
 *
 * // Use with MapLibre
 * map.addSource('raster-source', {
 *   type: 'raster',
 *   tiles: [tileUrl],
 *   tileSize: 256,
 * });
 * ```
 */
export function buildTiTilerTileUrl(options: TiTilerOptions): string {
  const {
    url,
    endpoint = 'https://titiler.xyz',
    colormap = 'viridis',
    rescale,
    bidx,
    nodata,
    resampling,
    return_mask = true,
  } = options;

  // Build query parameters
  const params = new URLSearchParams();

  // Required: COG URL
  params.set('url', url);

  // Optional parameters
  if (colormap) {
    params.set('colormap_name', colormap);
  }

  if (rescale) {
    params.set('rescale', `${rescale[0]},${rescale[1]}`);
  }

  if (bidx && bidx.length > 0) {
    bidx.forEach((b) => params.append('bidx', b.toString()));
  }

  if (nodata !== undefined) {
    params.set('nodata', nodata.toString());
  }

  if (resampling) {
    params.set('resampling', resampling);
  }

  if (return_mask) {
    params.set('return_mask', 'true');
  }

  // Build the tile URL template
  const baseUrl = endpoint.replace(/\/$/, '');
  return `${baseUrl}/cog/tiles/WebMercatorQuad/{z}/{x}/{y}@1x.png?${params.toString()}`;
}

/**
 * Fetches the bounds of a COG file from TiTiler.
 *
 * @param url - URL to the COG file
 * @param endpoint - TiTiler endpoint URL
 * @returns Promise resolving to the bounds [minX, minY, maxX, maxY]
 *
 * @example
 * ```typescript
 * const bounds = await getTiTilerBounds('https://example.com/my-cog.tif');
 * map.fitBounds(bounds);
 * ```
 */
export async function getTiTilerBounds(
  url: string,
  endpoint = 'https://titiler.xyz'
): Promise<[number, number, number, number]> {
  const baseUrl = endpoint.replace(/\/$/, '');
  const infoUrl = `${baseUrl}/cog/bounds?url=${encodeURIComponent(url)}`;

  const response = await fetch(infoUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch bounds: ${response.statusText}`);
  }

  const data = await response.json();
  return data.bounds as [number, number, number, number];
}

/**
 * Fetches metadata/info about a COG file from TiTiler.
 *
 * @param url - URL to the COG file
 * @param endpoint - TiTiler endpoint URL
 * @returns Promise resolving to the COG info
 *
 * @example
 * ```typescript
 * const info = await getTiTilerInfo('https://example.com/my-cog.tif');
 * console.log(info.band_metadata);
 * ```
 */
export async function getTiTilerInfo(
  url: string,
  endpoint = 'https://titiler.xyz'
): Promise<Record<string, unknown>> {
  const baseUrl = endpoint.replace(/\/$/, '');
  const infoUrl = `${baseUrl}/cog/info?url=${encodeURIComponent(url)}`;

  const response = await fetch(infoUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch info: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Fetches statistics about a COG file from TiTiler.
 *
 * @param url - URL to the COG file
 * @param endpoint - TiTiler endpoint URL
 * @returns Promise resolving to the COG statistics
 *
 * @example
 * ```typescript
 * const stats = await getTiTilerStatistics('https://example.com/my-cog.tif');
 * const { min, max } = stats['b1'];
 * ```
 */
export async function getTiTilerStatistics(
  url: string,
  endpoint = 'https://titiler.xyz'
): Promise<Record<string, { min: number; max: number; mean: number; std: number }>> {
  const baseUrl = endpoint.replace(/\/$/, '');
  const statsUrl = `${baseUrl}/cog/statistics?url=${encodeURIComponent(url)}`;

  const response = await fetch(statsUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch statistics: ${response.statusText}`);
  }

  return response.json();
}
