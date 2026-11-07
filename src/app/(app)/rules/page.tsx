import type { Metadata } from "next";
import { sessionT } from "@/lib/auth";
import { RULES } from "@/lib/rules-content";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";

export const metadata: Metadata = { title: "House Rules" };

export default async function RulesPage() {
  const { locale, t } = await sessionT();
  return (
    <div>
      <PageHeader title={t("rules_title")} />
      <div className="space-y-4">
        {RULES.map((s) => (
          <Card key={s.title_en}>
            <CardBody>
              <h2 className="mb-2 text-base font-bold">{locale === "tl" ? s.title_tl : s.title_en}</h2>
              <ol className="list-decimal space-y-2 pl-5 text-[15px] leading-relaxed">
                {s.items.map((it, i) => (
                  <li key={i}>{locale === "tl" ? it.tl : it.en}</li>
                ))}
              </ol>
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}
