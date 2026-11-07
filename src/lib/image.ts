"use client";

/**
 * Client-side photo preparation: downscale + re-encode as JPEG so uploads from
 * phones are fast (typically 150–400 KB instead of 3–8 MB).
 */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export async function compressImage(
  file: File,
  opts: { maxDim?: number; quality?: number } = {}
): Promise<Blob> {
  const maxDim = opts.maxDim ?? 1600;
  const quality = opts.quality ?? 0.82;

  let bitmap: ImageBitmap | HTMLImageElement;
  try {
    // imageOrientation: 'from-image' honours EXIF rotation where supported.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
  } catch {
    try {
      bitmap = await loadViaImg(file);
    } catch {
      // Cannot decode (e.g. HEIC on a desktop browser) — upload as-is.
      return file;
    }
  }

  const w = "width" in bitmap ? bitmap.width : (bitmap as HTMLImageElement).naturalWidth;
  const h = "height" in bitmap ? bitmap.height : (bitmap as HTMLImageElement).naturalHeight;
  const scale = Math.min(1, maxDim / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap as CanvasImageSource, 0, 0, cw, ch);
  if ("close" in bitmap && typeof bitmap.close === "function") bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) return file;
  // If compression somehow made it bigger (tiny PNGs), keep the original.
  return blob.size < file.size || file.type !== "image/jpeg" ? blob : file;
}

function loadViaImg(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

/** Storage object path for a new photo: {uid}/{yyyy-mm}/{uuid}.jpg */
export function newPhotoPath(uid: string, ext = "jpg"): string {
  const now = new Date();
  const ym = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${uid}/${ym}/${id}.${ext}`;
}
