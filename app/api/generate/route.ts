import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ error: 'Use the authenticated Websites studio in HBS Admin.' }, { status: 410, headers: { 'Cache-Control': 'no-store' } });
}

