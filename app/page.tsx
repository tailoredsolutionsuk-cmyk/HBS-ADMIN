import AdminPage from "./admin/page";
import LoginPage from "./login/page";
import { createClient } from "../lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  return data?.claims ? <AdminPage /> : <LoginPage />;
}

