import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4">
      <h1 className="text-2xl font-black tracking-[-0.03em]">Newsroom sign in</h1>
      <p className="mt-1 text-sm text-ink-2">For editors and administrators of The Daily Circuit.</p>
      <div className="mt-6 rounded-lg border border-border bg-card p-5">
        <LoginForm />
      </div>
    </main>
  );
}
