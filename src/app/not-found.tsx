import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <p className="text-5xl">🐈</p>
      <h1 className="mt-3 text-xl font-bold">Hindi mahanap · Not found</h1>
      <p className="mt-1 text-sm text-muted">Wala ang page na hinahanap mo. / That page doesn&apos;t exist.</p>
      <Link href="/" className="mt-6 inline-flex h-12 items-center rounded-xl bg-brand-600 px-5 font-semibold text-white">
        Bumalik · Go home
      </Link>
    </main>
  );
}
