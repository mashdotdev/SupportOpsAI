"use client";
import { AuthView, NeonAuthUIProvider } from "@neondatabase/auth-ui";
import "@neondatabase/auth-ui/css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";

export function AuthScreen({ path }: { path: string }) {
  const router = useRouter();
  return (
    <NeonAuthUIProvider authClient={authClient} navigate={router.push}
      replace={router.replace} onSessionChange={() => router.refresh()}
      redirectTo="/workspace" Link={Link}>
      <main className="mx-auto flex min-h-screen items-center justify-center px-6 py-24">
        <AuthView path={path} />
      </main>
    </NeonAuthUIProvider>
  );
}
