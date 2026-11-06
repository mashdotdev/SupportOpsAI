import { Suspense } from "react";
import { AgentPlayground } from "@/components/agents/agent-playground";
import { Skeleton } from "@/components/ui/skeleton";

export default function PlaygroundPage() {
  return <Suspense fallback={<Skeleton className="m-6 h-96" />}><AgentPlayground /></Suspense>;
}
