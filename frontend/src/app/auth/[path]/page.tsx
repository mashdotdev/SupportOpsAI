import { AuthScreen } from "@/components/auth-screen";
import { Suspense } from "react";
import { notFound } from "next/navigation";

async function Screen({ params }: { params: Promise<{ path: string }> }) {
  const { path } = await params;
  if (
    ![
      "sign-in",
      "sign-up",
      "forgot-password",
      "reset-password",
      "callback",
      "sign-out",
    ].includes(path)
  )
    notFound();
  return <AuthScreen path={path} />;
}

export default function AuthPage(props: { params: Promise<{ path: string }> }) {
  return (
    <Suspense fallback={<p className="p-24">Loading sign in…</p>}>
      <Screen {...props} />
    </Suspense>
  );
}
