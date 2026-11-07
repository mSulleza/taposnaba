import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : "";
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-192.png" alt="" width={72} height={72} className="mb-4 rounded-2xl shadow" />
          <h1 className="text-2xl font-bold tracking-tight">Tapos na ba?</h1>
          <p className="mt-1 text-sm text-muted">Tracker ng mga gawain para sa mga pusa 🐈</p>
        </div>
        <LoginForm next={next} />
      </div>
    </main>
  );
}
