import { ragProxy } from "@/lib/rag-proxy";

export const maxDuration = 120;

async function handle(
  request: Request,
  context: { params: Promise<{ path?: string[] }> },
) {
  const { path = [] } = await context.params;
  const route = path.join("/");
  if (!/^(?:events|inbox|conversations\/[0-9a-f-]{36})?$/i.test(route)) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  const query = new URL(request.url).search;
  return ragProxy(request, `overview${route ? `/${route}` : ""}${query}`);
}

export const GET = handle;
export const PATCH = handle;
