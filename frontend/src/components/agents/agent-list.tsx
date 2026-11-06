"use client";

import { useCallback, useEffect, useState } from "react";
import { Bot, FlaskConical, Plus, Trash2 } from "lucide-react";
import { SavedAgent } from "@/lib/agents-client";
import { jsonResponse } from "@/lib/rag-client";
import { Button, LinkButton } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertDialog, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter } from "@/components/ui/alert-dialog";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";

export function AgentList() {
  const [agents, setAgents] = useState<SavedAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [removing, setRemoving] = useState<SavedAgent | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setError(""); setLoading(true);
    try { setAgents((await jsonResponse<{ agents: SavedAgent[] }>(await fetch("/api/agents", { cache: "no-store" }))).agents); }
    catch (error) { setError(error instanceof Error ? error.message : "Could not load agents."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    const initial = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(initial);
  }, [load]);
  async function remove() {
    if (!removing) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/agents/${removing.id}`, { method: "DELETE" });
      if (!response.ok) await jsonResponse(response);
      setAgents((items) => items.filter((agent) => agent.id !== removing.id));
      setRemoving(null);
    } catch (error) { setError(error instanceof Error ? error.message : "Could not delete agent."); setRemoving(null); }
    finally { setBusy(false); }
  }
  return <main className="agent-workspace mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-2xl font-medium lg:text-3xl">AI Agents</h1><p className="mt-2 text-sm text-muted-foreground">Give your support agents a role, clear boundaries, and the knowledge to help.</p></div>
      <LinkButton href="/workspace/ai-agent/new"><Plus data-icon="inline-start" />Create agent</LinkButton>
    </div>
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription><Button variant="outline" onPress={() => void load()}>Retry</Button></Alert>}
    {loading ? <div aria-label="Loading agents" role="status" className="grid gap-4 md:grid-cols-2">{[0, 1].map((item) => <Skeleton key={item} className="h-52 rounded-xl" />)}</div> : agents.length ?
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{agents.map((agent) => <Card key={agent.id}>
        <CardHeader><CardTitle className="wrap-anywhere">{agent.name}</CardTitle><CardDescription className="wrap-anywhere">{agent.model_id === "openrouter/free" ? "Auto — free router" : agent.model_id}</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-3"><Badge variant="secondary">Free model</Badge><p className="line-clamp-2 text-sm text-muted-foreground">{agent.authority.scope}</p><p className="text-xs text-muted-foreground">{agent.knowledge_mode === "all" ? "All your ready documents" : `${agent.document_ids.length} selected documents`} · Updated {new Date(agent.updated_at).toLocaleDateString()}</p></CardContent>
        <CardFooter className="flex flex-wrap gap-2"><LinkButton href={`/workspace/ai-agent/${agent.id}`} variant="outline">Edit</LinkButton><LinkButton href={`/workspace/playground?agent=${agent.id}`} variant="ghost"><FlaskConical data-icon="inline-start" />Test</LinkButton><Button variant="ghost" size="icon" aria-label={`Delete ${agent.name}`} onPress={() => setRemoving(agent)}><Trash2 /></Button></CardFooter>
      </Card>)}</div> : !error && <Empty className="min-h-80 border"><EmptyHeader><EmptyMedia variant="icon"><Bot /></EmptyMedia><EmptyTitle>Create your first support agent</EmptyTitle><EmptyDescription>Choose a free model, define how your agent should help, and connect your knowledge base.</EmptyDescription></EmptyHeader><EmptyContent><LinkButton href="/workspace/ai-agent/new">Create agent</LinkButton></EmptyContent></Empty>}
    <AlertDialog isOpen={!!removing} onOpenChange={(open) => { if (!open && !busy) setRemoving(null); }}>
      <AlertDialogHeader><AlertDialogTitle>Delete this agent?</AlertDialogTitle><AlertDialogDescription>“{removing?.name}” and its saved configuration will be removed. Your knowledge documents will remain available.</AlertDialogDescription></AlertDialogHeader>
      <AlertDialogFooter><Button variant="outline" isDisabled={busy} onPress={() => setRemoving(null)}>Cancel</Button><Button variant="destructive" isDisabled={busy} onPress={() => void remove()}>{busy ? "Deleting…" : "Delete agent"}</Button></AlertDialogFooter>
    </AlertDialog>
  </main>;
}
