import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  if (code) {
    const supabase = await createClient();
    const { data } = await supabase.auth.exchangeCodeForSession(code);
    const domain = process.env.ALLOWED_EMAIL_DOMAIN;
    if (domain && data.user && !data.user.email?.endsWith(`@${domain}`)) {
      await supabase.auth.signOut();
      return NextResponse.redirect(`${origin}/login?erreur=domaine`);
    }
  }
  return NextResponse.redirect(`${origin}/affaires`);
}
