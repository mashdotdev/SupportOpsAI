import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { Workspace } from "@/components/workspace";
import { Suspense } from "react";
import { connection } from "next/server";

async function SignedInWorkspace() {
  await connection();
  const { data: session } = await auth.getSession();
  if (!session?.user) redirect("/auth/sign-in");
  return <Workspace email={session.user.email} />;
}

export default function WorkspacePage() {
  return (
    <Suspense fallback={<p className="p-24">Loading workspace…</p>}>
      <SignedInWorkspace />
    </Suspense>
  );
}
