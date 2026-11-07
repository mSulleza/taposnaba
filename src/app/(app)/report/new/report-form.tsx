"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { useT } from "@/lib/i18n/provider";
import { uploadPhoto, removeUploadedPhoto, PhotoTooLargeError } from "@/lib/upload";
import { PhotoPicker, type PickedPhoto } from "@/components/photo-picker";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import type { IssueCategory } from "@/lib/database.types";
import { createIssue } from "../actions";

const CATEGORIES: IssueCategory[] = ["health", "equipment", "supplies", "other"];
const MAX_PHOTOS = 6;

export function ReportForm({ userId }: { userId: string }) {
  const { t } = useT();
  const router = useRouter();
  const [category, setCategory] = useState<IssueCategory>("health");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError(t("rep_title_required"));
      return;
    }
    setBusy(true);
    const uploaded: string[] = [];
    try {
      for (let i = 0; i < photos.length; i++) {
        setProgress(t("task_uploading", { i: i + 1, n: photos.length }));
        uploaded.push(await uploadPhoto(photos[i].file, userId));
      }
      setProgress(t("rep_sending"));
      const res = await createIssue({ category, title, description, photoPaths: uploaded });
      if (!res.ok) {
        await Promise.all(uploaded.map((p) => removeUploadedPhoto(p).catch(() => {})));
        setError(res.error === "title_required" ? t("rep_title_required") : t("error_generic"));
        return;
      }
      setDone(true);
      photos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      startTransition(() => {
        router.refresh();
        setTimeout(() => router.push("/report"), 900);
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
        <CheckCircle2 className="size-5" /> {t("report_submitted")}
      </Alert>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <Label htmlFor="category">{t("report_category")}</Label>
        <Select
          id="category"
          value={category}
          onChange={(e) => setCategory(e.target.value as IssueCategory)}
          disabled={busy}
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {t(`report_cat_${c}`)}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <Label htmlFor="title">{t("report_what")}</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("report_what_placeholder")}
          disabled={busy}
          maxLength={200}
          required
        />
      </div>

      <div>
        <Label htmlFor="description">{t("report_details")}</Label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={busy}
          maxLength={2000}
        />
      </div>

      <div>
        <Label>{t("report_photos")}</Label>
        <PhotoPicker photos={photos} onChange={setPhotos} disabled={busy} max={MAX_PHOTOS} />
      </div>

      {error && <Alert tone="danger">{error}</Alert>}

      <Button type="submit" size="lg" block loading={busy} disabled={busy}>
        {progress ?? t("report_submit")}
      </Button>
    </form>
  );
}
