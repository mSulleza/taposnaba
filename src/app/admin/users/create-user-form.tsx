"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { useT } from "@/lib/i18n/provider";
import type { UserRole } from "@/lib/database.types";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { createUser } from "./actions";

export function CreateUserForm({ serviceConfigured }: { serviceConfigured: boolean }) {
  const { t } = useT();
  const router = useRouter();
  const uid = useId();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<UserRole>("helper");
  const [locale, setLocale] = useState<"tl" | "en">("tl");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (password.length < 8) {
      setError(t("usr_password_hint"));
      return;
    }
    startTransition(async () => {
      const res = await createUser({ email, password, full_name: fullName, role, locale });
      if (!res.ok) {
        setError(
          res.error === "no_service_key"
            ? t("users_no_service_key")
            : res.error === "invalid_email"
              ? t("usr_email_invalid")
              : res.error === "email_exists"
                ? t("usr_email_exists")
                : res.error === "weak_password"
                  ? t("usr_password_hint")
                  : res.error === "name_required"
                    ? t("set_name_required")
                    : t("error_generic")
        );
        return;
      }
      setSuccess(`${t("users_created")} ${t("usr_login_hint")}`);
      setEmail("");
      setPassword("");
      setFullName("");
      setRole("helper");
      setLocale("tl");
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {!serviceConfigured && <Alert tone="warning">{t("users_no_service_key")}</Alert>}
      <div>
        <Label htmlFor={`${uid}-email`}>{t("users_email")}</Label>
        <Input
          id={`${uid}-email`}
          type="email"
          inputMode="email"
          autoComplete="off"
          autoCapitalize="none"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={pending}
        />
      </div>
      <div>
        <Label htmlFor={`${uid}-password`}>{t("users_password")}</Label>
        <Input
          id={`${uid}-password`}
          type="text"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
          disabled={pending}
        />
        <p className="mt-1 text-xs text-muted">{t("usr_password_hint")}</p>
      </div>
      <div>
        <Label htmlFor={`${uid}-name`}>{t("users_name")}</Label>
        <Input
          id={`${uid}-name`}
          type="text"
          autoComplete="off"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          maxLength={120}
          required
          disabled={pending}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor={`${uid}-role`}>{t("users_role")}</Label>
          <Select id={`${uid}-role`} value={role} onChange={(e) => setRole(e.target.value as UserRole)} disabled={pending}>
            <option value="helper">{t("role_helper")}</option>
            <option value="admin">{t("role_admin")}</option>
          </Select>
        </div>
        <div>
          <Label htmlFor={`${uid}-locale`}>{t("settings_language")}</Label>
          <Select
            id={`${uid}-locale`}
            value={locale}
            onChange={(e) => setLocale(e.target.value === "en" ? "en" : "tl")}
            disabled={pending}
          >
            <option value="tl">{t("set_lang_tl")}</option>
            <option value="en">{t("set_lang_en")}</option>
          </Select>
        </div>
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      {success && <Alert tone="success">{success}</Alert>}
      <Button type="submit" size="lg" block loading={pending} disabled={pending || !serviceConfigured}>
        <UserPlus className="size-5" /> {pending ? t("usr_creating") : t("users_create")}
      </Button>
      <p className="text-xs text-muted">{t("usr_login_hint")}</p>
    </form>
  );
}
