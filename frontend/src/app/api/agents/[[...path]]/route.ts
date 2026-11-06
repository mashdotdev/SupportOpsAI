import { ragProxy } from "@/lib/rag-proxy";

export const maxDuration = 120;

async function handle(request: Request, context: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await context.params;
  const route = path.join("/");
  if (!/^(?:models|[0-9a-f-]{36}(?:\/chat)?)?$/i.test(route)) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  return ragProxy(request, `agents${route ? `/${route}` : ""}`);
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
