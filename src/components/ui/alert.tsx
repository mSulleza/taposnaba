import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Tone = "info" | "success" | "warning" | "danger";
const tones: Record<Tone, string> = {
  info: "bg-sky-50 text-sky-900 border-sky-200",
  success: "bg-emerald-50 text-emerald-900 border-emerald-200",
  warning: "bg-amber-50 text-amber-900 border-amber-200",
  danger: "bg-red-50 text-red-900 border-red-200",
};

export function Alert({ tone = "info", className, ...props }: HTMLAttributes<HTMLDivElement> & { tone?: Tone }) {
  return <div role="status" className={cn("rounded-xl border px-3.5 py-3 text-sm", tones[tone], className)} {...props} />;
}
