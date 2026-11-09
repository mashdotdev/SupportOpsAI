"use client";

import { useEffect, useState } from "react";
import {
  Check,
  Copy,
  Globe,
  MessageCircle,
  Pause,
  RefreshCw,
  Rocket,
  ShieldCheck,
  X,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import {
  Field,
  FieldContent,
  FieldGroup,
  FieldLabel,
  FieldDescription,
  FieldSet,
  FieldLegend,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ConversationsPage } from "@/components/overview/conversations-page";
import { jsonResponse, type KnowledgeDocument } from "@/lib/rag-client";
import { type SavedAgent } from "@/lib/agents-client";
import {
  widgetDefaults,
  type WidgetDraft,
  type WidgetSettings,
} from "@/lib/widget-client";

const lines = (value: string) =>
  value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);

function WidgetPreview({ form }: { form: WidgetDraft }) {
  const [mobile, setMobile] = useState(false);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Widget preview</CardTitle>
        <CardDescription>
          A visual preview. Use your website to test a live conversation.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <NativeSelect
          aria-label="Preview size"
          value={mobile ? "mobile" : "desktop"}
          onChange={(event) => setMobile(event.target.value === "mobile")}
        >
          <NativeSelectOption value="desktop">Desktop</NativeSelectOption>
          <NativeSelectOption value="mobile">Mobile</NativeSelectOption>
        </NativeSelect>
        <div className="flex min-h-[480px] items-end justify-end rounded-xl bg-muted/40 p-3">
          <div
            className="flex w-full flex-col gap-3"
            style={{
              maxWidth: mobile ? 300 : 370,
              alignItems: form.position === "left" ? "flex-start" : "flex-end",
            }}
          >
            <div className="w-full overflow-hidden rounded-2xl border bg-background shadow-lg">
              <div className="flex items-center gap-3 border-b p-4">
                <span
                  className="grid size-10 shrink-0 place-items-center rounded-xl text-white"
                  style={{ background: form.color }}
                >
                  <MessageCircle className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">
                    {form.business_name || "Support"}
                  </p>
                  <p className="text-xs text-muted-foreground">AI assistant</p>
                </div>
                <X className="size-4 text-muted-foreground" />
              </div>
              <div className="flex min-h-56 flex-col gap-4 p-4">
                <p className="rounded-2xl rounded-tl-sm bg-muted p-3 text-sm leading-relaxed">
                  {form.welcome_message}
                </p>
                <div className="flex flex-col items-start gap-2">
                  {form.suggested_questions.map((question) => (
                    <Button
                      key={question}
                      variant="outline"
                      className="h-auto max-w-full whitespace-normal text-left"
                      isDisabled
                    >
                      {question}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-3 border-t p-3">
                <Input
                  aria-label="Preview message"
                  placeholder="Write your message…"
                  disabled
                />
                <p className="text-center text-[10px] text-muted-foreground">
                  AI can make mistakes. Conversations are stored. Privacy policy
                </p>
              </div>
            </div>
            <span
              className="grid size-14 place-items-center rounded-full text-white shadow-md"
              style={{ background: form.color }}
            >
              <MessageCircle className="size-6" />
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function WidgetSettingsPage() {
  const [data, setData] = useState<WidgetSettings | null>(null);
  const [form, setForm] = useState<WidgetDraft>(widgetDefaults);
  const [origins, setOrigins] = useState("");
  const [questions, setQuestions] = useState("");
  const [agents, setAgents] = useState<SavedAgent[]>([]);
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [host, setHost] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [copied, setCopied] = useState(false);

  function adopt(result: WidgetSettings) {
    setData(result);
    const draft = { ...widgetDefaults, ...result.widget.draft };
    setForm(draft);
    setOrigins(draft.allowed_origins.join("\n"));
    setQuestions(draft.suggested_questions.join("\n"));
  }
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch("/api/widgets", { signal: controller.signal }).then(
        jsonResponse<WidgetSettings>,
      ),
      fetch("/api/agents", { signal: controller.signal }).then(
        jsonResponse<{ agents: SavedAgent[] }>,
      ),
      fetch("/api/knowledge-base/documents", {
        signal: controller.signal,
      }).then(jsonResponse<{ documents: KnowledgeDocument[] }>),
    ])
      .then(([widget, agents, documents]) => {
        if (!controller.signal.aborted) {
          adopt(widget);
          setAgents(agents.agents);
          setDocuments(documents.documents);
          setHost(window.location.origin);
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoaded(true);
      });
    return () => controller.abort();
  }, []);

  const value = {
    ...form,
    allowed_origins: lines(origins),
    suggested_questions: lines(questions),
  };
  const saved = { ...widgetDefaults, ...data?.widget.draft };
  const dirty = JSON.stringify(value) !== JSON.stringify(saved);
  const agent = agents.find((item) => item.id === form.agent_id);
  const eligible = documents.filter(
    (document) =>
      agent &&
      (agent.knowledge_mode === "all" ||
        agent.document_ids.includes(document.id)),
  );
  const snippet =
    data && host
      ? `<script\n  src="${host}/widget.js"\n  data-widget-id="${data.widget.id}"\n  async\n></script>`
      : "";

  async function action(kind: "save" | "publish" | "pause") {
    if (!data || pending) return;
    setPending(true);
    setError("");
    setNotice("");
    try {
      const result = await fetch(
        `/api/widgets${kind === "save" ? "" : "/" + kind}`,
        {
          method: kind === "save" ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            kind === "save"
              ? { ...value, version: data.widget.version }
              : { version: data.widget.version },
          ),
        },
      ).then(jsonResponse<WidgetSettings>);
      adopt(result);
      setNotice(
        kind === "save"
          ? "Draft saved. Publish when you are ready to update your website."
          : kind === "publish"
            ? "Widget published. New conversations will use this version."
            : "Widget paused. New messages are blocked immediately.",
      );
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Unable to update widget.",
      );
    } finally {
      setPending(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
    } catch {
      setError(
        "Clipboard access is unavailable. Select and copy the snippet below.",
      );
    }
  }

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 p-4 md:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">Website Widget</h1>
            <Badge variant="secondary">
              {data?.widget.enabled
                ? "Published"
                : data?.published
                  ? "Paused"
                  : "Draft"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Bring your support agent to your website. Manage every conversation
            here.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            isDisabled={!data || pending || !dirty}
            onPress={() => void action("save")}
          >
            Save draft
          </Button>
          {data?.widget.enabled && (
            <Button
              variant="outline"
              isDisabled={pending}
              onPress={() => void action("pause")}
            >
              <Pause data-icon="inline-start" />
              Pause
            </Button>
          )}
          <Button
            isDisabled={!data || pending || dirty || !agent}
            onPress={() => void action("publish")}
          >
            <Rocket data-icon="inline-start" />
            {pending
              ? "Saving…"
              : data?.published
                ? "Publish update"
                : "Publish widget"}
          </Button>
        </div>
      </header>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {notice && (
        <Alert>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      {dirty && (
        <p className="text-sm text-muted-foreground">
          You have unsaved changes. Save your draft before publishing.
        </p>
      )}
      {!loaded ? (
        <Skeleton className="h-96 w-full" />
      ) : !data ? (
        <Button variant="outline" onPress={() => window.location.reload()}>
          <RefreshCw data-icon="inline-start" />
          Reload widget settings
        </Button>
      ) : (
        <Tabs defaultSelectedKey="agent" className="flex flex-col gap-6">
          <TabsList
            aria-label="Widget settings"
            className="max-w-full overflow-x-auto"
          >
            <TabsTrigger id="agent">Agent & knowledge</TabsTrigger>
            <TabsTrigger id="appearance">Appearance</TabsTrigger>
            <TabsTrigger id="installation">Installation</TabsTrigger>
            <TabsTrigger id="activity">Activity</TabsTrigger>
          </TabsList>
          <TabsContent id="agent">
            <div className="grid items-start gap-6 lg:grid-cols-[1.2fr_1fr]">
              <div className="flex flex-col gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Choose your agent</CardTitle>
                    <CardDescription>
                      Use its saved model, instructions, authority, and
                      escalation rules.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-4">
                    {!agents.length ? (
                      <Empty>
                        <EmptyHeader>
                          <EmptyTitle>Create an agent first</EmptyTitle>
                          <EmptyDescription>
                            Configure the assistant that will answer your
                            customers.
                          </EmptyDescription>
                        </EmptyHeader>
                        <LinkButton href="/workspace/ai-agent/new">
                          Create agent
                        </LinkButton>
                      </Empty>
                    ) : (
                      <FieldGroup>
                        <Field>
                          <FieldLabel htmlFor="widget-agent">Agent</FieldLabel>
                          <NativeSelect
                            id="widget-agent"
                            value={form.agent_id || ""}
                            onChange={(event) =>
                              setForm({
                                ...form,
                                agent_id: event.target.value || null,
                                document_ids: [],
                              })
                            }
                          >
                            <NativeSelectOption value="">
                              Select an agent
                            </NativeSelectOption>
                            {agents.map((item) => (
                              <NativeSelectOption key={item.id} value={item.id}>
                                {item.name}
                              </NativeSelectOption>
                            ))}
                          </NativeSelect>
                        </Field>
                        {agent && (
                          <>
                            <FieldDescription>
                              {agent.model_id} · Saved version {agent.version}
                            </FieldDescription>
                            <p className="text-sm">
                              Slack escalation:{" "}
                              {agent.slack_notifications
                                ? "Enabled for this agent"
                                : "Disabled for this agent"}
                            </p>
                            <LinkButton
                              href={`/workspace/ai-agent/${agent.id}`}
                              variant="outline"
                              className="self-start"
                            >
                              Edit agent
                            </LinkButton>
                          </>
                        )}
                      </FieldGroup>
                    )}
                    <Alert>
                      <ShieldCheck />
                      <AlertDescription>
                        Publishing copies the saved configuration. Later agent
                        edits require a new publication. Revoked permissions and
                        removed documents take effect immediately.
                      </AlertDescription>
                    </Alert>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Website knowledge</CardTitle>
                    <CardDescription>
                      Approve exactly which documents may inform customer-facing
                      answers. New uploads are excluded until approved and
                      published.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <FieldSet>
                      <FieldLegend className="sr-only">
                        Approved website documents
                      </FieldLegend>
                      <FieldGroup>
                        {!eligible.length ? (
                          <p className="text-sm text-muted-foreground">
                            {agent
                              ? "No permitted documents yet. Add knowledge or adjust the agent’s selection."
                              : "Select an agent to choose its website knowledge."}
                          </p>
                        ) : (
                          eligible.map((document) => (
                            <Field
                              key={document.id}
                              orientation="horizontal"
                            >
                              <Checkbox
                                id={`widget-document-${document.id}`}
                                aria-label={`Approve ${document.filename}`}
                                isSelected={form.document_ids.includes(
                                  document.id,
                                )}
                                isDisabled={
                                  document.status !== "ready" &&
                                  !form.document_ids.includes(document.id)
                                }
                                onChange={(checked) =>
                                  setForm({
                                    ...form,
                                    document_ids: checked
                                      ? [...form.document_ids, document.id]
                                      : form.document_ids.filter(
                                          (id) => id !== document.id,
                                        ),
                                  })
                                }
                              />
                              <FieldContent className="min-w-0">
                                <p className="wrap-anywhere text-sm">
                                  {document.filename}
                                </p>
                                <FieldDescription>
                                  {document.status}
                                </FieldDescription>
                              </FieldContent>
                            </Field>
                          ))
                        )}
                      </FieldGroup>
                    </FieldSet>
                    <p className="mt-4 text-xs text-muted-foreground">
                      Unchecking a document and saving revokes website access
                      immediately. With no approved documents, the agent can
                      greet visitors and request human assistance.
                    </p>
                  </CardContent>
                </Card>
              </div>
              <WidgetPreview form={value} />
            </div>
          </TabsContent>
          <TabsContent id="appearance">
            <div className="grid items-start gap-6 lg:grid-cols-[1.2fr_1fr]">
              <Card>
                <CardHeader>
                  <CardTitle>Make it yours</CardTitle>
                  <CardDescription>
                    A welcoming chat that fits your business.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="business-name">
                        Business name
                      </FieldLabel>
                      <Input
                        id="business-name"
                        maxLength={80}
                        value={form.business_name}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            business_name: event.target.value,
                          })
                        }
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="welcome-message">
                        Welcome message
                      </FieldLabel>
                      <Textarea
                        id="welcome-message"
                        maxLength={500}
                        value={form.welcome_message}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            welcome_message: event.target.value,
                          })
                        }
                      />
                    </Field>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field>
                        <FieldLabel htmlFor="widget-color">
                          Brand color
                        </FieldLabel>
                        <Input
                          id="widget-color"
                          type="color"
                          value={form.color}
                          onChange={(event) =>
                            setForm({ ...form, color: event.target.value })
                          }
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="widget-position">
                          Position
                        </FieldLabel>
                        <NativeSelect
                          id="widget-position"
                          value={form.position}
                          onChange={(event) =>
                            setForm({
                              ...form,
                              position: event.target.value as "left" | "right",
                            })
                          }
                        >
                          <NativeSelectOption value="right">
                            Bottom right
                          </NativeSelectOption>
                          <NativeSelectOption value="left">
                            Bottom left
                          </NativeSelectOption>
                        </NativeSelect>
                      </Field>
                    </div>
                    <Field>
                      <FieldLabel htmlFor="suggested-questions">
                        Suggested questions
                      </FieldLabel>
                      <Textarea
                        id="suggested-questions"
                        maxLength={610}
                        value={questions}
                        onChange={(event) => setQuestions(event.target.value)}
                      />
                      <FieldDescription>
                        One per line, up to four. Maximum 150 characters each.
                      </FieldDescription>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="support-email">
                        Support email
                      </FieldLabel>
                      <Input
                        id="support-email"
                        type="email"
                        maxLength={254}
                        value={form.support_email}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            support_email: event.target.value,
                          })
                        }
                      />
                      <FieldDescription>
                        Shown as a fallback when human help is needed.
                      </FieldDescription>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="privacy-url">
                        Privacy policy URL
                      </FieldLabel>
                      <Input
                        id="privacy-url"
                        type="url"
                        maxLength={1000}
                        placeholder="https://example.com/privacy"
                        value={form.privacy_url}
                        onChange={(event) =>
                          setForm({ ...form, privacy_url: event.target.value })
                        }
                      />
                      <FieldDescription>
                        Required before publishing. Explain how your business
                        uses chat and contact details.
                      </FieldDescription>
                    </Field>
                  </FieldGroup>
                </CardContent>
              </Card>
              <WidgetPreview form={value} />
            </div>
          </TabsContent>
          <TabsContent id="installation">
            <div className="grid items-start gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Approved websites</CardTitle>
                  <CardDescription>
                    Allow exact origins. Add www and other subdomains
                    separately.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="widget-origins">
                        Website origins
                      </FieldLabel>
                      <Textarea
                        id="widget-origins"
                        value={origins}
                        maxLength={10000}
                        placeholder={
                          "https://example.com\nhttps://www.example.com"
                        }
                        onChange={(event) => setOrigins(event.target.value)}
                      />
                      <FieldDescription>
                        One per line. HTTPS required, except localhost for
                        development. Removing an origin and saving blocks it
                        immediately.
                      </FieldDescription>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="widget-limit">
                        Daily customer-message limit
                      </FieldLabel>
                      <Input
                        id="widget-limit"
                        type="number"
                        min={1}
                        max={1000}
                        value={form.daily_message_limit}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            daily_message_limit: Number(event.target.value),
                          })
                        }
                      />
                      <FieldDescription>
                        Resets at midnight UTC. A shared model-request budget
                        can stop traffic earlier.
                      </FieldDescription>
                    </Field>
                  </FieldGroup>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Install your widget</CardTitle>
                  <CardDescription>
                    Paste this snippet before your website’s closing body tag.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <Textarea
                    aria-label="Widget embed snippet"
                    readOnly
                    value={snippet}
                    rows={6}
                    className="font-mono text-xs"
                  />
                  <Button
                    variant="outline"
                    className="self-start"
                    onPress={() => void copy()}
                  >
                    {copied ? (
                      <Check data-icon="inline-start" />
                    ) : (
                      <Copy data-icon="inline-start" />
                    )}
                    {copied ? "Copied" : "Copy snippet"}
                  </Button>
                  <p className="text-sm">
                    {data.widget.last_seen_at
                      ? `Last customer session: ${new Date(data.widget.last_seen_at).toLocaleString()}`
                      : "Waiting for the first customer conversation."}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Publish first. Your app must be hosted at a public HTTPS
                    address for external websites. If your website uses a
                    Content Security Policy, allow this app for scripts and
                    frames.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    No API keys are included. The widget runs independently of
                    your workspace login.
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
          <TabsContent id="activity">
            <div className="flex flex-col gap-6">
              <div className="grid gap-4 sm:grid-cols-3">
                <Card>
                  <CardHeader>
                    <CardDescription>Messages today (UTC)</CardDescription>
                    <CardTitle>{data.today_messages}</CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader>
                    <CardDescription>Published version</CardDescription>
                    <CardTitle>
                      {data.published
                        ? `Version ${data.published.number}`
                        : "Not published"}
                    </CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader>
                    <CardDescription>Channel status</CardDescription>
                    <CardTitle>
                      {data.widget.enabled ? "Live" : "Paused / draft"}
                    </CardTitle>
                  </CardHeader>
                </Card>
              </div>
              <Alert>
                <Globe />
                <AlertDescription>
                  Live conversations use the published agent and real Slack
                  delivery when permitted. Playground tests remain separate.
                </AlertDescription>
              </Alert>
              <ConversationsPage widgetOnly />
            </div>
          </TabsContent>
        </Tabs>
      )}
    </main>
  );
}
