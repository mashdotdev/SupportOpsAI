import "../globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "Customer support",
  robots: { index: false, follow: false },
};
export default function EmbedLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
