"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  ArrowDownUp,
  ArrowRight,
  Bot,
  CheckCheck,
  Clock3,
  HandHelping,
  LogOut,
  MessagesSquare,
  RefreshCw,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { authClient } from "@/lib/auth/client";
import {
  type Conversation,
  type Overview,
  outcomeLabels,
  responseTime,
  trendData,
} from "@/lib/overview-client";
import { jsonResponse } from "@/lib/rag-client";
import { deliveryLabels } from "@/lib/integrations-client";
import { ConversationPanel } from "./conversation-detail";

const chartConfig = {
  answered: { label: "Answered", color: "var(--chart-1)" },
  resolved: { label: "Resolved", color: "var(--chart-2)" },
  needs_attention: { label: "Needs attention", color: "var(--chart-3)" },
  other: { label: "Other", color: "var(--chart-4)" },
};

function NoActivity({
  test,
  filtered = false,
}: {
  test: boolean;
  filtered?: boolean;
}) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <MessagesSquare />
        </EmptyMedia>
        <EmptyTitle>
          {filtered
            ? "No matching conversations"
            : test
              ? "Your first test starts here"
              : "No live conversations yet"}
        </EmptyTitle>
        <EmptyDescription>
          {filtered
            ? "Try another search or outcome filter."
            : test
              ? "Try an agent in the playground. Its conversation and outcome will appear here automatically."
              : "Customer conversations will appear here when a customer channel is connected. Switch to Test activity to inspect agent tests."}
        </EmptyDescription>
      </EmptyHeader>
      {!filtered && (
        <LinkButton href="/workspace/ai-agent" variant="outline" size="sm">
          View agents <ArrowRight data-icon="inline-end" />
        </LinkButton>
      )}
    </Empty>
  );
}

function ConversationTable({
  items,
  onOpen,
}: {
  items: Conversation[];
  onOpen: (id: string) => void;
}) {
  "use no memo"; // TanStack v8 returns mutable table APIs; keep this adapter outside React Compiler.
  const columns = useMemo<ColumnDef<Conversation>[]>(
    () => [
      {
        accessorKey: "subject",
        header: "Problem",
        cell: ({ row }) => (
          <div className="max-w-64 truncate font-medium">
            {row.original.subject}
          </div>
        ),
      },
      { accessorKey: "agent_name", header: "Agent" },
      {
        accessorKey: "status",
        header: "Outcome",
        cell: ({ row }) => (
          <Badge
            variant={
              row.original.status === "resolved" ? "default" : "secondary"
            }
          >
            {outcomeLabels[row.original.status]}
            {row.original.notification_status &&
              ` · ${deliveryLabels[row.original.notification_status]}`}
          </Badge>
        ),
      },
      {
        accessorKey: "reason",
        header: "Reason",
        cell: ({ row }) => (
          <div
            className="max-w-60 truncate text-muted-foreground"
            title={row.original.reason || undefined}
          >
            {row.original.reason || "—"}
            {row.original.failed_responses
              ? ` · ${row.original.failed_responses} failed`
              : ""}
          </div>
        ),
      },
      {
        accessorKey: "updated_at",
        header: "Last activity",
        cell: ({ row }) => (
          <time
            dateTime={row.original.updated_at}
            className="text-muted-foreground"
          >
            {new Date(row.original.updated_at).toLocaleString(undefined, {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </time>
        ),
      },
      {
        id: "details",
        header: "Details",
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="sm"
            aria-label={`View conversation: ${row.original.subject}`}
            onPress={() => onOpen(row.original.id)}
          >
            View <ArrowRight data-icon="inline-end" />
          </Button>
        ),
      },
    ],
    [onOpen],
  );
  // eslint-disable-next-line react-hooks/incompatible-library -- This adapter explicitly opts out of compilation above.
  const table = useReactTable({
    data: items,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
    manualPagination: true,
    manualFiltering: true,
    manualSorting: true,
  });
  return (
    <Table
      aria-label="Recent conversations"
      onRowAction={(key) => onOpen(String(key))}
    >
      <TableHeader>
        {table.getFlatHeaders().map((header) => (
          <TableHead
            key={header.id}
            id={header.id}
            isRowHeader={header.id === "subject"}
          >
            {flexRender(header.column.columnDef.header, header.getContext())}
          </TableHead>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.map((row) => (
          <TableRow key={row.id} id={row.id} textValue={row.original.subject}>
            {row.getVisibleCells().map((cell) => (
              <TableCell key={cell.id}>
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function OverviewDashboard({ email }: { email: string }) {
  const router = useRouter();
  const [source, setSource] = useState("live");
  const [days, setDays] = useState("7");
  const [agent, setAgent] = useState("");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [outcome, setOutcome] = useState("");
  const [order, setOrder] = useState("latest");
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{
    query: string;
    data: Overview;
  } | null>(null);
  const [error, setError] = useState<{ query: string; message: string } | null>(
    null,
  );
  const [connected, setConnected] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  useEffect(() => {
    const conversation = new URLSearchParams(window.location.search).get(
      "conversation",
    );
    if (conversation && /^[0-9a-f-]{36}$/i.test(conversation)) {
      const timer = setTimeout(() => setSelected(conversation), 0);
      return () => clearTimeout(timer);
    }
  }, []);
  const query = useMemo(
    () =>
      new URLSearchParams({
        source,
        days,
        ...(agent ? { agent_id: agent } : {}),
        ...(deferredSearch.trim() ? { search: deferredSearch.trim() } : {}),
        ...(outcome ? { status: outcome } : {}),
        order,
        page: String(page),
      }).toString(),
    [source, days, agent, deferredSearch, outcome, order, page],
  );

  useEffect(() => {
    const controller = new AbortController();
    fetch(
      `/api/overview?${query}&tz_offset=${new Date().getTimezoneOffset()}`,
      { signal: controller.signal },
    )
      .then(jsonResponse<Overview>)
      .then((data) => {
        if (!controller.signal.aborted) {
          setResult({ query, data });
          setError(null);
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setError({ query, message: error.message });
      });
    return () => controller.abort();
  }, [query, revision]);

  useEffect(() => {
    const stream = new EventSource("/api/overview/events");
    stream.onopen = () => setConnected(true);
    stream.addEventListener("change", () => setRevision((value) => value + 1));
    stream.onerror = () => setConnected(false);
    const refresh = () => {
      if (document.visibilityState === "visible")
        setRevision((value) => value + 1);
    };
    const timer = setInterval(refresh, 15_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      stream.close();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  async function signOut() {
    setSigningOut(true);
    try {
      const response = await authClient.signOut();
      if (response.error) throw new Error(response.error.message);
      router.replace("/auth/sign-in");
      router.refresh();
    } catch (error) {
      setError({
        query,
        message: error instanceof Error ? error.message : "Unable to sign out.",
      });
      setSigningOut(false);
    }
  }

  const data = result?.query === query ? result.data : null;
  const currentError = error?.query === query ? error.message : "";
  const metrics = data?.metrics;
  const chart = trendData(data?.trend || [], Number(days));
  const currentPage = data?.page || page;
  const pages = Math.max(1, Math.ceil((data?.total || 0) / 20));
  const refresh = () => setRevision((value) => value + 1);
  const cards = [
    {
      label: "Conversations",
      value: metrics?.conversations,
      hint: "Started in this period",
      icon: MessagesSquare,
    },
    {
      label: "Confirmed resolutions",
      value: metrics?.resolved,
      hint: "Explicitly confirmed by a person",
      icon: CheckCheck,
    },
    {
      label: "Needs attention",
      value: metrics?.needs_attention,
      hint: "Human assistance recommended",
      icon: HandHelping,
    },
    {
      label: "Median response time",
      value: metrics ? responseTime(metrics.median_response_ms) : undefined,
      hint: "Completed, validated responses",
      icon: Clock3,
    },
  ];
  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 pt-4 pb-12 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-1 text-xs font-medium tracking-widest text-foreground/70">
            WORKSPACE
          </p>
          <h1 className="text-3xl font-medium tracking-tight">Overview</h1>
          <p className="mt-2 text-sm text-foreground/70">
            See what your agents are doing and where customers need help.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">
            <Activity data-icon="inline-start" />
            {connected ? "Live updates" : "Reconnecting · refresh every 15s"}
          </Badge>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Refresh overview"
            onPress={refresh}
          >
            <RefreshCw />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Sign out ${email}`}
            isDisabled={signingOut}
            onPress={() => void signOut()}
          >
            <LogOut />
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <NativeSelect
          aria-label="Activity source"
          value={source}
          onChange={(event) => {
            setSource(event.target.value);
            setPage(1);
          }}
        >
          <NativeSelectOption value="live">Live activity</NativeSelectOption>
          <NativeSelectOption value="test">Test activity</NativeSelectOption>
        </NativeSelect>
        <NativeSelect
          aria-label="Date range"
          value={days}
          onChange={(event) => {
            setDays(event.target.value);
            setPage(1);
          }}
        >
          <NativeSelectOption value="1">Today</NativeSelectOption>
          <NativeSelectOption value="7">Last 7 days</NativeSelectOption>
          <NativeSelectOption value="30">Last 30 days</NativeSelectOption>
        </NativeSelect>
        <NativeSelect
          aria-label="Agent"
          value={agent}
          onChange={(event) => {
            setAgent(event.target.value);
            setPage(1);
          }}
        >
          <NativeSelectOption value="">All agents</NativeSelectOption>
          {result?.data.agent_choices.map((item) => (
            <NativeSelectOption key={item.agent_id} value={item.agent_id}>
              {item.agent_name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <p className="text-xs text-foreground/70 sm:ml-auto">
          {data
            ? `Updated ${new Date(data.generated_at).toLocaleTimeString()}`
            : "Loading activity…"}
        </p>
      </div>
      {currentError && (
        <Alert variant="destructive">
          <AlertTitle>Unable to refresh overview</AlertTitle>
          <AlertDescription>
            {currentError}{" "}
            <Button variant="link" size="sm" onPress={refresh}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {source === "test" && (
        <Alert>
          <AlertTitle>Test activity</AlertTitle>
          <AlertDescription>
            Playground and agent tests are saved here. These conversations are
            excluded from live performance.
          </AlertDescription>
        </Alert>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.label}>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardDescription>{card.label}</CardDescription>
                <card.icon className="size-4 text-muted-foreground" />
              </div>
              <CardTitle>
                {card.value === undefined ? (
                  currentError ? (
                    "—"
                  ) : (
                    <Skeleton className="h-9 w-20" />
                  )
                ) : (
                  <span className="text-3xl tabular-nums">{card.value}</span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">{card.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Conversation volume</CardTitle>
          <CardDescription>
            Conversations by start date and current outcome. Dates use your
            local time.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!data ? (
            <Skeleton className="h-64 w-full" />
          ) : !metrics?.conversations ? (
            <NoActivity test={source === "test"} />
          ) : (
            <ChartContainer
              config={chartConfig}
              className="h-64 w-full"
              role="region"
              aria-label="Conversation volume by day and current outcome"
            >
              <BarChart
                accessibilityLayer
                data={chart}
                margin={{ left: -20, right: 12 }}
              >
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  minTickGap={24}
                />
                <YAxis
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                {Object.keys(chartConfig).map((key) => (
                  <Bar
                    key={key}
                    dataKey={key}
                    stackId="outcomes"
                    fill={`var(--color-${key})`}
                    maxBarSize={44}
                    isAnimationActive={false}
                  />
                ))}
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Agent performance</CardTitle>
          <CardDescription>
            Answered does not mean resolved. Failures count individual response
            attempts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!data ? (
            <Skeleton className="h-28 w-full" />
          ) : !data.agents.length ? (
            <p className="py-4 text-sm text-muted-foreground">
              Agent performance will appear after the first conversation.
            </p>
          ) : (
            <Table aria-label="Agent performance">
              <TableHeader>
                <TableHead id="agent" isRowHeader>
                  Agent
                </TableHead>
                <TableHead id="conversations">Conversations</TableHead>
                <TableHead id="answered">Answered</TableHead>
                <TableHead id="resolved">Resolved</TableHead>
                <TableHead id="attention">Needs attention</TableHead>
                <TableHead id="failures">Failed responses</TableHead>
              </TableHeader>
              <TableBody>
                {data.agents.map((item) => (
                  <TableRow
                    key={`${item.agent_id}:${item.agent_name}`}
                    id={`${item.agent_id}:${item.agent_name}`}
                    textValue={item.agent_name}
                  >
                    <TableCell>
                      <span className="flex items-center gap-2">
                        <Bot className="size-4 text-muted-foreground" />
                        {item.agent_name}
                      </span>
                    </TableCell>
                    <TableCell>{item.conversations}</TableCell>
                    <TableCell>{item.answered}</TableCell>
                    <TableCell>{item.resolved}</TableCell>
                    <TableCell>{item.needs_attention}</TableCell>
                    <TableCell>{item.failed_responses}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <CardTitle>Recent conversations</CardTitle>
              <CardDescription>
                Inspect answers, sources, and requests for human assistance.
              </CardDescription>
            </div>
            {metrics && (
              <p className="text-xs text-muted-foreground">
                {metrics.in_progress} in progress · {metrics.failed_responses}{" "}
                failed · {metrics.cancelled_responses} cancelled responses
              </p>
            )}
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <Input
              aria-label="Search conversations"
              placeholder="Search problems…"
              value={search}
              maxLength={200}
              className="max-w-sm"
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
            <NativeSelect
              aria-label="Outcome"
              value={outcome}
              onChange={(event) => {
                setOutcome(event.target.value);
                setPage(1);
              }}
            >
              <NativeSelectOption value="">All outcomes</NativeSelectOption>
              {Object.entries(outcomeLabels).map(([value, label]) => (
                <NativeSelectOption key={value} value={value}>
                  {label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <Button
              variant="outline"
              size="sm"
              onPress={() => {
                setOrder(order === "latest" ? "oldest" : "latest");
                setPage(1);
              }}
            >
              <ArrowDownUp data-icon="inline-start" />
              {order === "latest" ? "Newest first" : "Oldest first"}
            </Button>
          </div>
          {!data ? (
            <Skeleton className="h-40 w-full" />
          ) : !data.conversations.length ? (
            <NoActivity
              test={source === "test"}
              filtered={!!search.trim() || !!outcome}
            />
          ) : (
            <ConversationTable
              items={data.conversations}
              onOpen={setSelected}
            />
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <p className="text-xs text-muted-foreground">
              {data?.total || 0} conversations · Page {currentPage} of {pages}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                isDisabled={!data || currentPage <= 1}
                onPress={() => setPage(currentPage - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                isDisabled={!data || currentPage >= pages}
                onPress={() => setPage(currentPage + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      <p className="text-xs text-foreground/70">
        Resolutions require explicit confirmation. Conversations without a reply
        for 24 hours become inactive; requests for human attention stay open.
      </p>
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
