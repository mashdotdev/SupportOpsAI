"use client";

import { useEffect, useState } from "react";
import { CheckCheck, RotateCcw } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import {
  Sheet,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { jsonResponse } from "@/lib/rag-client";
import {
  ConversationDetail,
  outcomeLabels,
  responseTime,
} from "@/lib/overview-client";

export function ConversationPanel({
  id,
  revision,
  onClose,
  onChange,
}: {
  id: string | null;
  revision: number;
  onClose: () => void;
  onChange: () => void;
}) {
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    fetch(`/api/overview/conversations/${id}`, { signal: controller.signal })
      .then(jsonResponse<ConversationDetail>)
      .then((data) => {
        if (!controller.signal.aborted) {
          setDetail(data);
          setLoadedId(id);
          setError("");
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setError(error.message);
          setLoadedId(id);
        }
      });
    return () => controller.abort();
  }, [id, revision]);

  async function resolve() {
    if (!detail || !id) return;
    setPending(true);
    try {
      const data = await fetch(`/api/overview/conversations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resolved: detail.conversation.status !== "resolved",
        }),
      }).then(jsonResponse<ConversationDetail>);
      setDetail(data);
      setError("");
      onChange();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Unable to update conversation.",
      );
    } finally {
      setPending(false);
    }
  }

  const current =
    loadedId === id && detail?.conversation.id === id ? detail : null;
  return (
    <Sheet
      isOpen={!!id}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      className="w-full! sm:max-w-2xl!"
    >
      <SheetHeader>
        <SheetTitle>Conversation details</SheetTitle>
        <SheetDescription>
          Messages, evidence, and recorded outcomes.
        </SheetDescription>
      </SheetHeader>
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 pb-6">
        {error && loadedId === id && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {!current && !error && (
          <>
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
          </>
        )}
        {current && (
          <>
            <div className="flex flex-col gap-3">
              <h2 className="wrap-anywhere text-lg font-medium">
                {current.conversation.subject}
              </h2>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">
                  {outcomeLabels[current.conversation.status]}
                </Badge>
                <Badge variant="outline">
                  {current.conversation.source === "test"
                    ? "Test activity"
                    : "Live activity"}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {current.conversation.agent_name}
                {current.conversation.agent_version
                  ? ` · Version ${current.conversation.agent_version}`
                  : ""}
              </p>
              <p className="wrap-anywhere text-xs text-muted-foreground">
                {current.conversation.model_id}
              </p>
              {current.conversation.reason && (
                <p className="text-sm">{current.conversation.reason}</p>
              )}
              {current.conversation.status === "needs_attention" && (
                <p className="text-xs text-muted-foreground">
                  Human assistance is recommended. No automatic handoff has
                  taken place.
                </p>
              )}
              <Button
                variant="outline"
                className="self-start"
                isDisabled={
                  pending ||
                  current.turns.some((turn) => turn.status === "running")
                }
                onPress={() => void resolve()}
              >
                {current.conversation.status === "resolved" ? (
                  <RotateCcw data-icon="inline-start" />
                ) : (
                  <CheckCheck data-icon="inline-start" />
                )}
                {pending
                  ? "Saving…"
                  : current.conversation.status === "resolved"
                    ? "Reopen conversation"
                    : "Mark resolved"}
              </Button>
            </div>
            <Separator />
            <div
              className="flex flex-col gap-6"
              aria-label="Conversation messages"
            >
              {current.turns.map((turn) => (
                <div key={turn.id} className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1">
                    <p className="text-xs font-medium text-muted-foreground">
                      Customer · {new Date(turn.created_at).toLocaleString()}
                    </p>
                    <p className="whitespace-pre-wrap wrap-anywhere text-sm">
                      {turn.question}
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 rounded-lg bg-muted/40 p-4">
                    <p className="text-xs font-medium text-muted-foreground">
                      {current.conversation.agent_name} ·{" "}
                      {turn.status === "completed"
                        ? responseTime(turn.duration_ms)
                        : turn.status}
                    </p>
                    {turn.answer && (
                      <p className="whitespace-pre-wrap wrap-anywhere text-sm leading-relaxed">
                        {turn.answer}
                      </p>
                    )}
                    {turn.status === "running" && (
                      <p
                        role="status"
                        className="text-sm text-muted-foreground"
                      >
                        Preparing an answer…
                      </p>
                    )}
                    {(turn.error || turn.status === "cancelled") && (
                      <p className="text-sm text-destructive">
                        {turn.error || "Response cancelled before completion."}
                      </p>
                    )}
                    {turn.citations.map((citation) => (
                      <details key={citation.id} className="text-sm">
                        <summary className="cursor-pointer wrap-anywhere text-muted-foreground">
                          [{citation.id}] {citation.filename} ·{" "}
                          {citation.location}
                        </summary>
                        <blockquote className="my-2 whitespace-pre-wrap wrap-anywhere border-l-2 pl-3 text-sm">
                          {citation.excerpt}
                        </blockquote>
                        <LinkButton
                          href={citation.url}
                          download
                          variant="link"
                          size="sm"
                        >
                          Download source
                        </LinkButton>
                      </details>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <Separator />
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">Activity history</h3>
              {current.events.map((event, index) => (
                <p key={index} className="text-xs text-muted-foreground">
                  {event.kind.replaceAll("_", " ")} ·{" "}
                  {new Date(event.created_at).toLocaleString()}
                </p>
              ))}
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}
