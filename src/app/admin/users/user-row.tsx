"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { useT } from "@/lib/i18n/provider";
import type { Profile, UserRole } from "@/lib/database.types";
import { formatDateTime } from "@/lib/dates";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { updateUserProfile } from "./actions";

export function UserRow({ profile, isSelf }: { profile: Profile; isSelf: boolean }) {
  const { t, locale } = useT();
  const router = useRouter();
  const uid = useId();
  const [name, setName] = useState(profile.full_name);
  const [role, setRole] = useState<UserRole>(profile.role);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const dirty = name.trim() !== profile.full_name || role !== profile.role;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await updateUserProfile({ id: profile.id, full_name: name, role });
      if (!res.ok) {
        setError(
          res.error === "last_admin"
            ? t("usr_last_admin")
            : res.error === "name_required"
              ? t("set_name_required")
              : t("error_generic")
        );
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardBody>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-base font-semibold">{profile.full_name || "—"}</span>
          <Badge tone={profile.role === "admin" ? "brand" : "neutral"}>{t(`role_${profile.role}`)}</Badge>
          {isSelf && <Badge tone="info">{t("usr_you")}</Badge>}
          <span className="ml-auto text-xs text-muted">{t("usr_joined", { when: formatDateTime(profile.created_at, locale) })}</span>
        </div>
        <form onSubmit={onSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
          <div>
            <Label htmlFor={`${uid}-name`}>{t("users_name")}</Label>
            <Input
              id={`${uid}-name`}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setSaved(false);
              }}
              maxLength={120}
              required
              disabled={pending}
            />
          </div>
          <div>
            <Label htmlFor={`${uid}-role`}>{t("users_role")}</Label>
            <Select
              id={`${uid}-role`}
              value={role}
              onChange={(e) => {
                setRole(e.target.value as UserRole);
                setSaved(false);
              }}
              disabled={pending}
            >
              <option value="helper">{t("role_helper")}</option>
              <option value="admin">{t("role_admin")}</option>
            </Select>
          </div>
          <Button type="submit" variant={dirty ? "primary" : "outline"} loading={pending} disabled={pending || !dirty}>
            <Save className="size-4" /> {t("save")}
          </Button>
        </form>
        {error && <Alert tone="danger" className="mt-3">{error}</Alert>}
        {saved && !dirty && <Alert tone="success" className="mt-3">{t("usr_saved")}</Alert>}
      </CardBody>
    </Card>
  );
}
