"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { useT } from "@/lib/i18n/provider";
import { LOCALES, type Locale } from "@/lib/i18n";
import type { UserRole } from "@/lib/database.types";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { updateProfile } from "./actions";

export function SettingsForm({
  email,
  fullName,
  locale,
  role,
}: {
  email: string | null;
  fullName: string;
  locale: Locale;
  role: UserRole;
}) {
  const { t } = useT();
  const router = useRouter();
  const [name, setName] = useState(fullName);
  const [lang, setLang] = useState<Locale>(locale);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    if (!name.trim()) {
      setError(t("set_name_required"));
      return;
    }
    startTransition(async () => {
      const res = await updateProfile({ fullName: name, locale: lang });
      if (!res.ok) {
        setError(res.error === "name_required" ? t("set_name_required") : t("error_generic"));
        return;
      }
      setSaved(true);
      // Locale lives in the layout; refresh so the whole shell re-renders.
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <Label htmlFor="email">{t("set_email")}</Label>
        <Input id="email" type="email" value={email ?? ""} readOnly disabled className="bg-surface-2" />
      </div>

      <div>
        <Label htmlFor="full_name">{t("settings_name")}</Label>
        <Input
          id="full_name"
          name="full_name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          maxLength={120}
          disabled={pending}
          required
        />
      </div>

      <div>
        <Label htmlFor="locale">{t("settings_language")}</Label>
        <Select id="locale" name="locale" value={lang} onChange={(e) => setLang(e.target.value as Locale)} disabled={pending}>
          {LOCALES.map((l) => (
            <option key={l} value={l}>
              {t(`set_lang_${l}`)}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <Label>{t("settings_role")}</Label>
        <Badge tone={role === "admin" ? "brand" : "neutral"}>{t(`role_${role}`)}</Badge>
      </div>

      {error && <Alert tone="danger">{error}</Alert>}
      {saved && !error && (
        <Alert tone="success" className="flex items-center gap-2">
          <CheckCircle2 className="size-5" /> {t("settings_saved")}
        </Alert>
      )}

      <Button type="submit" size="lg" block loading={pending} disabled={pending}>
        {t("settings_save")}
      </Button>
    </form>
  );
}
