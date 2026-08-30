/** Longest edge we keep. A 4032px phone photo lands around 200KB after this. */
const MAX_EDGE = 1400;
const QUALITY = 0.82;

/**
 * Shrinks a picked photo in the browser before it is ever uploaded. Doing it here rather than on
 * the server means no multi-megabyte upload over a phone connection, and — crucially — the
 * decoder applies the EXIF orientation for us, so photos don't arrive sideways.
 */
export async function downscaleImage(file: File): Promise<Blob> {
  const bitmap = await decode(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not read that image.');
  ctx.drawImage(bitmap, 0, 0, width, height);
  if ('close' in bitmap) bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', QUALITY),
  );
  if (!blob) throw new Error('Could not process that image.');
  return blob;
}

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      // from-image applies the EXIF rotation rather than handing back raw sensor pixels.
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      // Older Safari doesn't take the options bag; fall through to an <img>.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('Could not read that image.'));
      img.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}
