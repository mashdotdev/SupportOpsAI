"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import { useParams } from "next/navigation";
import { ArrowUp, Headphones, MessageCircle, Plus, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { jsonResponse, readEvents } from "@/lib/rag-client";
import {
  notificationMessage,
  completeWidgetTurn,
  type PublicWidget,
  type VisitorConversation,
} from "@/lib/widget-client";

export function WidgetChat() {
  const { widgetId } = useParams<{ widgetId: string }>();
  const [config, setConfig] = useState<PublicWidget | null>(null);
  const [conversation, setConversation] = useState<VisitorConversation | null>(
    null,
  );
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [question, setQuestion] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [draft, setDraft] = useState<{
    request_id: string;
    message: string;
  } | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [contactSaved, setContactSaved] = useState(false);
  const [opened, setOpened] = useState(false);
  const token = useRef("");
  const parentOrigin = useRef("");
  const input = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  const bottom = useRef<HTMLDivElement>(null);
  const mounted = useRef(true);
  const stateVersion = useRef(0);
  const hasRunningTurn =
    conversation?.turns.some((turn) => turn.status === "running") || false;

  const post = useCallback(
    (data: Record<string, unknown>) => {
      if (parentOrigin.current)
        window.parent.postMessage({ ...data, widgetId }, parentOrigin.current);
    },
    [widgetId],
  );

  const api = useCallback(
    async (action: string, body?: unknown) => {
      return fetch(`/api/widget/${widgetId}/${action}`, {
        method: body === undefined ? "GET" : "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          "X-Widget-Session": token.current,
          "X-Widget-Site-Origin": parentOrigin.current,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    },
    [widgetId],
  );

  const refresh = useCallback(async () => {
    const expectedToken = token.current;
    const expectedVersion = stateVersion.current;
    const state = await api("conversation").then(
      jsonResponse<VisitorConversation>,
    );
    if (mounted.current && token.current === expectedToken && stateVersion.current === expectedVersion)
      setConversation(state);
    return state;
  }, [api]);

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    fetch(`/api/widget/${widgetId}/config`, { signal: controller.signal })
      .then(jsonResponse<PublicWidget>)
      .then(setConfig)
      .catch(() => {
        if (!controller.signal.aborted)
          setError("Support chat is currently unavailable.");
      });
    return () => {
      mounted.current = false;
      controller.abort();
    };
  }, [widgetId]);

  useEffect(() => {
    if (!config) return;
    let initialized = false;
    async function message(event: MessageEvent) {
      if (
        event.source !== window.parent ||
        !event.data ||
        event.data.widgetId !== widgetId
      )
        return;
      if (event.data.type === "supportops:init" && !initialized) {
        if (!config!.allowed_origins.includes(event.origin)) {
          setError("This website is not approved for this chat widget.");
          return;
        }
        initialized = true;
        parentOrigin.current = event.origin;
        setOpened(event.data.open === true);
        post({
          type: "supportops:appearance",
          color: config!.color,
          position: config!.position,
        });
        if (
          typeof event.data.token === "string" &&
          event.data.token.length <= 100
        )
          token.current = event.data.token;
        if (token.current) {
          try {
            const state = await refresh();
            setName(state.visitor_name);
            setEmail(state.visitor_email);
            setContactSaved(!!state.visitor_email);
          } catch {
            token.current = "";
            post({ type: "supportops:session", token: "" });
          }
        }
        setReady(true);
      } else if (
        event.origin === parentOrigin.current &&
        event.data.type === "supportops:focus"
      ) {
        setOpened(true);
        input.current?.focus();
      } else if (
        event.origin === parentOrigin.current &&
        event.data.type === "supportops:hidden"
      )
        setOpened(false);
    }
    window.addEventListener("message", message);
    // Readiness contains no credentials; initialization checks the sender's exact origin and source.
    window.parent.postMessage({ type: "supportops:ready", widgetId }, "*");
    return () => window.removeEventListener("message", message);
  }, [config, widgetId, post, refresh]);

  useEffect(() => {
    if (
      !token.current ||
      !opened ||
      !(
        hasRunningTurn ||
        conversation?.status === "needs_attention" ||
        ["queued", "sending"].includes(conversation?.notification_status || "")
      )
    )
      return;
    let inFlight = false;
    const timer = setInterval(
      () => {
        if (!document.hidden && !inFlight) {
          inFlight = true;
          void refresh()
            .catch(() => {})
            .finally(() => {
              inFlight = false;
            });
        }
      },
      conversation?.status === "needs_attention" ? 10000 : 4000,
    );
    return () => clearInterval(timer);
  }, [
    conversation?.status,
    conversation?.notification_status,
    hasRunningTurn,
    opened,
    refresh,
  ]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [conversation, draft, status]);

  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") post({ type: "supportops:close" });
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [post]);

  async function ensureSession() {
    if (token.current) return;
    const session = await api("sessions", {}).then(
      jsonResponse<{ token: string }>,
    );
    token.current = session.token;
    post({ type: "supportops:session", token: session.token });
  }

  async function send(message: string, retry = false, requestId?: string) {
    if (!message.trim() || busy.current || !ready) return;
    busy.current = true;
    stateVersion.current += 1;
    setPending(true);
    setError("");
    setStatus("Thinking…");
    const next =
      retry && draft
        ? draft
        : {
            request_id: requestId || crypto.randomUUID(),
            message: message.trim(),
          };
    setDraft(next);
    setQuestion("");
    try {
      await ensureSession();
      const response = await api("messages", next);
      if (!response.ok) await jsonResponse(response);
      if (!response.body)
        throw new Error("We could not open the chat response.");
      let done = false;
      for await (const event of readEvents(response.body)) {
        if (event.type === "status") setStatus(String(event.data.message));
        if (event.type === "error") throw new Error(String(event.data.error));
        if (event.type === "done") {
          stateVersion.current += 1;
          // Validate outside the updater so a malformed response follows retry recovery.
          completeWidgetTurn(null, event.data, next.message);
          setConversation((current) => completeWidgetTurn(current, event.data, next.message));
          setDraft(null);
          done = true;
          break;
        }
      }
      if (!done)
        throw new Error("Your answer was interrupted. Retry to recover it.");
      // A slow or failed history refresh cannot hide an already committed answer.
      void refresh().catch(() => {});
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "We could not send your message.",
      );
      if (token.current) {
        try {
          const state = await refresh();
          if (
            state.turns.some(
              (turn) =>
                turn.id === next.request_id && turn.status === "completed",
            )
          ) {
            setDraft(null);
            setError("");
          }
        } catch {
          /* Keep the message available for an explicit retry. */
        }
      }
    } finally {
      busy.current = false;
      setPending(false);
      setStatus("");
    }
  }

  async function action(kind: string, event?: FormEvent) {
    event?.preventDefault();
    if (busy.current || !ready) return;
    busy.current = true;
    stateVersion.current += 1;
    setPending(true);
    setError("");
    try {
      await ensureSession();
      const state = await api("actions", {
        action: kind,
        ...(kind === "contact" ? { name, email } : {}),
      }).then(jsonResponse<VisitorConversation>);
      setConversation(state);
      if (kind === "contact") setContactSaved(true);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Please try again.");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  const blocked =
    hasRunningTurn ||
    ["resolved", "needs_attention"].includes(conversation?.status || "");
  const accent = config?.color || "#0593c6";
  return (
    <main
      className="flex h-dvh flex-col bg-background text-foreground"
      style={{ "--widget-accent": accent } as CSSProperties}
    >
      <header className="flex items-center gap-3 border-b p-4">
        <span
          className="grid size-10 shrink-0 place-items-center rounded-xl text-white"
          style={{ background: accent }}
        >
          <MessageCircle className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-semibold">
            {config?.business_name || "Support"}
          </h1>
          <p className="text-xs text-muted-foreground">AI assistant</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Close chat"
          onPress={() => post({ type: "supportops:close" })}
        >
          <X />
        </Button>
      </header>
      <div
        className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4"
        role="log"
        aria-label="Chat messages"
        aria-live="polite"
      >
        {!config ? (
          <Skeleton className="h-20 w-3/4" />
        ) : (
          <>
            <p className="max-w-[92%] rounded-2xl rounded-tl-sm bg-muted p-3 text-sm leading-relaxed">
              {config.welcome_message}
            </p>
            {!conversation?.turns.length && !draft && (
              <div className="flex flex-col items-start gap-2">
                {config.suggested_questions.map((item) => (
                  <Button
                    key={item}
                    variant="outline"
                    className="h-auto max-w-full whitespace-normal text-left"
                    isDisabled={!ready || pending || !config.enabled}
                    onPress={() => void send(item)}
                  >
                    {item}
                  </Button>
                ))}
              </div>
            )}
          </>
        )}
        {conversation?.turns.map((turn) => (
          <div key={turn.id} className="flex flex-col gap-3">
            <p className="ml-auto max-w-[92%] whitespace-pre-wrap wrap-anywhere rounded-2xl rounded-tr-sm bg-primary/10 p-3 text-sm">
              {turn.question}
            </p>
            {turn.answer && (
              <p className="max-w-[92%] whitespace-pre-wrap wrap-anywhere rounded-2xl rounded-tl-sm bg-muted p-3 text-sm leading-relaxed">
                {turn.answer}
              </p>
            )}
            {["failed", "cancelled"].includes(turn.status) && (
              <div className="flex flex-col items-start gap-2">
                <p className="text-xs text-muted-foreground">
                  This answer was interrupted.
                </p>
                {!draft && turn.id === conversation.turns.at(-1)?.id && (
                  <Button
                    variant="outline"
                    size="sm"
                    isDisabled={pending}
                    onPress={() => void send(turn.question, false, turn.id)}
                  >
                    Retry message
                  </Button>
                )}
              </div>
            )}
          </div>
        ))}
        {draft &&
          !conversation?.turns.some((turn) => turn.id === draft.request_id) && (
            <p className="ml-auto max-w-[92%] whitespace-pre-wrap wrap-anywhere rounded-2xl bg-primary/10 p-3 text-sm">
              {draft.message}
            </p>
          )}
        {status && (
          <p role="status" className="text-xs text-muted-foreground">
            {status}
          </p>
        )}
        {config && !config.enabled && (
          <Alert>
            <AlertDescription>
              Chat is temporarily unavailable. Please use our support contact.
            </AlertDescription>
          </Alert>
        )}
        {conversation?.status === "answered" &&
          !pending &&
          !conversation.feedback && (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs text-muted-foreground">Did this help?</p>
              <Button
                variant="outline"
                size="sm"
                onPress={() => void action("helpful")}
              >
                Yes, thank you
              </Button>
              <Button
                variant="outline"
                size="sm"
                onPress={() => void action("unhelpful")}
              >
                I need more help
              </Button>
            </div>
          )}
        {conversation?.status === "resolved" && (
          <p role="status" className="text-sm text-muted-foreground">
            This conversation is resolved. Start a new conversation if you need
            anything else.
          </p>
        )}
        {conversation?.status === "needs_attention" && (
          <div className="flex flex-col gap-3">
            <Alert>
              <AlertDescription>
                {notificationMessage(conversation.notification_status)}
              </AlertDescription>
            </Alert>
            <form onSubmit={(event) => void action("contact", event)}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="visitor-name">
                    Name (optional)
                  </FieldLabel>
                  <Input
                    id="visitor-name"
                    autoComplete="name"
                    value={name}
                    maxLength={100}
                    onChange={(event) => {
                      setName(event.target.value);
                      setContactSaved(false);
                    }}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="visitor-email">
                    Email for follow-up
                  </FieldLabel>
                  <Input
                    id="visitor-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    maxLength={254}
                    required
                    onChange={(event) => {
                      setEmail(event.target.value);
                      setContactSaved(false);
                    }}
                  />
                </Field>
                <Button
                  type="submit"
                  variant="outline"
                  isDisabled={pending || contactSaved}
                >
                  {contactSaved
                    ? "Contact details saved"
                    : "Save contact details"}
                </Button>
              </FieldGroup>
            </form>
            <p className="text-xs text-muted-foreground">
              Follow-up details are shared with the business. A reply time is
              not guaranteed.
            </p>
          </div>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
            {draft && (
              <Button
                variant="outline"
                size="sm"
                isDisabled={pending}
                onPress={() => void send(draft.message, true)}
              >
                Retry message
              </Button>
            )}
          </Alert>
        )}
        {config?.support_email && (
          <a
            href={`mailto:${config.support_email}`}
            className="text-sm underline"
          >
            Email support
          </a>
        )}
        <div ref={bottom} />
      </div>
      <Separator />
      <footer className="flex flex-col gap-3 p-3">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="ghost"
            size="sm"
            isDisabled={pending || !ready || blocked}
            onPress={() => void action("support")}
          >
            <Headphones data-icon="inline-start" />
            Talk to support
          </Button>
          <Button
            variant="ghost"
            size="sm"
            isDisabled={pending}
            onPress={() => {
              token.current = "";
              setConversation(null);
              setDraft(null);
              setError("");
              setName("");
              setEmail("");
              setContactSaved(false);
              post({ type: "supportops:session", token: "" });
              input.current?.focus();
            }}
          >
            <Plus data-icon="inline-start" />
            New conversation
          </Button>
        </div>
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void send(question);
          }}
        >
          <Input
            ref={input}
            aria-label="Your message"
            placeholder={
              blocked
                ? "Start a new conversation to continue"
                : "Write your message…"
            }
            value={question}
            maxLength={4000}
            disabled={!ready || pending || blocked || !config?.enabled}
            onChange={(event) => setQuestion(event.target.value)}
          />
          <Button
            type="submit"
            size="icon"
            aria-label="Send message"
            isDisabled={
              !question.trim() ||
              pending ||
              blocked ||
              !ready ||
              !config?.enabled
            }
          >
            <ArrowUp />
          </Button>
        </form>
        <p className="text-center text-[10px] text-muted-foreground">
          AI can make mistakes. Conversations are stored.{" "}
          {config?.privacy_url && (
            <a
              href={config.privacy_url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              Privacy policy
            </a>
          )}
        </p>
      </footer>
    </main>
  );
}
