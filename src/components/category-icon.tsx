import {
  Sparkles, Snowflake, Droplets, UtensilsCrossed, Box, HeartPulse, Scissors, Cat, Wrench, CircleDot,
} from "lucide-react";
import type { TaskCategory } from "@/lib/database.types";
import { cn } from "@/lib/cn";

const map: Record<TaskCategory, { Icon: typeof Sparkles; cls: string }> = {
  cleaning: { Icon: Sparkles, cls: "bg-violet-100 text-violet-700" },
  aircon: { Icon: Snowflake, cls: "bg-sky-100 text-sky-700" },
  water: { Icon: Droplets, cls: "bg-cyan-100 text-cyan-700" },
  food: { Icon: UtensilsCrossed, cls: "bg-amber-100 text-amber-700" },
  litter: { Icon: Box, cls: "bg-stone-200 text-stone-700" },
  health: { Icon: HeartPulse, cls: "bg-rose-100 text-rose-700" },
  grooming: { Icon: Scissors, cls: "bg-pink-100 text-pink-700" },
  play: { Icon: Cat, cls: "bg-brand-100 text-brand-700" },
  equipment: { Icon: Wrench, cls: "bg-slate-200 text-slate-700" },
  other: { Icon: CircleDot, cls: "bg-stone-100 text-stone-600" },
};

export function CategoryIcon({ category, className }: { category: TaskCategory; className?: string }) {
  const { Icon, cls } = map[category] ?? map.other;
  return (
    <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", cls, className)}>
      <Icon className="size-5" />
    </span>
  );
}
