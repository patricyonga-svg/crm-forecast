"use client";

import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  async function signIn() {
    await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="card w-full max-w-sm space-y-4 text-center">
        <h1 className="text-xl font-semibold">CRM Forecast</h1>
        <p className="text-sm text-zinc-600">Connectez-vous avec votre compte Google professionnel.</p>
        <button className="btn w-full" onClick={signIn}>
          Se connecter avec Google
        </button>
      </div>
    </main>
  );
}
