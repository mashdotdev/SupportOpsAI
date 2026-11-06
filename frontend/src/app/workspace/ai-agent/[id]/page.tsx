import { AgentEditor } from "@/components/agents/agent-editor";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

async function SavedAgentEditor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AgentEditor key={id} agentId={id} />;
}

export default function EditAgentPage({ params }: { params: Promise<{ id: string }> }) {
  return <Suspense fallback={<Skeleton className="m-6 h-96" />}><SavedAgentEditor params={params} /></Suspense>;
}
