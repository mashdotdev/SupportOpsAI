"use client";

import { useCallback, useEffect, useState } from "react";
import { DropZone, FileTrigger, ProgressBar } from "react-aria-components";
import { FileText, RefreshCw, Trash2, Upload } from "lucide-react";
import { Button, LinkButton } from "@/components/ui/button";
import { KnowledgeDocument, jsonResponse, uploadFile } from "@/lib/rag-client";

const statusLabels: Record<KnowledgeDocument["status"], string> = {
  awaiting_upload: "Awaiting upload", queued: "Queued", indexing: "Indexing", ready: "Ready", failed: "Failed", deleting: "Deleting",
};

export default function KnowledgeBase() {
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [upload, setUpload] = useState<{ name: string; percent: number } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try {
      const result = await jsonResponse<{ documents: KnowledgeDocument[] }>(await fetch("/api/knowledge-base/documents", { cache: "no-store" }));
      setDocuments(result.documents);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not load documents.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const initial = setTimeout(() => { void refresh(); }, 0);
    const interval = setInterval(() => { void refresh(); }, 5000);
    return () => { clearTimeout(initial); clearInterval(interval); };
  }, [refresh]);

  async function addFiles(files: File[]) {
    if (upload) return;
    setError("");
    for (const file of files) {
      let documentId: string | undefined;
      try {
        if (!/\.(pdf|docx|txt|md)$/i.test(file.name) || file.size < 1 || file.size > 20 * 1024 * 1024) {
          throw new Error(`${file.name}: choose a non-empty PDF, DOCX, TXT, or MD file up to 20 MiB.`);
        }
        setUpload({ name: file.name, percent: 0 });
        const result = await jsonResponse<{ document: KnowledgeDocument; upload: { url: string; fields: Record<string, string> } }>(await fetch("/api/knowledge-base/documents", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filename: file.name, size: file.size }),
        }));
        documentId = result.document.id;
        await uploadFile(file, result.upload, (percent) => setUpload({ name: file.name, percent }));
        await jsonResponse(await fetch(`/api/knowledge-base/documents/${documentId}/complete`, { method: "POST" }));
      } catch (error) {
        setError(error instanceof Error ? error.message : "Upload failed.");
        // Keep the record visible so a completion failure can be retried safely.
      } finally { await refresh(); }
    }
    setUpload(null);
  }

  async function action(document: KnowledgeDocument, operation: "retry" | "delete" | "complete") {
    setBusy(document.id);
    setError("");
    try {
      const suffix = operation === "delete" ? "" : `/${operation}`;
      await jsonResponse(await fetch(`/api/knowledge-base/documents/${document.id}${suffix}`, { method: operation === "delete" ? "DELETE" : "POST" }));
      await refresh();
    } catch (error) { setError(error instanceof Error ? error.message : "The action failed."); }
    finally { setBusy(null); }
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <h1 className="text-2xl font-medium lg:text-3xl">Knowledge Base</h1>
        <p className="mt-2 text-sm text-foreground/70">Upload policies and reference documents for your agent. Only you can access these files.</p>
      </div>
      <DropZone aria-label="Upload knowledge documents" isDisabled={!!upload}
        onDrop={async (event) => {
          const files = await Promise.all(event.items.filter((item) => item.kind === "file").map((item) => item.getFile()));
          await addFiles(files);
        }} className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-border p-8 text-center data-[drop-target]:bg-muted">
        <Upload aria-hidden="true" className="size-7 text-muted-foreground" />
        <p className="font-medium">Drop your documents here</p>
        <p className="text-sm text-foreground/70">PDF, DOCX, TXT, or Markdown · up to 20 MiB each · text-based files</p>
        <FileTrigger allowsMultiple acceptedFileTypes={[".pdf", ".docx", ".txt", ".md"]} onSelect={(files) => { if (files) void addFiles(Array.from(files)); }}>
          <Button isDisabled={!!upload}>Choose files</Button>
        </FileTrigger>
      </DropZone>
      {upload && <ProgressBar aria-label={`Uploading ${upload.name}`} value={upload.percent} className="flex flex-col gap-2">
        <p className="text-sm">Uploading {upload.name} — {upload.percent}%</p>
        <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${upload.percent}%` }} /></div>
      </ProgressBar>}
      {error && <p role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive">{error}</p>}
      <section aria-labelledby="documents-heading" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 id="documents-heading" className="text-lg font-medium">Your documents</h2>
          <Button variant="ghost" aria-label="Refresh documents" onPress={() => { setError(""); void refresh(); }}><RefreshCw /></Button>
        </div>
        {loading ? <p role="status" className="py-8 text-center text-foreground/70">Loading documents…</p> : documents.length === 0 ?
          <p className="rounded-xl border border-border p-8 text-center text-sm text-foreground/70">Your knowledge base is empty. Upload a policy to start chatting.</p> :
          <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
            {documents.map((document) => <li key={document.id} className="flex flex-wrap items-start gap-3 p-4">
              <FileText aria-hidden="true" className="mt-1 size-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="wrap-anywhere font-medium">{document.filename}</p>
                <p className="mt-1 text-sm text-foreground/70">{(document.byte_size / 1024).toFixed(1)} KiB · {statusLabels[document.status]}{document.status === "ready" ? ` · ${document.chunk_count} passages` : ""}</p>
                {document.error && <p className="mt-2 text-sm text-destructive">{document.error}</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                {!['awaiting_upload', 'deleting'].includes(document.status) && <LinkButton href={`/api/knowledge-base/documents/${document.id}/content`} download variant="outline" size="sm">Open original</LinkButton>}
                {document.status === "failed" && <Button variant="outline" size="sm" isDisabled={!!busy} onPress={() => void action(document, "retry")}>Retry indexing</Button>}
                {document.status === "awaiting_upload" && <Button variant="outline" size="sm" isDisabled={!!busy} onPress={() => void action(document, "complete")}>Finish upload</Button>}
                <Button variant="ghost" size="icon-sm" aria-label={`Delete ${document.filename}`} isDisabled={!!busy || document.status === "deleting"} onPress={() => void action(document, "delete")}><Trash2 /></Button>
              </div>
            </li>)}
          </ul>}
      </section>
    </main>
  );
}
