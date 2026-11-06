"use client";

import { Send, Square, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button, LinkButton } from "@/components/ui/button";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Sheet, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Citation, jsonResponse, readEvents } from "@/lib/rag-client";
import { SavedAgent } from "@/lib/agents-client";
import { cn } from "@/lib/utils";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  complete: boolean;
};

export function AgentChat({ agent, embedded = false }: { agent?: SavedAgent; embedded?: boolean }) {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [source, setSource] = useState<Citation | null>(null);
  const conversationRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const element = conversationRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [messages, status]);
  useEffect(() => () => controllerRef.current?.abort(), []);

  async function send(history: Message[], question: string) {
    if (controllerRef.current) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    const answerId = crypto.randomUUID();
    const userMessage: Message = { id: crypto.randomUUID(), role: "user", content: question, complete: true };
    const base = [...history, userMessage];
    setMessages([...base, { id: answerId, role: "assistant", content: "", complete: false }]);
    setMessage("");
    setError("");
    setRunning(true);
    setStatus("Preparing your answer…");
    let finished = false;
    try {
      // Only complete turns are eligible for conversation context. Keep whole pairs.
      const recent: { role: "user" | "assistant"; content: string }[] = [];
      let characters = question.length;
      for (let index = history.length - 2; index >= 0 && recent.length < 20; index -= 2) {
        const pair = history.slice(index, index + 2);
        if (!pair.every((item) => item.complete) || pair[1]?.role !== "assistant") continue;
        const size = pair.reduce((sum, item) => sum + item.content.length, 0);
        if (characters + size > 48000) break;
        recent.unshift(...pair.map(({ role, content }) => ({ role, content: content.slice(0, 12000) })));
        characters += size;
      }
      const response = await fetch(agent ? `/api/agents/${agent.id}/chat` : "/api/playground/chat", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ messages: [...recent, { role: "user", content: question }], ...(agent ? { version: agent.version } : {}) }),
      });
      if (!response.ok) await jsonResponse(response);
      if (!response.body) throw new Error("The server did not return a response stream.");
      for await (const event of readEvents(response.body)) {
        if (event.type === "status") setStatus(String(event.data.message));
        if (event.type === "text_delta") {
          setStatus("Writing an answer…");
          setMessages((items) => items.map((item) => item.id === answerId ? { ...item, content: item.content + String(event.data.delta) } : item));
        }
        if (event.type === "error") throw new Error(String(event.data.error));
        if (event.type === "done") {
          finished = true;
          setMessages((items) => items.map((item) => item.id === answerId ? {
            ...item, content: String(event.data.text), citations: event.data.citations as Citation[], complete: true,
          } : item));
          break;
        }
      }
      if (!finished) throw new Error("The connection ended before the answer was complete. Please retry.");
    } catch (error) {
      const stopped = controller.signal.aborted;
      setError(stopped ? "Answer stopped. You can retry this question." : error instanceof Error ? error.message : "The answer failed.");
      // Never leave an unverified partial policy answer visible as a completed response.
      setMessages(base);
    } finally {
      controllerRef.current = null;
      setRunning(false);
      setStatus("");
    }
  }

  const last = messages.at(-1);
  const needsRetry = !running && last?.role === "user";

  function renderAnswer(item: Message) {
    return item.content.split(/(\[S\d+\])/g).map((part, index) => {
      const citation = item.complete ? item.citations?.find((entry) => `[${entry.id}]` === part) : undefined;
      return citation ? <Button key={index} variant="link" size="xs" aria-label={`Source ${citation.id.slice(1)}: ${citation.filename}, ${citation.location}`} onPress={() => setSource(citation)}>[{citation.id.slice(1)}]</Button> : part;
    });
  }

  return (
    <section aria-label={agent ? `Test ${agent.name}` : "Knowledge base chat"} className={cn("flex min-h-0 w-full flex-col overflow-hidden", embedded ? "h-[650px] px-4" : "h-[calc(100dvh-12rem)] min-h-96")}>
      <div className="shrink-0 pb-4 pt-2 sm:pb-6 sm:pt-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-medium">{agent ? agent.name : "Knowledge base chat"}</h2>
          <Button variant="ghost" isDisabled={running || !messages.length} onPress={() => { setMessages([]); setError(""); setSource(null); }}><Trash2 /> Clear chat</Button>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{agent ? `Testing saved version ${agent.version}. ` : ""}This temporary chat clears when you refresh or switch agents.</p>
      </div>
      <div ref={conversationRef} role="log" aria-label="Chat messages" aria-live="polite" aria-busy={running} className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain py-4 pr-2 sm:gap-8">
        {messages.length === 0 && <div className="m-auto max-w-md text-center">
          <p className="text-lg font-medium">{agent ? "Meet your agent" : "Test your knowledge base"}</p>
          <p className="mt-2 text-sm text-foreground/70">{agent ? "Try a policy question, a greeting, or a request that should be escalated." : "Upload a policy, then ask a question about it."}</p>
          <LinkButton href="/workspace/knowledge-base" variant="link">Manage documents</LinkButton>
        </div>}
        {messages.map((item) => <div key={item.id} className={`min-w-0 max-w-full sm:max-w-[90%] ${item.role === "user" ? "self-end" : "self-start"}`}>
          <p className="mb-2 text-xs font-medium text-foreground/70">{item.role === "user" ? "You" : agent?.name || "Agent"}{!item.complete ? " · Draft" : ""}</p>
          <div className="min-w-0 whitespace-pre-wrap wrap-anywhere text-sm leading-relaxed sm:text-base">{item.role === "assistant" ? renderAnswer(item) : item.content}</div>
          {!!item.citations?.length && <div className="mt-3 flex flex-wrap gap-2" aria-label="Answer sources">
            {item.citations.map((citation) => <Button key={citation.id} variant="outline" size="sm" onPress={() => setSource(citation)}>[{citation.id.slice(1)}] {citation.filename} · {citation.location}</Button>)}
          </div>}
        </div>)}
      </div>
      {status && <p role="status" className="shrink-0 py-2 text-sm text-foreground/70">{status}</p>}
      {error && <div role="alert" className="shrink-0 py-2 text-sm text-destructive">{error}</div>}
      {needsRetry && <Button variant="outline" className="mb-2 self-start" onPress={() => void send(messages.slice(0, -1), last.content)}>Retry question</Button>}
      <form className="shrink-0 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]" onSubmit={(event) => {
        event.preventDefault();
        const question = message.trim();
        if (question && !running) void send(needsRetry ? messages.slice(0, -1) : messages, question);
      }}>
        <FieldGroup><Field orientation="horizontal">
          <label htmlFor="chat-message" className="sr-only">Message</label>
          <Input id="chat-message" placeholder="Ask about your documents" autoComplete="off" maxLength={4000} className="h-14 flex-1" value={message} onChange={(event) => setMessage(event.target.value)} disabled={running} />
          {running ? <Button type="button" size="icon-lg" aria-label="Stop answer" onPress={() => controllerRef.current?.abort()}><Square /></Button> :
            <Button type="submit" size="icon-lg" aria-label="Send message" isDisabled={!message.trim()}><Send /></Button>}
        </Field></FieldGroup>
      </form>
      <Sheet isOpen={!!source} onOpenChange={(open) => { if (!open) setSource(null); }}>
        <SheetHeader><SheetTitle>Source passage</SheetTitle></SheetHeader>
        {source && <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          <div><p className="wrap-anywhere font-medium">{source.filename}</p><p className="mt-1 text-sm text-foreground/70">{source.location}</p></div>
          <blockquote className="whitespace-pre-wrap wrap-anywhere border-l-2 border-border pl-4 text-sm leading-relaxed">{source.excerpt}</blockquote>
          <LinkButton href={source.url} download variant="outline">Open original</LinkButton>
          <p className="text-xs text-foreground/70">The original downloads securely. PDF page references are shown above.</p>
        </div>}
      </Sheet>
    </section>
  );
}
