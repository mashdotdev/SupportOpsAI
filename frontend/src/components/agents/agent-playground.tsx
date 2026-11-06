"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { SavedAgent } from "@/lib/agents-client";
import { jsonResponse } from "@/lib/rag-client";
import { AgentChat } from "@/components/agents/agent-chat";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Button, LinkButton } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";

export function AgentPlayground() {
  const params = useSearchParams();
  const router = useRouter();
  const selectedId = params.get("agent") || "";
  const [agents, setAgents] = useState<SavedAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setAgents((await jsonResponse<{ agents: SavedAgent[] }>(await fetch("/api/agents", { cache: "no-store" }))).agents); }
    catch (error) { setError(error instanceof Error ? error.message : "Could not load agents."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    const initial = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(initial);
  }, [load]);
  const agent = agents.find((item) => item.id === selectedId);
  return <main className="agent-workspace mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-medium lg:text-3xl">Playground</h1><p className="mt-2 text-sm text-muted-foreground">Test a saved agent or ask directly about your knowledge base.</p></div><LinkButton href="/workspace/ai-agent" variant="outline">Manage agents</LinkButton></div>
    <div className="flex flex-wrap items-end gap-3"><div className="flex min-w-0 flex-col gap-2"><label htmlFor="playground-agent" className="text-sm font-medium">Agent</label><NativeSelect id="playground-agent" value={selectedId} disabled={loading} onChange={(event) => router.replace(event.target.value ? `/workspace/playground?agent=${encodeURIComponent(event.target.value)}` : "/workspace/playground")}><NativeSelectOption value="">Knowledge base chat</NativeSelectOption>{selectedId && !agent && <NativeSelectOption value={selectedId}>Agent unavailable</NativeSelectOption>}{agents.map((item) => <NativeSelectOption key={item.id} value={item.id}>{item.name}</NativeSelectOption>)}</NativeSelect></div><Button variant="ghost" isDisabled={loading} onPress={() => void load()}>Reload agents</Button>{agent && <LinkButton href={`/workspace/ai-agent/${agent.id}`} variant="link">Edit agent</LinkButton>}</div>
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    {loading && selectedId ? <Skeleton className="h-96" /> : selectedId && !agent ? <Alert variant="destructive"><AlertDescription>This agent is unavailable. Select another agent or return to knowledge base chat.</AlertDescription></Alert> : <AgentChat key={agent ? `${agent.id}:${agent.version}` : "knowledge-base"} agent={agent} />}
  </main>;
}
