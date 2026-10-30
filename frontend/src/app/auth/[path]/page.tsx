import { AuthScreen } from "@/components/auth-screen";
import { Suspense } from "react";

async function Screen({ params }: { params: Promise<{ path: string }> }) {
  const { path } = await params;
  return <AuthScreen path={path} />;
}

export default function AuthPage(props: { params: Promise<{ path: string }> }) {
  return (
    <Suspense fallback={<p className="p-24">Loading sign in…</p>}>
      <Screen {...props} />
    </Suspense>
  );
}
