export class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

type QueryValue = string | number | boolean | null | undefined;

type ApiRequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  query?: Record<string, QueryValue>;
  body?: unknown;
  headers?: HeadersInit;
  cache?: RequestCache;
};

function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  const url = new URL(path, typeof window === "undefined" ? "http://localhost" : window.location.origin);

  if (!query) {
    return typeof window === "undefined" ? `${url.pathname}${url.search}` : url.toString();
  }

  Object.entries(query).forEach(([key, value]) => {
    if (value === null || value === undefined || value === "") {
      return;
    }
    url.searchParams.set(key, String(value));
  });

  return typeof window === "undefined" ? `${url.pathname}${url.search}` : url.toString();
}

async function parseResponse(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json().catch(() => null);
  }
  return response.text().catch(() => "");
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const method = options.method ?? (options.body ? "POST" : "GET");
  const url = buildUrl(path, options.query);

  const headers = new Headers(options.headers ?? {});
  let body: BodyInit | undefined;

  if (options.body instanceof FormData) {
    body = options.body;
  } else if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(options.body);
  }

  const response = await fetch(url, {
    method,
    headers,
    body,
    cache: options.cache ?? "no-store",
  });

  const payload = await parseResponse(response);
  if (!response.ok) {
    const detail =
      typeof payload === "object" && payload !== null && "detail" in payload
        ? String((payload as { detail: unknown }).detail)
        : typeof payload === "string" && payload.length > 0
          ? payload
          : `${response.status} ${response.statusText}`;

    throw new ApiError(detail, response.status, payload);
  }

  return payload as T;
}
