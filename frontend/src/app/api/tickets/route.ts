import { auth } from "@/lib/auth/server";
import { database } from "@/lib/db";

export async function GET() {
  const { data: session } = await auth.getSession();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { rows } = await database().query(
    "SELECT id, subject, created_at FROM support_tickets WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100",
    [session.user.id],
  );
  return Response.json({ tickets: rows });
}

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return Response.json({ error: "Invalid origin" }, { status: 403 });
  }
  const { data: session } = await auth.getSession();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  let body;
  try { body = await request.json(); } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const subject = typeof body?.subject === "string" ? body.subject.trim() : "";
  if (!subject || subject.length > 200) {
    return Response.json({ error: "Enter a subject between 1 and 200 characters." }, { status: 400 });
  }
  const { rows } = await database().query(
    "INSERT INTO support_tickets (user_id, subject) VALUES ($1, $2) RETURNING id, subject, created_at",
    [session.user.id, subject],
  );
  return Response.json({ ticket: rows[0] }, { status: 201 });
}
