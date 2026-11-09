import { Suspense } from "react";
import { WidgetChat } from "@/components/widget/widget-chat";

export default function Page() {
  return (
    <Suspense fallback={<p role="status">Loading support chat…</p>}>
      <WidgetChat />
    </Suspense>
  );
}
