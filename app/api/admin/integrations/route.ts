import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });

  const { data: admin } = await supabase.from("admin_users").select("email,role").eq("user_id", userId).maybeSingle();
  if (!admin) return NextResponse.json({ error: "ADMIN_ACCESS_REQUIRED" }, { status: 403 });

  const fullAccess = ["owner", "admin"].includes(admin.role);
  return NextResponse.json({
    role: admin.role,
    scopes: {
      clients: fullAccess ? "manage" : admin.role === "editor" ? "edit" : "read",
      leads: fullAccess ? "manage" : admin.role === "editor" ? "edit" : "read",
      tasks: fullAccess ? "manage" : admin.role === "editor" ? "edit" : "read",
      analytics: "read",
      integrations: fullAccess ? "manage" : "read",
      ai: fullAccess ? "use" : "none",
    },
    integrations: [
      { id: "supabase", name: "Supabase", configured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY), detail: "CRM database and authentication" },
      { id: "neon", name: "Neon", configured: Boolean(process.env.NEON_DATABASE_URL), detail: "Serverless PostgreSQL" },
      { id: "github", name: "GitHub", configured: Boolean(process.env.GITHUB_TOKEN && process.env.GITHUB_OWNER && process.env.GITHUB_ADMIN_REPO), detail: "Source and repository operations" },
      { id: "vercel", name: "Vercel", configured: Boolean(process.env.VERCEL_TOKEN && process.env.VERCEL_TEAM_ID && process.env.VERCEL_ADMIN_PROJECT_ID), detail: "Deployment management API" },
      { id: "make", name: "Make", configured: Boolean(process.env.MAKE_API_TOKEN && process.env.MAKE_TEAM_ID), detail: "Business automations" },
      { id: "ai", name: "AI Gateway", configured: Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN), detail: process.env.AI_MODEL || "openai/gpt-5.6-sol" },
    ],
  });
}

