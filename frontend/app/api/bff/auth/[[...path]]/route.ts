import { NextRequest } from "next/server";

import { proxyRequest } from "@/services/server/proxy";

type RouteContext = {
  params: { path?: string[] } | Promise<{ path?: string[] }>;
};

const AUTH_BASE_URL = process.env.BACKEND_USER_PROFILE_AUTH_URL ?? "http://localhost:8004/auth";

async function getPath(context: RouteContext): Promise<string[]> {
  const params = await Promise.resolve(context.params);
  return params.path ?? [];
}

async function handle(request: NextRequest, context: RouteContext) {
  const path = await getPath(context);
  return proxyRequest(request, AUTH_BASE_URL, path);
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
