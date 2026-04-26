import { NextRequest, NextResponse } from "next/server";

type ProxyOptions = {
  extraRequestHeaders?: Record<string, string | undefined>;
};

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "content-encoding",
]);

const SKIP_REQUEST_HEADERS = new Set([
  "host",
  "connection",
  "content-length",
]);

function trimTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function buildTargetUrl(baseUrl: string, pathSegments: string[], incomingUrl: URL): string {
  const cleanBase = trimTrailingSlash(baseUrl);
  const path = pathSegments.length > 0 ? `/${pathSegments.join("/")}` : "";
  const target = new URL(`${cleanBase}${path}`);
  target.search = incomingUrl.search;
  return target.toString();
}

function copyRequestHeaders(
  source: Headers,
  extraRequestHeaders?: Record<string, string | undefined>
): Headers {
  const headers = new Headers();

  source.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (SKIP_REQUEST_HEADERS.has(lower)) {
      return;
    }
    headers.set(key, value);
  });

  if (extraRequestHeaders) {
    Object.entries(extraRequestHeaders).forEach(([key, value]) => {
      if (!value) {
        return;
      }
      headers.set(key, value);
    });
  }

  return headers;
}

function copyResponseHeaders(source: Headers): Headers {
  const headers = new Headers();
  source.forEach((value, key) => {
    if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      return;
    }
    headers.set(key, value);
  });
  return headers;
}

function hasRequestBody(method: string): boolean {
  return method !== "GET" && method !== "HEAD";
}

export async function proxyRequest(
  request: NextRequest,
  baseUrl: string,
  pathSegments: string[],
  options?: ProxyOptions
): Promise<NextResponse> {
  if (!baseUrl) {
    return NextResponse.json(
      { detail: "Backend service URL is not configured." },
      { status: 500 }
    );
  }

  const incomingUrl = new URL(request.url);
  const targetUrl = buildTargetUrl(baseUrl, pathSegments, incomingUrl);
  const method = request.method.toUpperCase();

  try {
    const bodyBuffer = hasRequestBody(method) ? await request.arrayBuffer() : undefined;
    const body = bodyBuffer && bodyBuffer.byteLength > 0 ? bodyBuffer : undefined;

    const backendResponse = await fetch(targetUrl, {
      method,
      headers: copyRequestHeaders(request.headers, options?.extraRequestHeaders),
      body,
      redirect: "manual",
      cache: "no-store",
    });

    return new NextResponse(backendResponse.body, {
      status: backendResponse.status,
      headers: copyResponseHeaders(backendResponse.headers),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown proxy error";
    return NextResponse.json({ detail }, { status: 502 });
  }
}
