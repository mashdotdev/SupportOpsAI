import { auth } from "@/lib/auth/server";
import { database } from "@/lib/db";

const ticketFields = { id: true, subject: true, createdAt: true } as const;

function serializeTicket(ticket: {
  id: string;
  subject: string;
  createdAt: Date;
}) {
  return {
    id: ticket.id,
    subject: ticket.subject,
    created_at: ticket.createdAt.toISOString(),
  };
}

export async function GET() {
  const { data: session } = await auth.getSession();
  if (!session?.user)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const tickets = await database().supportTicket.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: ticketFields,
  });
  return Response.json({ tickets: tickets.map(serializeTicket) });
}

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return Response.json({ error: "Invalid origin" }, { status: 403 });
  }
  const { data: session } = await auth.getSession();
  if (!session?.user)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const subject = typeof body?.subject === "string" ? body.subject.trim() : "";
  if (!subject || subject.length > 200) {
    return Response.json(
      { error: "Enter a subject between 1 and 200 characters." },
      { status: 400 },
    );
  }
  const ticket = await database().supportTicket.create({
    data: { userId: session.user.id, subject },
    select: ticketFields,
  });
  return Response.json({ ticket: serializeTicket(ticket) }, { status: 201 });
}
