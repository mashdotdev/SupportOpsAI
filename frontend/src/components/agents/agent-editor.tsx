"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, FlaskConical, Save } from "lucide-react";
import { AgentConfiguration, AgentModel, Authority, SavedAgent, configurationOf, initialConfiguration } from "@/lib/agents-client";
import { KnowledgeDocument, jsonResponse } from "@/lib/rag-client";
import { AgentChat } from "@/components/agents/agent-chat";
import { ModelPicker } from "@/components/agents/model-picker";
import { Button, LinkButton } from "@/components/ui/button";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { cn } from "@/lib/utils";

const authorityFields: { key: keyof Authority; label: string; description: string; limit: number }[] = [
  { key: "scope", label: "Scope", description: "What can this agent help with? Define the topics and requests within its role.", limit: 3000 },
  { key: "communication_style", label: "Communication style", description: "Describe its tone, formality, response length, and how it should explain things.", limit: 2000 },
  { key: "boundaries", label: "Boundaries", description: "What must it never promise, claim, approve, or decide?", limit: 3000 },
  { key: "escalation_rules", label: "Escalation rules", description: "When should the agent recommend human assistance?", limit: 3000 },
  { key: "escalation_message", label: "Escalation message", description: "The exact message shown when human assistance is needed. No automatic handoff is performed.", limit: 1500 },
];

export function AgentEditor({ agentId }: { agentId?: string }) {
  const router = useRouter();
  const [form, setForm] = useState<AgentConfiguration>(() => configurationOf(initialConfiguration));
  const [baseline, setBaseline] = useState<AgentConfiguration>(() => configurationOf(initialConfiguration));
  const [saved, setSaved] = useState<SavedAgent | null>(null);
  const [loading, setLoading] = useState(!!agentId);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [models, setModels] = useState<AgentModel[]>([{ id: "openrouter/free", name: "Auto — free router", provider: "OpenRouter", context_length: null }]);
  const [modelError, setModelError] = useState("");
  const [modelsLoading, setModelsLoading] = useState(false);
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(true);
  const [documentError, setDocumentError] = useState("");
  const [mobileView, setMobileView] = useState<"configure" | "test">("configure");
  const dirty = JSON.stringify(form) !== JSON.stringify(baseline);

  const loadAgent = useCallback(async () => {
    if (!agentId) return;
    setLoading(true); setLoadError("");
    try {
      const { agent } = await jsonResponse<{ agent: SavedAgent }>(await fetch(`/api/agents/${agentId}`, { cache: "no-store" }));
      setSaved(agent); setForm(configurationOf(agent)); setBaseline(configurationOf(agent)); setError(""); setNotice("");
    } catch (error) { setLoadError(error instanceof Error ? error.message : "Could not load this agent."); }
    finally { setLoading(false); }
  }, [agentId]);
  const loadModels = useCallback(async () => {
    setModelsLoading(true); setModelError("");
    try { setModels((await jsonResponse<{ models: AgentModel[] }>(await fetch("/api/agents/models", { cache: "no-store" }))).models); }
    catch (error) { setModelError(error instanceof Error ? error.message : "Could not load models."); }
    finally { setModelsLoading(false); }
  }, []);
  const loadDocuments = useCallback(async () => {
    setDocumentsLoading(true); setDocumentError("");
    try { setDocuments((await jsonResponse<{ documents: KnowledgeDocument[] }>(await fetch("/api/knowledge-base/documents", { cache: "no-store" }))).documents.filter((document) => document.status !== "deleting")); }
    catch (error) { setDocumentError(error instanceof Error ? error.message : "Could not load documents."); }
    finally { setDocumentsLoading(false); }
  }, []);
  useEffect(() => {
    const initial = setTimeout(() => { void loadAgent(); void loadModels(); void loadDocuments(); }, 0);
    return () => clearTimeout(initial);
  }, [loadAgent, loadModels, loadDocuments]);
  useEffect(() => {
    if (!dirty) return;
    function warn(event: BeforeUnloadEvent) { event.preventDefault(); }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function change<K extends keyof AgentConfiguration>(key: K, value: AgentConfiguration[K]) {
    setForm((previous) => ({ ...previous, [key]: value })); setNotice("");
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch(saved ? `/api/agents/${saved.id}` : "/api/agents", {
        method: saved ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, document_ids: form.knowledge_mode === "all" ? [] : form.document_ids, ...(saved ? { version: saved.version } : {}) }),
      });
      const { agent } = await jsonResponse<{ agent: SavedAgent }>(response);
      setSaved(agent); setForm(configurationOf(agent)); setBaseline(configurationOf(agent));
      setNotice("Agent saved. The test conversation now uses this configuration.");
      if (!agentId) router.replace(`/workspace/ai-agent/${agent.id}`);
    } catch (error) { setError(error instanceof Error ? error.message : "Could not save agent."); }
    finally { setSaving(false); }
  }

  const unavailable = form.document_ids.filter((id) => !documents.some((document) => document.id === id));
  if (loading) return <main aria-label="Loading agent" role="status" className="mx-auto max-w-6xl p-6"><Skeleton className="h-12 w-64" /><Skeleton className="mt-6 h-96 w-full" /></main>;
  if (loadError) return <main className="mx-auto flex max-w-3xl flex-col gap-4 p-6"><LinkButton href="/workspace/ai-agent" variant="ghost">Back to agents</LinkButton><Alert variant="destructive"><AlertDescription>{loadError}</AlertDescription></Alert><Button onPress={() => void loadAgent()}>Retry</Button></main>;

  return <main className="agent-workspace mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><LinkButton href="/workspace/ai-agent" variant="link"><ArrowLeft data-icon="inline-start" />All agents</LinkButton><h1 className="mt-2 text-2xl font-medium lg:text-3xl">{saved ? "Edit agent" : "Create agent"}</h1><p className="mt-2 text-sm text-muted-foreground">Define how your agent helps, communicates, and knows when to ask for human support.</p></div>
      <div className="flex items-center gap-2"><Badge variant={dirty ? "outline" : "secondary"}>{dirty ? "Unsaved changes" : saved ? `Saved · v${saved.version}` : "New agent"}</Badge>{saved && <LinkButton href={`/workspace/playground?agent=${saved.id}`} variant="outline"><FlaskConical data-icon="inline-start" />Playground</LinkButton>}</div>
    </div>
    {error && <Alert variant="destructive"><AlertDescription>{error}{saved && " You can reload the saved version below; reloading discards unsaved edits."}</AlertDescription>{saved && <Button variant="outline" onPress={() => void loadAgent()}>Reload saved version</Button>}</Alert>}
    {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
    <div className="lg:hidden"><label htmlFor="agent-editor-view" className="sr-only">Editor view</label><NativeSelect id="agent-editor-view" value={mobileView} onChange={(event) => setMobileView(event.target.value as "configure" | "test")}><NativeSelectOption value="configure">Configuration</NativeSelectOption><NativeSelectOption value="test">Test agent</NativeSelectOption></NativeSelect></div>
    <div className="grid min-w-0 items-start gap-6 lg:grid-cols-2">
      <form onSubmit={(event) => void save(event)} className={cn("min-w-0", mobileView !== "configure" && "hidden lg:block")}>
        <FieldGroup>
          <Card><CardHeader><CardTitle>Identity & instructions</CardTitle><CardDescription>Give your agent a name, a model, and a clear role.</CardDescription></CardHeader><CardContent>
            <FieldGroup><Field><FieldLabel htmlFor="agent-name">Name</FieldLabel><Input id="agent-name" required maxLength={100} value={form.name} onChange={(event) => change("name", event.target.value)} placeholder="e.g. Customer Care" disabled={saving} /></Field>
              <Field><ModelPicker models={models} value={form.model_id} onChange={(value) => change("model_id", value)} disabled={saving || modelsLoading} /><FieldDescription>Free OpenRouter models only. Availability and shared quotas can change.</FieldDescription>
                {modelError && <Alert variant="destructive"><AlertDescription>{modelError} Auto — free router is still selectable.</AlertDescription></Alert>}
                <Button variant="link" isDisabled={modelsLoading} onPress={() => void loadModels()}>{modelsLoading ? "Loading models…" : "Refresh model list"}</Button>
              </Field>
              <Field><FieldLabel htmlFor="agent-instructions">Instructions</FieldLabel><Textarea id="agent-instructions" required maxLength={10000} rows={5} value={form.instructions} onChange={(event) => change("instructions", event.target.value)} disabled={saving} /><FieldDescription>Describe the role and workflow. Authority settings take precedence if they conflict.</FieldDescription></Field>
            </FieldGroup>
          </CardContent></Card>
          <Card><CardHeader><CardTitle>Authority</CardTitle><CardDescription>Set response boundaries and escalation behavior. This agent can read knowledge and reply.</CardDescription></CardHeader><CardContent><FieldGroup>
            {authorityFields.map(({ key, label, description, limit }) => <Field key={key}><FieldLabel htmlFor={`authority-${key}`}>{label}</FieldLabel><Textarea id={`authority-${key}`} required maxLength={limit} rows={3} value={form.authority[key]} onChange={(event) => change("authority", { ...form.authority, [key]: event.target.value })} disabled={saving} /><FieldDescription>{description}</FieldDescription></Field>)}
          </FieldGroup></CardContent></Card>
          <Card><CardHeader><CardTitle>Knowledge access</CardTitle><CardDescription>Use your existing documents. Only ready documents can be searched.</CardDescription></CardHeader><CardContent><FieldGroup>
            <Field><FieldLabel htmlFor="knowledge-mode">Documents this agent may search</FieldLabel><NativeSelect id="knowledge-mode" value={form.knowledge_mode} disabled={saving} onChange={(event) => { change("knowledge_mode", event.target.value as "all" | "selected"); if (event.target.value === "all") change("document_ids", []); }}><NativeSelectOption value="all">All my documents</NativeSelectOption><NativeSelectOption value="selected">Selected documents only</NativeSelectOption></NativeSelect><FieldDescription>{form.knowledge_mode === "all" ? "Includes future uploads once they are ready." : "Only the selected files are accessible. Selecting none gives this agent no documents."}</FieldDescription></Field>
            {documentError && <Alert variant="destructive"><AlertDescription>{documentError}</AlertDescription></Alert>}
            {form.knowledge_mode === "selected" && <FieldSet><FieldLegend variant="label">Select documents</FieldLegend>
              {documentsLoading ? <Skeleton className="h-24" /> : documents.length === 0 ? <p className="text-sm text-muted-foreground">No documents available. Upload files in Knowledge Base.</p> : documents.map((document) => <Field key={document.id} orientation="horizontal"><Checkbox id={`document-${document.id}`} aria-label={`Allow ${document.filename}`} isSelected={form.document_ids.includes(document.id)} isDisabled={saving} onChange={(checked) => change("document_ids", checked ? [...form.document_ids, document.id] : form.document_ids.filter((id) => id !== document.id))} /><FieldContent><p className="wrap-anywhere text-sm">{document.filename}</p><FieldDescription>{document.status === "ready" ? "Ready" : `${document.status.replaceAll("_", " ")} — available for search once ready`}</FieldDescription></FieldContent></Field>)}
              {!documentsLoading && !documentError && unavailable.map((id) => <div key={id} className="flex items-center justify-between gap-2"><p className="text-sm text-muted-foreground">A selected document is no longer available.</p><Button variant="outline" isDisabled={saving} onPress={() => change("document_ids", form.document_ids.filter((item) => item !== id))}>Remove selection</Button></div>)}
            </FieldSet>}
            <div className="flex flex-wrap gap-2"><LinkButton href="/workspace/knowledge-base" variant="link">Manage knowledge base</LinkButton><Button variant="link" isDisabled={documentsLoading} onPress={() => void loadDocuments()}>{documentsLoading ? "Loading documents…" : "Refresh documents"}</Button></div>
          </FieldGroup></CardContent></Card>
          <div className="flex items-center justify-between gap-3 border-t py-4"><p className="text-xs text-muted-foreground">Save before testing new changes.</p><Button type="submit" isDisabled={saving || (!!saved && !dirty) || !models.some((model) => model.id === form.model_id)}><Save data-icon="inline-start" />{saving ? "Saving…" : saved ? "Save changes" : "Create agent"}</Button></div>
        </FieldGroup>
      </form>
      <aside aria-label="Agent testing" className={cn("min-w-0 lg:sticky lg:top-4", mobileView !== "test" && "hidden lg:block")}>
        <Card><CardHeader><CardTitle>Test your agent</CardTitle><CardDescription>{dirty ? "Unsaved edits are not included. The conversation uses the last saved version." : "Try questions and inspect the sources behind your agent's answers."}</CardDescription></CardHeader><CardContent className="px-0">
          {saved ? <AgentChat key={`${saved.id}:${saved.version}`} agent={saved} embedded /> : <Empty className="min-h-80"><EmptyHeader><EmptyTitle>Save your agent to start testing</EmptyTitle><EmptyDescription>Its saved instructions, authority, model, and knowledge access will apply here.</EmptyDescription></EmptyHeader></Empty>}
        </CardContent></Card>
      </aside>
    </div>
  </main>;
}
