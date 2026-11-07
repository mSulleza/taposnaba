"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <p className="text-5xl">😿</p>
      <h1 className="mt-3 text-xl font-bold">May nangyaring mali · Something went wrong</h1>
      <p className="mt-1 text-sm text-muted">Subukan ulit. / Please try again.</p>
      {error.digest && <p className="mt-2 text-xs text-muted">ref: {error.digest}</p>}
      <button
        onClick={reset}
        className="mt-6 inline-flex h-12 items-center rounded-xl bg-brand-600 px-5 font-semibold text-white"
      >
        Subukan ulit · Try again
      </button>
    </main>
  );
}
