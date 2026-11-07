"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, X } from "lucide-react";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/cn";

export type PickedPhoto = { id: string; file: File; previewUrl: string };

/**
 * Mobile-first photo picker. Camera only by default: evidence has to be shot
 * on the spot, so there is no "choose from gallery" path that would let an old
 * picture be submitted as today's proof.
 *
 * `capture="environment"` makes iOS Safari and Android Chrome open the camera
 * directly. It is a strong platform hint rather than a hard guarantee — a
 * desktop browser has no camera intent and will still show a file dialog — so
 * treat it as the practical control it is, not a security boundary.
 */
export function PhotoPicker({
  photos,
  onChange,
  max = 6,
  disabled,
  minRequired = 0,
  allowGallery = false,
}: {
  photos: PickedPhoto[];
  onChange: (next: PickedPhoto[]) => void;
  max?: number;
  disabled?: boolean;
  minRequired?: number;
  /** Opt back in to picking an existing image. Off for evidence. */
  allowGallery?: boolean;
}) {
  const { t } = useT();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  // Revoke object URLs on unmount
  const photosRef = useRef<PickedPhoto[]>([]);
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);
  useEffect(() => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.previewUrl)), []);

  function addFiles(list: FileList | null) {
    if (!list) return;
    setError(null);
    const room = max - photos.length;
    const files = Array.from(list).slice(0, Math.max(0, room));
    const next = files
      .filter((f) => f.type.startsWith("image/") || /\.(heic|heif|jpe?g|png|webp)$/i.test(f.name))
      .map((file) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        previewUrl: URL.createObjectURL(file),
      }));
    if (next.length) onChange([...photos, ...next]);
  }

  function remove(id: string) {
    const p = photos.find((x) => x.id === id);
    if (p) URL.revokeObjectURL(p.previewUrl);
    onChange(photos.filter((x) => x.id !== id));
  }

  const full = photos.length >= max;

  return (
    <div className="space-y-3">
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = "";
        }}
      />
      {allowGallery && (
        <input
          ref={galleryRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      )}

      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((p) => (
            <div key={p.id} className="relative aspect-square overflow-hidden rounded-xl ring-1 ring-line">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.previewUrl} alt="" className="size-full object-cover" />
              {!disabled && (
                <button
                  type="button"
                  onClick={() => remove(p.id)}
                  aria-label={t("remove")}
                  className="absolute right-1 top-1 flex size-9 items-center justify-center rounded-full bg-black/65 text-white active:bg-black/80"
                >
                  <X className="size-5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className={cn("grid gap-2", allowGallery ? "grid-cols-2" : "grid-cols-1")}>
        <button
          type="button"
          disabled={disabled || full}
          onClick={() => cameraRef.current?.click()}
          className={cn(
            "flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-brand-300 bg-brand-50 px-3 py-3 text-sm font-semibold text-brand-800 active:bg-brand-100 disabled:opacity-50"
          )}
        >
          <Camera className="size-7" />
          {photos.length ? t("task_add_photo") : t("task_take_photo")}
        </button>
        {allowGallery && (
          <button
            type="button"
            disabled={disabled || full}
            onClick={() => galleryRef.current?.click()}
            className="flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-line bg-white px-3 py-3 text-sm font-semibold text-ink active:bg-surface-2 disabled:opacity-50"
          >
            <ImagePlus className="size-7" />
            {t("task_choose_photo")}
          </button>
        )}
      </div>
      {!allowGallery && <p className="text-xs text-muted">{t("task_camera_only")}</p>}
      {minRequired > 0 && photos.length < minRequired && (
        <p className="text-xs text-muted">{t("task_need_more_photos", { n: minRequired })}</p>
      )}
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
