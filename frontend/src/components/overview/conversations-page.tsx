"use client";

import { useCallback, useDeferredValue, useEffect, useState } from "react";
import { MessagesSquare, RefreshCw } from "lucide-react";
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
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyMedia,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead as TableColumn,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { jsonResponse } from "@/lib/rag-client";
import { outcomeLabels, type Conversation } from "@/lib/overview-client";
import { deliveryLabels } from "@/lib/integrations-client";
import { ConversationPanel } from "./conversation-detail";

type Inbox = { conversations: Conversation[]; total: number; page: number };
export function ConversationsPage({
  widgetOnly = false,
}: {
  widgetOnly?: boolean;
}) {
  const [source, setSource] = useState("live");
  const [search, setSearch] = useState("");
  const deferred = useDeferredValue(search);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Inbox | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const load = useCallback(
    async (signal?: AbortSignal) => {
      const params = new URLSearchParams({
        source,
        search: deferred,
        page: String(page),
        widget_only: String(widgetOnly),
      });
      if (status) params.set("status", status);
      try {
        const result = await fetch(`/api/overview/inbox?${params}`, {
          signal,
        }).then(jsonResponse<Inbox>);
        if (!signal?.aborted) {
          setData(result);
          setError("");
          setRevision((value) => value + 1);
        }
      } catch (error) {
        if (!signal?.aborted)
          setError(
            error instanceof Error
              ? error.message
              : "Unable to load conversations.",
          );
      }
    },
    [source, deferred, page, status, widgetOnly],
  );
  useEffect(() => {
    const controller = new AbortController();
    const initial = setTimeout(() => void load(controller.signal), 0);
    const refresh = () => {
      if (!document.hidden) void load(controller.signal);
    };
    const timer = setInterval(refresh, 10000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      controller.abort();
      clearTimeout(initial);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("conversation");
    if (id && /^[\da-f-]{36}$/i.test(id)) {
      const timer = setTimeout(() => setSelected(id), 0);
      return () => clearTimeout(timer);
    }
  }, []);
  return (
    <div className="flex flex-col gap-6">
      {!widgetOnly && (
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Conversations</h1>
            <p className="text-sm text-muted-foreground">
              Review customer questions, agent answers, and support escalations.
            </p>
          </div>
          <LinkButton href="/workspace/website-widget" variant="outline">
            Manage website widget
          </LinkButton>
        </header>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Card>
        <CardHeader>
          <CardTitle>
            {widgetOnly ? "Website conversations" : "Conversation inbox"}
          </CardTitle>
          <CardDescription>
            Updates every 10 seconds while this page is visible. Live and test
            activity stay separate.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <Input
              aria-label="Search conversations"
              placeholder="Search questions, names, or emails"
              className="max-w-sm"
              maxLength={200}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
            {!widgetOnly && (
              <NativeSelect
                aria-label="Conversation source"
                value={source}
                onChange={(event) => {
                  setSource(event.target.value);
                  setPage(1);
                }}
              >
                <NativeSelectOption value="live">
                  Live customers
                </NativeSelectOption>
                <NativeSelectOption value="test">
                  Test conversations
                </NativeSelectOption>
              </NativeSelect>
            )}
            <NativeSelect
              aria-label="Conversation outcome"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              <NativeSelectOption value="">All outcomes</NativeSelectOption>
              {Object.entries(outcomeLabels).map(([key, label]) => (
                <NativeSelectOption key={key} value={key}>
                  {label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <Button
              variant="outline"
              aria-label="Refresh conversations"
              onPress={() => void load()}
            >
              <RefreshCw />
            </Button>
          </div>
          {!data ? (
            <Skeleton className="h-40 w-full" />
          ) : !data.total ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <MessagesSquare />
                </EmptyMedia>
                <EmptyTitle>No conversations found</EmptyTitle>
                <EmptyDescription>
                  {search || status
                    ? "Try another search or outcome."
                    : "Customer conversations will appear here after your widget receives its first message."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table
                  aria-label="Customer conversations"
                  className="w-full text-sm"
                  selectionMode="none"
                >
                  <TableHeader>
                    <TableColumn isRowHeader className="p-3 text-left">
                      Customer / question
                    </TableColumn>
                    <TableColumn className="p-3 text-left">Agent</TableColumn>
                    <TableColumn className="p-3 text-left">Outcome</TableColumn>
                    <TableColumn className="p-3 text-left">Updated</TableColumn>
                    <TableColumn className="p-3">
                      <span className="sr-only">Actions</span>
                    </TableColumn>
                  </TableHeader>
                  <TableBody items={data.conversations}>
                    {(item) => (
                      <TableRow id={item.id} className="border-t">
                        <TableCell className="max-w-80 p-3">
                          <p className="truncate font-medium">
                            {item.visitor_name ||
                              item.visitor_email ||
                              "Anonymous visitor"}
                          </p>
                          <p className="line-clamp-2 text-muted-foreground">
                            {item.subject}
                          </p>
                        </TableCell>
                        <TableCell className="p-3">{item.agent_name}</TableCell>
                        <TableCell className="p-3">
                          <div className="flex flex-col items-start gap-1">
                            <Badge variant="secondary">
                              {outcomeLabels[item.status]}
                            </Badge>
                            {item.notification_status && (
                              <span className="text-xs text-muted-foreground">
                                {deliveryLabels[item.notification_status]}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap p-3 text-xs text-muted-foreground">
                          {new Date(item.updated_at).toLocaleString()}
                        </TableCell>
                        <TableCell className="p-3">
                          <Button
                            variant="outline"
                            size="sm"
                            onPress={() => setSelected(item.id)}
                          >
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  {data.total} conversations · Page {data.page} of{" "}
                  {Math.max(1, Math.ceil(data.total / 20))}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    isDisabled={data.page <= 1}
                    onPress={() => setPage(data.page - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    isDisabled={data.page * 20 >= data.total}
                    onPress={() => setPage(data.page + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
      <ConversationPanel
        id={selected}
        revision={revision}
        onClose={() => setSelected(null)}
        onChange={() => void load()}
      />
    </div>
  );
}
