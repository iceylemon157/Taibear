import { NextRequest, NextResponse } from "next/server";

import { proxyRequest } from "@/services/server/proxy";

type RouteContext = {
  params: { path?: string[] } | Promise<{ path?: string[] }>;
};

const AGENT_BASE_URL = process.env.BACKEND_AGENT_URL ?? "http://localhost:8001";
const API_KEY_REQUIRED_PATHS = new Set(["search", "plan", "geocode", "enrich", "hidden-spots", "enrich-assets"]);

async function getPath(context: RouteContext): Promise<string[]> {
  const params = await Promise.resolve(context.params);
  return params.path ?? [];
}

function needsApiKey(path: string[]): boolean {
  const firstSegment = path[0] ?? "";
  return API_KEY_REQUIRED_PATHS.has(firstSegment);
}

function getServerApiKey(): string {
  return process.env.BACKEND_YTP_API_KEY ?? process.env.YTP_API_KEY ?? "";
}

async function handle(request: NextRequest, context: RouteContext) {
  const path = await getPath(context);

  if (needsApiKey(path)) {
    const apiKey = getServerApiKey();
    if (!apiKey) {
      return NextResponse.json(
        { detail: "Missing BACKEND_YTP_API_KEY (or YTP_API_KEY) in frontend environment." },
        { status: 500 }
      );
    }
    return proxyRequest(request, AGENT_BASE_URL, path, {
      extraRequestHeaders: { "X-API-Key": apiKey },
    });
  }

  return proxyRequest(request, AGENT_BASE_URL, path);
}

export async function GET(request: NextRequest, context: RouteContext) {
  return handle(request, context);
}

export async function POST(request: NextRequest, context: RouteContext) {
  return handle(request, context);
}

export async function PUT(request: NextRequest, context: RouteContext) {
  return handle(request, context);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  return handle(request, context);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  return handle(request, context);
}
