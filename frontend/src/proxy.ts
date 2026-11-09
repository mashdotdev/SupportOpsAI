import { auth } from "@/lib/auth/server";
import { NextRequest, NextResponse } from "next/server";
import { widgetBackend } from "@/lib/widget-server";

const authenticated = auth.middleware({ loginUrl: "/auth/sign-in" });
export default async function proxy(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith("/embed/"))
    return authenticated(request);
  let ancestors = "'none'";
  try {
    const id = request.nextUrl.pathname.split("/")[2];
    if (/^[\da-f-]{36}$/i.test(id)) {
      const response = await widgetBackend(`${id}/config`);
      if (response.ok) {
        const config = await response.json();
        // Only validated exact origins from the backend enter the response header.
        ancestors = ["'self'", ...config.allowed_origins].join(" ");
      }
    }
  } catch {
    /* Fail closed if the configuration service is unavailable. */
  }
  const response = NextResponse.next();
  response.headers.set(
    "Content-Security-Policy",
    `frame-ancestors ${ancestors}`,
  );
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}
export const config = { matcher: ["/workspace/:path*", "/embed/:path*"] };
