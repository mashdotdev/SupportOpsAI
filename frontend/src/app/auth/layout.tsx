import type { ReactNode } from "react";
import "../globals.css";
import Image from "next/image";
import { AuthProvider } from "@/components/auth-provider";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <AuthProvider>
          <div className="flex min-h-svh">
            <div className="min-w-0 flex-1">{children}</div>
            <div className="flex-2 relative min-w-0 overflow-hidden hidden lg:block">
              <Image
                src={"/images/ana.jpg"}
                alt="auth-image"
                fill
                sizes="67vw"
                className="object-cover"
              />
            </div>
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
