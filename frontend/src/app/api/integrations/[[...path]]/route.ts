import { ragProxy } from "@/lib/rag-proxy";

async function handle(
  request: Request,
  context: { params: Promise<{ path?: string[] }> },
) {
  const { path = [] } = await context.params;
  const route = path.join("/");
  const allowed =
    (route === "slack" && ["GET", "PUT", "DELETE"].includes(request.method)) ||
    (route === "slack/test" && request.method === "POST") ||
    (route === "history" && request.method === "GET") ||
    (/^conversations\/[0-9a-f-]{36}\/notify$/i.test(route) &&
      request.method === "POST");
  if (!allowed) return Response.json({ error: "Not found" }, { status: 404 });
  return ragProxy(
    request,
    `integrations/${route}${new URL(request.url).search}`,
  );
}

export const GET = handle;
export const PUT = handle;
export const DELETE = handle;
export const POST = handle;
