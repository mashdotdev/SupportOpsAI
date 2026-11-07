export const deliveryLabels = {
  simulated: "Simulated",
  queued: "Queued",
  sending: "Sending",
  sent: "Slack notified",
  failed: "Notification failed",
  unknown: "Delivery unknown",
  cancelled: "Cancelled",
} as const;
export type DeliveryStatus = keyof typeof deliveryLabels;
export type SlackConnection = {
  id: string;
  name: string;
  destination: string;
  enabled: boolean;
  version: number;
  status: "disabled" | "needs_attention" | "verified" | "not_tested";
  webhook: string;
  verified_at: string | null;
  last_sent_at: string | null;
  last_error: string | null;
  updated_at: string;
};
export type NotificationJob = {
  id: string;
  conversation_id: string | null;
  agent_id: string | null;
  agent_name: string;
  kind: "connection_test" | "escalation";
  cycle: number;
  mode: "simulation" | "delivery";
  source: "test" | "live";
  status: DeliveryStatus;
  question: string;
  reason: string;
  attempts: number;
  error: string | null;
  created_at: string;
  updated_at: string;
  preview?: {
    agent: string;
    environment: string;
    problem: string;
    reason: string;
    url: string | null;
  };
};
export type IntegrationHistory = {
  jobs: NotificationJob[];
  attempts: {
    id: string;
    job_id: string;
    number: number;
    status: string;
    http_status: number | null;
    error: string | null;
  }[];
  agents: {
    id: string;
    name: string;
    slack_notifications: boolean;
    slack_test_delivery: boolean;
  }[];
  total: number;
  page: number;
};
export const connectionLabels = {
  disabled: "Disabled",
  needs_attention: "Needs attention",
  verified: "Verified by test",
  not_tested: "Not tested",
};
