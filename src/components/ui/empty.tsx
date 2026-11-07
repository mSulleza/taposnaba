export function Empty({ icon, title, hint }: { icon?: React.ReactNode; title: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-white/60 px-4 py-10 text-center">
      {icon && <div className="mx-auto mb-2 flex size-10 items-center justify-center rounded-full bg-brand-100 text-brand-700">{icon}</div>}
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}
