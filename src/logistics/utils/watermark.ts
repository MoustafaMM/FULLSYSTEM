/**
 * Canvas2D Hardware-Accelerated Watermarking Utility
 * Pioneer-4ss Logistics Platform
 */

export interface GpsLocationResult {
  locationStr: string;
  latitude?: number;
  longitude?: number;
}

/**
 * In-memory cache for GPS coordinates to eliminate cold-lock delays on sequential operations
 */
interface CachedGpsLocation {
  result: GpsLocationResult;
  timestamp: number;
}

let cachedGps: CachedGpsLocation | null = null;
const GPS_CACHE_TTL_MS = 60 * 1000; // 60-second in-memory freshness window

export const MAX_IMAGE_DIMENSION = 1600;
export const COMPRESSION_QUALITY = 0.80;

/**
 * Returns the currently cached GPS location if valid, or null if expired/unset
 */
export const getCachedGpsLocation = (): GpsLocationResult | null => {
  if (cachedGps && Date.now() - cachedGps.timestamp < GPS_CACHE_TTL_MS) {
    return cachedGps.result;
  }
  return null;
};

/**
 * Internal helper to query navigator.geolocation as a promise with custom options
 */
const queryPosition = (options: PositionOptions): Promise<GeolocationPosition> => {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
};

/**
 * Fetches the current GPS coordinates and formatted location string
 * Uses a resilient, high-performance two-tier strategy with caching:
 * 1. Serves 60s cached location immediately if available
 * 2. High Accuracy with tight 3.5s timeout (prevents long stalls indoors/under canopy)
 * 3. Fast Network positioning fallback (4s timeout)
 * 4. Non-blocking reverse geocoding with 600ms budget to prevent network stalls
 */
export const getCurrentGpsLocation = async (forceRefresh = false): Promise<GpsLocationResult> => {
  if (!('geolocation' in navigator)) {
    throw new Error('Geolocation is not supported by your browser. GPS access is mandatory for visual audits.');
  }

  // Fast-path: return cached location if within freshness threshold and forceRefresh is false
  if (!forceRefresh && cachedGps && Date.now() - cachedGps.timestamp < GPS_CACHE_TTL_MS) {
    return cachedGps.result;
  }

  let position: GeolocationPosition;

  try {
    // Attempt 1: High Accuracy with 60s cache tolerance and 3.5s timeout
    position = await queryPosition({
      enableHighAccuracy: true,
      timeout: 3500,
      maximumAge: 60000,
    });
  } catch (err: any) {
    // If permission was explicitly denied, fail immediately
    if (err.code === 1) {
      throw new Error('Location permission denied. GPS access is mandatory for visual audits. Please enable location permissions in browser settings.');
    }

    // Attempt 2: Fall back to standard network/cellular/Wi-Fi positioning if GPS timed out or satellite signal was unavailable
    console.warn('High-accuracy GPS timed out or unavailable, attempting standard network location fallback...');
    try {
      position = await queryPosition({
        enableHighAccuracy: false,
        timeout: 4000,
        maximumAge: 60000,
      });
    } catch (fallbackErr: any) {
      console.error('All geolocation attempts failed:', fallbackErr);
      if (fallbackErr.code === 1) {
        throw new Error('Location permission denied. GPS access is mandatory for visual audits. Please enable location permissions.');
      } else if (fallbackErr.code === 2) {
        throw new Error('GPS location unavailable. Please ensure device location services are enabled.');
      } else {
        throw new Error('GPS location request timed out. Please ensure location services are enabled and try again.');
      }
    }
  }

  const lat = position.coords.latitude;
  const lng = position.coords.longitude;
  const coordStr = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

  try {
    // Attempt fast reverse geocoding with 600ms budget to prevent delaying photo uploads
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 600);

    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      const displayName = data.display_name;
      if (displayName) {
        const shortName = displayName.split(',').slice(0, 3).join(', ');
        const fullResult: GpsLocationResult = {
          locationStr: `${coordStr} (${shortName})`,
          latitude: lat,
          longitude: lng,
        };
        cachedGps = { result: fullResult, timestamp: Date.now() };
        return fullResult;
      }
    }
  } catch {
    // Fallback cleanly to pure coordinates if reverse geocoding exceeds budget or network is offline
  }

  const rawResult: GpsLocationResult = {
    locationStr: coordStr,
    latitude: lat,
    longitude: lng,
  };
  cachedGps = { result: rawResult, timestamp: Date.now() };
  return rawResult;
};

/**
 * Known HEIC/HEIF ISO BMFF brand codes found in the `ftyp` box.
 */
const HEIC_BRANDS = new Set([
  'heic',
  'heix',
  'hevc',
  'hevx',
  'heim',
  'heis',
  'hevm',
  'hevs',
  'mif1',
  'msf1',
]);

const AVIF_BRANDS = new Set(['avif', 'avis']);

/**
 * Inspects file header magic bytes to determine the true image MIME type.
 * Falls back to file.type or file extension when magic bytes are inconclusive.
 */
const detectImageMimeType = (bytes: Uint8Array, file: File): string => {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (bytes.length >= 4 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
    return 'image/gif';
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }
  if (bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) {
    return 'image/bmp';
  }

  // ISO Base Media File Format (`ftyp` box at offset 4) for HEIC/HEIF/AVIF
  if (
    bytes.length >= 12 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    const readBrand = (offset: number) =>
      String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]).toLowerCase();

    const majorBrand = readBrand(8);
    if (HEIC_BRANDS.has(majorBrand)) return 'image/heic';
    if (AVIF_BRANDS.has(majorBrand)) return 'image/avif';

    // Check compatible brands starting at offset 16
    const boxSize = Math.min(bytes.length, 64);
    for (let i = 16; i + 4 <= boxSize; i += 4) {
      const compatBrand = readBrand(i);
      if (HEIC_BRANDS.has(compatBrand)) return 'image/heic';
      if (AVIF_BRANDS.has(compatBrand)) return 'image/avif';
    }
  }

  if (file.type && file.type.startsWith('image/')) {
    return file.type.toLowerCase();
  }

  const ext = file.name.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'bmp':
      return 'image/bmp';
    case 'heic':
      return 'image/heic';
    case 'heif':
      return 'image/heif';
    case 'avif':
      return 'image/avif';
    default:
      return file.type || 'image/jpeg';
  }
};

const isHeicMimeOrName = (mimeType: string, fileName: string): boolean => {
  return (
    mimeType === 'image/heic' ||
    mimeType === 'image/heif' ||
    mimeType === 'image/heic-sequence' ||
    mimeType === 'image/heif-sequence' ||
    /\.(heic|heif)$/i.test(fileName)
  );
};

/**
 * Reads a File into an in-memory Blob immediately so lazy Android content:// URIs
 * cannot expire or become unreadable between selection and submission.
 */
const materializeImageBlob = async (file: File): Promise<{ blob: Blob; mimeType: string }> => {
  if (!file) {
    throw new Error('No image file provided.');
  }
  if (file.size === 0) {
    throw new Error('Selected image file is empty (0 bytes). Please retake or choose another photo.');
  }

  let buffer: ArrayBuffer;
  try {
    buffer = await file.arrayBuffer();
  } catch (err) {
    console.error('Failed to read image bytes from storage:', err);
    throw new Error('Could not read the selected image from device storage. Please retake or pick the photo again.');
  }

  if (buffer.byteLength === 0) {
    throw new Error('Selected image file is empty (0 bytes). Please retake or choose another photo.');
  }

  const headerBytes = new Uint8Array(buffer, 0, Math.min(64, buffer.byteLength));
  const mimeType = detectImageMimeType(headerBytes, file);
  return {
    blob: new Blob([buffer], { type: mimeType }),
    mimeType,
  };
};

const convertHeicBlobToJpeg = async (blob: Blob): Promise<Blob> => {
  const { heicTo } = await import('heic-to');
  return heicTo({
    blob,
    type: 'image/jpeg',
    quality: 0.92,
  });
};

/**
 * Normalizes a user-selected/captured image File immediately upon selection:
 * - Materializes lazy mobile content:// handles into memory
 * - Repairs missing/incorrect MIME types from magic bytes
 * - Converts HEIC/HEIF photos (common on iOS and modern Android phones) into standard JPEG
 * so both <img> previews and Canvas2D watermarking work reliably.
 */
export const prepareImageFile = async (file: File): Promise<File> => {
  const { blob, mimeType } = await materializeImageBlob(file);

  if (isHeicMimeOrName(mimeType, file.name)) {
    const jpegBlob = await convertHeicBlobToJpeg(blob);
    const baseName = file.name.replace(/\.[^/.]+$/, '') || 'photo';
    return new File([jpegBlob], `${baseName}.jpg`, {
      type: 'image/jpeg',
      lastModified: file.lastModified || Date.now(),
    });
  }

  // If MIME type was missing or generic (e.g. application/octet-stream), re-wrap with detected type
  if (file.type !== mimeType) {
    return new File([blob], file.name || `photo_${Date.now()}.jpg`, {
      type: mimeType,
      lastModified: file.lastModified || Date.now(),
    });
  }

  // Re-wrap in-memory buffer so mobile content:// URI grants cannot expire later
  return new File([blob], file.name, {
    type: mimeType,
    lastModified: file.lastModified || Date.now(),
  });
};

interface DecodedImageResult {
  source: CanvasImageSource;
  width: number;
  height: number;
  cleanup: () => void;
}

const loadImageElement = (src: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = async () => {
      try {
        if (typeof img.decode === 'function') {
          await img.decode().catch(() => {
            // Some browsers reject decode() on valid images; naturalWidth check below decides validity
          });
        }
      } finally {
        if (img.naturalWidth > 0 && img.naturalHeight > 0) {
          resolve(img);
        } else {
          reject(new Error('Image decoded with zero dimensions'));
        }
      }
    };
    img.onerror = () => reject(new Error('HTMLImageElement onerror'));
    img.src = src;
  });
};

const readBlobAsDataUrl = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string' && reader.result.length > 0) {
        resolve(reader.result);
      } else {
        reject(new Error('FileReader produced an empty result'));
      }
    };
    reader.onerror = () => reject(reader.error || new Error('FileReader failed'));
    reader.readAsDataURL(blob);
  });
};

/**
 * Multi-tier image decoder resilient against mobile browser quirks:
 * 1. createImageBitmap (respecting EXIF orientation, with downscale retry for 50MP-200MP cameras)
 * 2. HTMLImageElement via blob: object URL
 * 3. HTMLImageElement via FileReader data: URL (bypasses WebView blob: restrictions)
 */
const decodeImageBlob = async (blob: Blob): Promise<DecodedImageResult> => {
  // Tier 1: createImageBitmap (direct Blob decode, no URL needed)
  if (typeof createImageBitmap === 'function') {
    const bitmapAttempts: Array<ImageBitmapOptions | undefined> = [
      { imageOrientation: 'from-image' },
      { imageOrientation: 'from-image', resizeWidth: MAX_IMAGE_DIMENSION },
      undefined,
    ];
    for (const opts of bitmapAttempts) {
      try {
        const bitmap = opts ? await createImageBitmap(blob, opts) : await createImageBitmap(blob);
        if (bitmap.width > 0 && bitmap.height > 0) {
          return {
            source: bitmap,
            width: bitmap.width,
            height: bitmap.height,
            cleanup: () => {
              try {
                bitmap.close();
              } catch {
                // ignore
              }
            },
          };
        }
        bitmap.close();
      } catch {
        // Try next decoding tier
      }
    }
  }

  // Tier 2: HTMLImageElement with blob: ObjectURL
  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = await loadImageElement(objectUrl);
    return {
      source: img,
      width: img.naturalWidth || img.width,
      height: img.naturalHeight || img.height,
      cleanup: () => URL.revokeObjectURL(objectUrl),
    };
  } catch {
    URL.revokeObjectURL(objectUrl);
  }

  // Tier 3: HTMLImageElement with FileReader data: URL
  const dataUrl = await readBlobAsDataUrl(blob);
  const img = await loadImageElement(dataUrl);
  return {
    source: img,
    width: img.naturalWidth || img.width,
    height: img.naturalHeight || img.height,
    cleanup: () => {
      // No external resource to revoke for data URLs
    },
  };
};

const canvasToJpegBlob = (canvas: HTMLCanvasElement, quality: number): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }
        // Fallback via toDataURL if canvas.toBlob returns null on older WebViews
        try {
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          const parts = dataUrl.split(',');
          const byteString = atob(parts[1] || '');
          const ab = new ArrayBuffer(byteString.length);
          const ia = new Uint8Array(ab);
          for (let i = 0; i < byteString.length; i++) {
            ia[i] = byteString.charCodeAt(i);
          }
          resolve(new Blob([ab], { type: 'image/jpeg' }));
        } catch (fallbackErr) {
          reject(new Error('Canvas toBlob conversion returned null'));
        }
      },
      'image/jpeg',
      quality
    );
  });
};

/**
 * Stamps GPS coordinates and local/UTC timestamp into an appended high-contrast bottom section using Canvas2D.
 * Automatically downscales images exceeding MAX_IMAGE_DIMENSION (1600px) to drastically reduce memory usage,
 * eliminate CPU encoding stalls, and reduce upload payloads by >95% without sacrificing readability.
 * Supports JPEG, PNG, WebP, GIF, BMP, and HEIC/HEIF mobile photos with resilient multi-tier decoding.
 */
export const addWatermark = async (
  file: File,
  locationStr: string,
  customTimestamp?: Date
): Promise<File> => {
  const { blob: rawBlob, mimeType } = await materializeImageBlob(file);

  let workingBlob = rawBlob;
  if (isHeicMimeOrName(mimeType, file.name)) {
    workingBlob = await convertHeicBlobToJpeg(rawBlob);
  }

  let decoded: DecodedImageResult;
  try {
    decoded = await decodeImageBlob(workingBlob);
  } catch (decodeErr) {
    // Last-resort HEIC signature check if container variant escaped header detection
    try {
      const { isHeic } = await import('heic-to');
      if (await isHeic(file)) {
        const converted = await convertHeicBlobToJpeg(rawBlob);
        decoded = await decodeImageBlob(converted);
      } else {
        throw decodeErr;
      }
    } catch (finalErr) {
      console.error('All image decoding tiers failed:', {
        name: file.name,
        type: file.type,
        detectedMime: mimeType,
        size: file.size,
        error: finalErr,
      });
      throw new Error(
        `Failed to load image file into Canvas (${file.name || 'photo'}, ${mimeType}). Please try taking a new photo or choosing a JPG/PNG image.`
      );
    }
  }

  try {
    // 1. Proportional Downscaling:
    // Constrain max image dimension to MAX_IMAGE_DIMENSION (1600px) to prevent multi-megabyte payloads
    let targetWidth = decoded.width;
    let targetHeight = decoded.height;

    if (targetWidth > MAX_IMAGE_DIMENSION || targetHeight > MAX_IMAGE_DIMENSION) {
      if (targetWidth >= targetHeight) {
        targetWidth = MAX_IMAGE_DIMENSION;
        targetHeight = Math.max(1, Math.round((decoded.height / decoded.width) * MAX_IMAGE_DIMENSION));
      } else {
        targetHeight = MAX_IMAGE_DIMENSION;
        targetWidth = Math.max(1, Math.round((decoded.width / decoded.height) * MAX_IMAGE_DIMENSION));
      }
    }

    // 2. Canvas Dimension Expansion:
    // Calculate required height for watermark block before sizing canvas
    const baseFontSize = Math.max(16, Math.floor(targetWidth * 0.024));
    const padding = baseFontSize * 0.9;
    const lineHeight = baseFontSize * 1.35;
    const watermarkBlockHeight = Math.ceil(lineHeight * 2 + padding * 2);

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    // Expand canvas height by appending watermarkBlockHeight to scaled image height
    canvas.height = targetHeight + watermarkBlockHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to acquire 2D canvas context');
    }

    // Enable high-quality bilinear interpolation for crisp text and details
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // 3. Image and Background Rendering:
    // Draw scaled captured photo starting at (0, 0) origin without obscuring any pixels
    ctx.drawImage(decoded.source, 0, 0, targetWidth, targetHeight);

    // Render solid, high-contrast dark background rectangle in the appended bottom space
    ctx.fillStyle = '#0f172a'; // Solid high-contrast Slate-900/950
    ctx.fillRect(0, targetHeight, canvas.width, watermarkBlockHeight);

    // Top accent divider line on the watermark banner
    const accentHeight = Math.max(3, Math.floor(baseFontSize * 0.15));
    ctx.fillStyle = '#dc2626'; // Pioneer Red
    ctx.fillRect(0, targetHeight, canvas.width, accentHeight);

    // 4. Watermark Placement:
    // Stamp timestamp and GPS coordinates directly into the appended bottom section
    ctx.font = `600 ${baseFontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';

    const date = customTimestamp || new Date();
    const localTimeStr = date.toLocaleString();
    const utcTimeStr = date.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';

    // Line 1: Timestamp (Local + UTC) in appended section
    const line1Y = targetHeight + padding + lineHeight * 0.5;
    ctx.fillText(`🕒 Time: ${localTimeStr} (${utcTimeStr})`, padding, line1Y);

    // Line 2: GPS Coordinates / Location in appended section
    const line2Y = line1Y + lineHeight;
    ctx.fillText(`📍 GPS: ${locationStr}`, padding, line2Y);

    // 5. Compression Preservation:
    // Export watermarked image to JPEG Blob with COMPRESSION_QUALITY (0.80) constraint
    const outputBlob = await canvasToJpegBlob(canvas, COMPRESSION_QUALITY);
    return new File(
      [outputBlob],
      `wm_${Date.now()}_${(file.name || 'photo').replace(/\.[^/.]+$/, '')}.jpg`,
      { type: 'image/jpeg' }
    );
  } finally {
    decoded.cleanup();
  }
};

/**
 * Concurrently processes an array of captured image files through Canvas2D watermarking,
 * appending high-accuracy GPS coordinates and timestamps in the bottom banner at 0.80 JPEG quality.
 */
export const batchAddWatermark = async (
  files: File[],
  locationStr: string,
  onProgress?: (current: number, total: number, file: File) => void
): Promise<File[]> => {
  let completedCount = 0;
  return Promise.all(
    files.map(async (file) => {
      const watermarked = await addWatermark(file, locationStr);
      completedCount++;
      if (onProgress) {
        onProgress(completedCount, files.length, file);
      }
      return watermarked;
    })
  );
};
