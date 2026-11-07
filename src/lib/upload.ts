"use client";

import { createClient } from "@/lib/supabase/client";
import { EVIDENCE_BUCKET } from "@/lib/env";
import { MAX_UPLOAD_BYTES, compressImage, newPhotoPath } from "@/lib/image";

/**
 * Compress and upload one photo straight from the browser to the private
 * evidence bucket (RLS: users may only write inside their own uid folder).
 * Returns the storage path.
 */
export class PhotoTooLargeError extends Error {
  constructor() {
    super("photo_too_large");
    this.name = "PhotoTooLargeError";
  }
}

export async function uploadPhoto(file: File, uid: string): Promise<string> {
  const blob = await compressImage(file);
  // The bucket rejects anything over 10MB; catch it here so the helper gets a
  // clear message instead of a generic upload failure.
  if (blob.size > MAX_UPLOAD_BYTES) throw new PhotoTooLargeError();
  const isJpeg = blob.type === "image/jpeg";
  const ext = isJpeg ? "jpg" : (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = newPhotoPath(uid, ext);
  const supabase = createClient();
  const { error } = await supabase.storage.from(EVIDENCE_BUCKET).upload(path, blob, {
    contentType: blob.type || file.type || "image/jpeg",
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) throw error;
  return path;
}

export async function removeUploadedPhoto(path: string): Promise<void> {
  const supabase = createClient();
  await supabase.storage.from(EVIDENCE_BUCKET).remove([path]);
}
