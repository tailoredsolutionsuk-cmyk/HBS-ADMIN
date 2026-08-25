import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = (await request.json()) as { prompt?: string; project?: string };
  const prompt = body.prompt?.trim() || "your request";
  const project = body.project || "your project";
  return NextResponse.json({
    message: `I’ve queued “${prompt}” for ${project}. The preview is ready for another direction, or connect your model provider to stream a full code edit here.`,
    project,
    action: "update_preview",
  });
}

