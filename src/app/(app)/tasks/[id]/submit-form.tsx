"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { useT } from "@/lib/i18n/provider";
import { uploadPhoto, removeUploadedPhoto, PhotoTooLargeError } from "@/lib/upload";
import { PhotoPicker, type PickedPhoto } from "@/components/photo-picker";
import { Button } from "@/components/ui/button";
import { Textarea, Label } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { submitCompletion } from "../actions";

export function SubmitForm({
  instanceId,
  userId,
  minPhotos,
  resubmit,
}: {
  instanceId: string;
  userId: string;
  minPhotos: number;
  resubmit: boolean;
}) {
  const { t } = useT();
  const router = useRouter();
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [note, setNote] = useState("");
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (photos.length < minPhotos) {
      setError(t("task_need_more_photos", { n: minPhotos }));
      return;
    }
    setBusy(true);
    const uploaded: string[] = [];
    try {
      for (let i = 0; i < photos.length; i++) {
        setProgress(t("task_uploading", { i: i + 1, n: photos.length }));
        uploaded.push(await uploadPhoto(photos[i].file, userId));
      }
      setProgress(t("task_submitting"));
      const res = await submitCompletion({ instanceId, note, photoPaths: uploaded });
      if (!res.ok) {
        // best-effort cleanup of orphaned uploads
        await Promise.all(uploaded.map((p) => removeUploadedPhoto(p).catch(() => {})));
        setError(
          res.error === "need_photos"
            ? t("task_need_more_photos", { n: minPhotos })
            : res.error === "locked"
              ? t("task_locked")
              : res.error === "too_early"
                ? t("task_too_early")
                : t("error_generic")
        );
        return;
      }
      setDone(true);
      photos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      startTransition(() => {
        router.refresh();
        setTimeout(() => router.push("/today"), 900);
      });
    } catch (err) {
      console.error(err);
      await Promise.all(uploaded.map((p) => removeUploadedPhoto(p).catch(() => {})));
      setError(err instanceof PhotoTooLargeError ? t("task_photo_oversize") : t("task_upload_failed"));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  if (done) {
    return (
      <Alert tone="success" className="flex items-center gap-2">
        <CheckCircle2 className="size-5" /> {t("task_submitted_ok")}
      </Alert>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <PhotoPicker photos={photos} onChange={setPhotos} disabled={busy} minRequired={minPhotos} />
      <div>
        <Label htmlFor="note">{t("task_note")}</Label>
        <Textarea
          id="note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t("task_note_placeholder")}
          disabled={busy}
          maxLength={2000}
        />
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      <Button type="submit" size="lg" block loading={busy} disabled={busy}>
        {progress ?? (resubmit ? t("task_resubmit") : t("task_submit"))}
      </Button>
    </form>
  );
}
