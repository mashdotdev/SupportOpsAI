import { Suspense, type CSSProperties, type ReactNode } from "react";
import "../globals.css";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/workspace/app-sidebar";
import { connection } from "next/server";
import { auth } from "@/lib/auth/server";
import { redirect } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";

async function SidebarOwnerName() {
  await connection();
  const { data: session } = await auth.getSession();
  if (!session?.user) redirect("/auth/sign-in");

  return session.user.name;
}

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SidebarProvider
          // style={{ "--sidebar-width": "280px" } as CSSProperties}
        >
          <AppSidebar
            ownerName={
              <Suspense
                fallback={
                  <Skeleton
                    className="my-0.75 h-4 w-20 max-w-full"
                    role="status"
                    aria-label="Loading owner name"
                  />
                }
              >
                <SidebarOwnerName />
              </Suspense>
            }
          />
          <div className="min-w-0 flex-1">
            <header className="flex h-14 items-center px-4">
              <SidebarTrigger />
            </header>
            {children}
          </div>
        </SidebarProvider>
      </body>
    </html>
  );
}
