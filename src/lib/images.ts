/** Turning picked image files into small JPEG data URLs before they are saved. */

function canvasFor(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable");
  return { canvas, ctx };
}

/** Crop to a centred square and shrink, for profile pictures. */
export async function toSquareDataUrl(file: File, size = 256): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const { canvas, ctx } = canvasFor(size, size);
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.85);
}

/**
 * Keep the whole picture but shrink its longest side, for the extra photos.
 * 1280px stays well under the storage bucket's 1 MB limit.
 */
export async function toPhotoDataUrl(file: File, maxSide = 1280): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const { canvas, ctx } = canvasFor(width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.82);
}
