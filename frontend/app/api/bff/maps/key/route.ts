import { NextResponse } from "next/server";

function readMapsApiKey(): string {
  return process.env.GOOGLE_MAPS_API_KEY ?? process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
}

export async function GET() {
  const apiKey = readMapsApiKey();
  if (!apiKey) {
    return NextResponse.json(
      { detail: "Missing GOOGLE_MAPS_API_KEY (or NEXT_PUBLIC_GOOGLE_MAPS_API_KEY)." },
      { status: 500 }
    );
  }

  return NextResponse.json({ apiKey });
}
