"use client";
import { AuthView } from "@neondatabase/auth-ui";

export function AuthScreen({ path }: { path: string }) {
  return (
      <main className="mx-auto flex min-h-screen items-center justify-center px-6 py-24">
        <AuthView path={path} />
      </main>
  );
}
