import type { Citation } from "@/lib/rag-client";
import type {
  DeliveryStatus,
  NotificationJob,
} from "@/lib/integrations-client";

export const outcomeLabels = {
  in_progress: "In progress",
  answered: "Answered",
  needs_clarification: "Needs clarification",
  needs_attention: "Needs attention",
  resolved: "Resolved",
  inactive: "Inactive",
} as const;
export type Outcome = keyof typeof outcomeLabels;
export type Conversation = {
  id: string;
  agent_id: string | null;
  agent_name: string;
  subject: string;
  status: Outcome;
  reason: string | null;
  created_at: string;
  updated_at: string;
  failed_responses: number;
  notification_status?: DeliveryStatus | null;
  visitor_name?: string | null;
  visitor_email?: string | null;
  page_origin?: string | null;
  customer_feedback?: string | null;
};
export type Overview = {
  metrics: {
    conversations: number;
    resolved: number;
    needs_attention: number;
    in_progress: number;
    median_response_ms: number | null;
    failed_responses: number;
    cancelled_responses: number;
  };
  conversations: Conversation[];
  agents: {
    agent_id: string | null;
    agent_name: string;
    conversations: number;
    resolved: number;
    answered: number;
    needs_attention: number;
    failed_responses: number;
  }[];
  agent_choices: { agent_id: string; agent_name: string }[];
  trend: { day: string; status: Outcome; count: number }[];
  total: number;
  page: number;
  generated_at: string;
};
export type ConversationDetail = {
  conversation: Conversation & {
    model_id: string;
    agent_version: number | null;
    source: "test" | "live";
    escalation_cycle: number;
  };
  turns: {
    id: string;
    question: string;
    answer: string | null;
    citations: Citation[];
    status: "running" | "completed" | "failed" | "cancelled";
    response_type: string | null;
    error: string | null;
    duration_ms: number | null;
    created_at: string;
    completed_at: string | null;
  }[];
  events: { kind: string; created_at: string }[];
  notifications: NotificationJob[];
  can_notify: boolean;
  slack_destination: string | null;
};

export function responseTime(ms: number | null) {
  return ms === null
    ? "—"
    : ms < 1000
      ? `${Math.round(ms)} ms`
      : `${(ms / 1000).toFixed(1)} s`;
}

export function trendData(trend: Overview["trend"], days: number) {
  const rows = Array.from({ length: days }, (_, index) => {
    const day = new Date();
    day.setDate(day.getDate() - (days - index - 1));
    const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
    return {
      day: key,
      label: day.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      }),
      answered: 0,
      resolved: 0,
      needs_attention: 0,
      other: 0,
    };
  });
  for (const item of trend) {
    const row = rows.find((row) => row.day === item.day);
    if (row)
      row[
        item.status === "answered" ||
        item.status === "resolved" ||
        item.status === "needs_attention"
          ? item.status
          : "other"
      ] += item.count;
  }
  return rows;
}
