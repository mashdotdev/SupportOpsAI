"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Database, RefreshCw, Workflow } from "lucide-react";
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
  FieldGroup,
  FieldLabel,
  FieldDescription,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { jsonResponse } from "@/lib/rag-client";
import {
  connectionLabels,
  deliveryLabels,
  type IntegrationHistory,
  type SlackConnection,
} from "@/lib/integrations-client";
import { ConversationPanel } from "@/components/overview/conversation-detail";

function SlackSettings({
  connection,
  available,
  onChange,
}: {
  connection: SlackConnection | null;
  available: boolean;
  onChange: () => void;
}) {
  const [name, setName] = useState(connection?.name ?? "Support notifications");
  const [destination, setDestination] = useState(connection?.destination ?? "");
  const [url, setUrl] = useState("");
  const [enabled, setEnabled] = useState(connection?.enabled ?? true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  async function action(
    kind: "save" | "test" | "disconnect",
    event?: FormEvent,
  ) {
    event?.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    setNotice("");
    try {
      await jsonResponse(
        await fetch(
          `/api/integrations/slack${kind === "test" ? "/test" : ""}`,
          {
            method:
              kind === "save" ? "PUT" : kind === "test" ? "POST" : "DELETE",
            headers: { "Content-Type": "application/json" },
            ...(kind === "save"
              ? {
                  body: JSON.stringify({
                    name,
                    destination,
                    webhook_url: url || null,
                    enabled,
                    version: connection?.version,
                  }),
                }
              : {}),
          },
        ),
      );
      setUrl("");
      setNotice(
        kind === "test"
          ? "Test notification queued. Delivery appears in Execution history."
          : kind === "save"
            ? "Slack connection saved."
            : "Slack disconnected.",
      );
      onChange();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Unable to update Slack.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Slack</CardTitle>
          <Badge variant="secondary">
            {connection ? connectionLabels[connection.status] : "Not connected"}
          </Badge>
        </div>
        <CardDescription>
          Notify your support channel when a conversation needs human
          assistance.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {!available && (
          <Alert>
            <AlertDescription>
              Slack setup needs an encryption key on the backend. See the
              backend README for INTEGRATION_ENCRYPTION_KEY.
            </AlertDescription>
          </Alert>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {notice && <p role="status">{notice}</p>}
        {connection?.last_error && (
          <Alert variant="destructive">
            <AlertDescription>{connection.last_error}</AlertDescription>
          </Alert>
        )}
        <form onSubmit={(event) => void action("save", event)}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="slack-name">Connection name</FieldLabel>
              <Input
                id="slack-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                maxLength={100}
                disabled={pending}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="slack-destination">Channel label</FieldLabel>
              <Input
                id="slack-destination"
                placeholder="#support-escalations"
                value={destination}
                onChange={(event) => setDestination(event.target.value)}
                required
                maxLength={100}
                disabled={pending}
              />
              <FieldDescription>
                A label for your team. The webhook determines the actual Slack
                channel.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="slack-webhook">
                {connection ? "Replace webhook URL" : "Webhook URL"}
              </FieldLabel>
              <Input
                id="slack-webhook"
                type="password"
                autoComplete="new-password"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder={
                  connection
                    ? "Leave blank to keep the saved webhook"
                    : "https://hooks.slack.com/services/…"
                }
                required={!connection}
                maxLength={500}
                disabled={pending}
              />
              <FieldDescription>
                {connection
                  ? connection.webhook
                  : "Stored encrypted. Saving does not send a message."}
              </FieldDescription>
            </Field>
            <Field orientation="horizontal">
              <Checkbox
                id="slack-enabled"
                aria-label="Enable Slack notifications"
                isSelected={enabled}
                onChange={setEnabled}
                isDisabled={pending}
              />
              <FieldLabel htmlFor="slack-enabled">
                Enable Slack notifications
              </FieldLabel>
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" isDisabled={pending || !available}>
                {pending
                  ? "Working…"
                  : connection
                    ? "Save connection"
                    : "Connect Slack"}
              </Button>
              {connection && (
                <Button
                  variant="outline"
                  isDisabled={pending || !connection.enabled}
                  onPress={() => void action("test")}
                >
                  Send test notification
                </Button>
              )}
            </div>
          </FieldGroup>
        </form>
        {connection && (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">
              Last successful delivery:{" "}
              {connection.last_sent_at
                ? new Date(connection.last_sent_at).toLocaleString()
                : "None yet"}
              . Tests are labeled TEST in Slack.
            </p>
            {confirmDisconnect ? (
              <Alert>
                <AlertDescription>
                  Disconnect Slack and cancel pending notifications? Sent
                  messages and delivery history are retained.
                </AlertDescription>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    variant="destructive"
                    isDisabled={pending}
                    onPress={() => void action("disconnect")}
                  >
                    Confirm disconnect
                  </Button>
                  <Button
                    variant="outline"
                    onPress={() => setConfirmDisconnect(false)}
                  >
                    Keep connection
                  </Button>
                </div>
              </Alert>
            ) : (
              <Button
                variant="outline"
                className="self-start"
                onPress={() => setConfirmDisconnect(true)}
              >
                Disconnect Slack
              </Button>
            )}
          </div>
        )}
        <details>
          <summary className="cursor-pointer font-medium">
            How to get a Slack webhook
          </summary>
          <ol className="mt-3 flex list-decimal flex-col gap-2 pl-5 text-sm text-muted-foreground">
            <li>Create a Slack app in your workspace.</li>
            <li>Enable Incoming Webhooks in the app settings.</li>
            <li>
              Select Add New Webhook to Workspace and choose your support
              channel.
            </li>
            <li>
              Paste its webhook URL above, save, then send a test notification.
            </li>
          </ol>
          <LinkButton
            href="https://docs.slack.dev/messaging/sending-messages-using-incoming-webhooks/"
            target="_blank"
            rel="noopener noreferrer"
            variant="link"
          >
            Open Slack setup guide
          </LinkButton>
        </details>
      </CardContent>
    </Card>
  );
}

export function IntegrationsPage() {
  const [connection, setConnection] = useState<SlackConnection | null>(null);
  const [available, setAvailable] = useState(true);
  const [data, setData] = useState<IntegrationHistory | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [source, setSource] = useState("");
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ page: String(page), search });
    if (status) query.set("status", status);
    if (source) query.set("source", source);
    Promise.all([
      fetch("/api/integrations/slack", { signal: controller.signal }).then(
        jsonResponse<{
          connection: SlackConnection | null;
          available: boolean;
        }>,
      ),
      fetch(`/api/integrations/history?${query}`, {
        signal: controller.signal,
      }).then(jsonResponse<IntegrationHistory>),
    ])
      .then(([settings, history]) => {
        if (controller.signal.aborted) return;
        setConnection(settings.connection);
        setAvailable(settings.available);
        setData(history);
        setError("");
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      });
    return () => controller.abort();
  }, [page, search, status, source, revision]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 10000);
    const resume = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", resume);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [refresh]);
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-medium">Tools & Integrations</h1>
          <p className="mt-2 text-sm text-foreground/70">
            Connect your support team and control what your agents can do.
          </p>
        </div>
        <Button variant="outline" onPress={refresh}>
          <RefreshCw data-icon="inline-start" />
          Refresh
        </Button>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {notice && <p role="status">{notice}</p>}
      {!data ? (
        <Skeleton className="h-80 w-full" />
      ) : (
        <Tabs defaultSelectedKey="connections" className="gap-5">
          <TabsList aria-label="Integration sections" className="max-w-full">
            <TabsTrigger id="connections">Connections</TabsTrigger>
            <TabsTrigger id="capabilities">Capabilities</TabsTrigger>
            <TabsTrigger id="history">Execution history</TabsTrigger>
          </TabsList>
          <TabsContent id="connections">
            <SlackSettings
              key={`${connection?.id ?? "new"}:${connection?.version ?? 0}`}
              connection={connection}
              available={available}
              onChange={() => {
                setNotice("Connection updated.");
                refresh();
              }}
            />
          </TabsContent>
          <TabsContent id="capabilities" className="flex flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle>
                  <Database className="mr-2 inline size-4" />
                  Knowledge search
                </CardTitle>
                <CardDescription>
                  Read evidence from the agent’s permitted ready documents.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p>
                  Available to configured agents under their knowledge access
                  settings.
                </p>
                <LinkButton variant="link" href="/workspace/ai-agent">
                  Manage agent knowledge access
                </LinkButton>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>
                  <Workflow className="mr-2 inline size-4" />
                  Notify support team
                </CardTitle>
                <CardDescription>
                  Send a bounded problem excerpt, escalation reason, and
                  conversation link to Slack.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <p>
                  Enable this capability on individual agents. Playground
                  escalations are simulated unless real test delivery is
                  enabled.
                </p>
                {data.agents.length ? (
                  data.agents.map((agent) => (
                    <div
                      key={agent.id}
                      className="flex flex-wrap items-center justify-between gap-2 border-t pt-3"
                    >
                      <LinkButton
                        variant="link"
                        href={`/workspace/ai-agent/${agent.id}`}
                      >
                        {agent.name}
                      </LinkButton>
                      <Badge variant="outline">
                        {agent.slack_notifications
                          ? agent.slack_test_delivery
                            ? "Enabled · real test delivery"
                            : "Enabled · tests simulated"
                          : "Disabled"}
                      </Badge>
                    </div>
                  ))
                ) : (
                  <LinkButton href="/workspace/ai-agent/new" variant="outline">
                    Create an agent
                  </LinkButton>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent id="history">
            <Card>
              <CardHeader>
                <CardTitle>Execution history</CardTitle>
                <CardDescription>
                  Slack acceptance confirms notification delivery. Conversation
                  resolution is tracked separately.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <FieldGroup className="sm:grid sm:grid-cols-3">
                  <Field>
                    <FieldLabel htmlFor="notification-search">
                      Search
                    </FieldLabel>
                    <Input
                      id="notification-search"
                      placeholder="Problem or agent"
                      value={search}
                      onChange={(event) => {
                        setSearch(event.target.value);
                        setPage(1);
                      }}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="notification-status">
                      Delivery status
                    </FieldLabel>
                    <NativeSelect
                      id="notification-status"
                      value={status}
                      onChange={(event) => {
                        setStatus(event.target.value);
                        setPage(1);
                      }}
                    >
                      <NativeSelectOption value="">
                        All statuses
                      </NativeSelectOption>
                      {Object.entries(deliveryLabels).map(([value, label]) => (
                        <NativeSelectOption key={value} value={value}>
                          {label}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="notification-source">
                      Environment
                    </FieldLabel>
                    <NativeSelect
                      id="notification-source"
                      value={source}
                      onChange={(event) => {
                        setSource(event.target.value);
                        setPage(1);
                      }}
                    >
                      <NativeSelectOption value="">
                        All environments
                      </NativeSelectOption>
                      <NativeSelectOption value="test">Test</NativeSelectOption>
                      <NativeSelectOption value="live">Live</NativeSelectOption>
                    </NativeSelect>
                  </Field>
                </FieldGroup>
                {data.jobs.length ? (
                  <Table aria-label="Notification execution history">
                    <TableHeader>
                      <TableHead id="problem" isRowHeader>
                        Problem / agent
                      </TableHead>
                      <TableHead id="status">Delivery</TableHead>
                      <TableHead id="time">Created</TableHead>
                      <TableHead id="details">Details</TableHead>
                    </TableHeader>
                    <TableBody>
                      {data.jobs.map((job) => (
                        <TableRow key={job.id} id={job.id}>
                          <TableCell>
                            <p className="max-w-72 truncate">{job.question}</p>
                            <p className="text-xs text-muted-foreground">
                              {job.agent_name} ·{" "}
                              {job.source === "test" ? "Test" : "Live"}
                            </p>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {deliveryLabels[job.status]}
                            </Badge>
                            {job.error && (
                              <p className="mt-1 max-w-64 text-xs text-muted-foreground">
                                {job.error}
                              </p>
                            )}
                          </TableCell>
                          <TableCell>
                            {new Date(job.created_at).toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <details>
                              <summary className="cursor-pointer">
                                {job.attempts} attempts
                              </summary>
                              {data.attempts
                                .filter((attempt) => attempt.job_id === job.id)
                                .map((attempt) => (
                                  <p
                                    key={attempt.id}
                                    className="mt-2 max-w-64 text-xs"
                                  >
                                    Attempt {attempt.number}: {attempt.status}
                                    {attempt.http_status
                                      ? ` · HTTP ${attempt.http_status}`
                                      : ""}
                                    {attempt.error ? ` · ${attempt.error}` : ""}
                                  </p>
                                ))}
                              {job.status === "simulated" && (
                                <p className="mt-2 max-w-64 text-xs">
                                  Preview: {job.reason} · {job.question}. No
                                  message was sent.
                                </p>
                              )}
                            </details>
                            {job.conversation_id && (
                              <Button
                                variant="link"
                                onPress={() => setSelected(job.conversation_id)}
                              >
                                View conversation
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <Empty>
                    <EmptyHeader>
                      <EmptyTitle>No matching notifications</EmptyTitle>
                      <EmptyDescription>
                        Connection tests and agent escalations appear here.
                        Playground escalations simulate delivery by default.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                )}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    {data.total} notifications · Page {data.page}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      isDisabled={data.page <= 1}
                      onPress={() => setPage(data.page - 1)}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      isDisabled={data.page * 20 >= data.total}
                      onPress={() => setPage(data.page + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
      <ConversationPanel
        key={selected}
        id={selected}
        revision={revision}
        onClose={() => setSelected(null)}
        onChange={refresh}
      />
    </main>
  );
}
