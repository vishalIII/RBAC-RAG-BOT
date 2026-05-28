export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await request.text();

  const backendResponse = await fetch("http://127.0.0.1:5000/chat", {
    method: "POST",
    cache: "no-store",
    headers: {
      Accept: "text/event-stream",
      "Content-Type": "application/json",
    },
    body,
  });

  const headers = new Headers();
  const contentType = backendResponse.headers.get("content-type");
  if (contentType) {
    headers.set("Content-Type", contentType);
  } else {
    headers.set("Content-Type", "text/event-stream; charset=utf-8");
  }

  headers.set("Cache-Control", "no-cache, no-transform");
  headers.set("X-Accel-Buffering", "no");

  const sessionId = backendResponse.headers.get("x-session-id");
  if (sessionId) {
    headers.set("X-Session-Id", sessionId);
  }

  return new Response(backendResponse.body, {
    status: backendResponse.status,
    statusText: backendResponse.statusText,
    headers,
  });
}
