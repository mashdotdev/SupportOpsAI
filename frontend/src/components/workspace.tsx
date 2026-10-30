"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

type Ticket = { id: string; subject: string; created_at: string };

export function Workspace({ email }: { email: string }) {
  const router = useRouter();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [subject, setSubject] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/tickets", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            "Unable to load tickets. Please sign in again or retry.",
          );
        setTickets((await response.json()).tickets);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to save ticket.");
      setTickets((current) => [data.ticket, ...current]);
      setSubject("");
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Unable to save ticket.",
      );
    } finally {
      setPending(false);
    }
  }

  async function signOut() {
    setPending(true);
    setError("");
    try {
      const { error } = await authClient.signOut();
      if (error) throw new Error(error.message);
      router.replace("/auth/sign-in");
      router.refresh();
    } catch {
      setError("Unable to sign out. Please try again.");
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-8 px-6 py-24">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Support workspace</h1>
          <p>{email}</p>
        </div>
        <Button variant="outline" onPress={signOut} isDisabled={pending}>
          Sign out
        </Button>
      </div>
      <form onSubmit={submit}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="subject">New support ticket</FieldLabel>
            <Input
              id="subject"
              name="subject"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              required
              maxLength={200}
              placeholder="What do you need help with?"
              disabled={pending}
            />
          </Field>
          <Button type="submit" isDisabled={pending || !subject.trim()}>
            {pending ? "Saving…" : "Create ticket"}
          </Button>
          {error && <FieldError>{error}</FieldError>}
        </FieldGroup>
      </form>
      <section
        aria-label="Your tickets"
        className="flex flex-col gap-4"
        aria-live="polite"
      >
        <h2 className="text-xl font-semibold">Your tickets</h2>
        {loading ? (
          <p>Loading tickets…</p>
        ) : tickets.length === 0 ? (
          <p>No tickets yet.</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {tickets.map((ticket) => (
              <li key={ticket.id} className="rounded-lg border p-4">
                <p className="font-medium">{ticket.subject}</p>
                <time dateTime={ticket.created_at} className="text-sm">
                  {new Date(ticket.created_at).toLocaleString()}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
