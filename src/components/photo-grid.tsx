import type { Photo } from "@/lib/database.types";
import { cn } from "@/lib/cn";

/**
 * Renders photos using pre-signed URLs (private bucket). `urls` maps
 * storage_path -> signed URL. Tapping opens the full image in a new tab.
 */
export function PhotoGrid({
  photos,
  urls,
  size = "md",
  className,
}: {
  photos: Photo[];
  urls: Map<string, string>;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  if (!photos.length) return null;
  const cell = size === "sm" ? "size-16" : size === "lg" ? "aspect-square w-full" : "size-24";
  const grid = size === "lg" ? "grid grid-cols-2 gap-2" : "flex flex-wrap gap-2";
  return (
    <div className={cn(grid, className)}>
      {photos.map((p) => {
        const url = urls.get(p.storage_path);
        return (
          <a
            key={p.id}
            href={url ?? "#"}
            target="_blank"
            rel="noreferrer"
            className={cn("block overflow-hidden rounded-xl bg-surface-2 ring-1 ring-line", cell)}
          >
            {url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={url} alt="" loading="lazy" className="size-full object-cover" />
            ) : (
              <span className="flex size-full items-center justify-center text-xs text-muted">…</span>
            )}
          </a>
        );
      })}
    </div>
  );
}
