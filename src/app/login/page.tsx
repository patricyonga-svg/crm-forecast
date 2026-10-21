"use client";

import Image from "next/image";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  async function signIn() {
    await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  return (
    <main className="grid min-h-screen md:grid-cols-[1.3fr_1fr]">
      <section className="flex flex-col justify-center gap-6 bg-brand-navy px-8 py-12 text-white md:px-16">
        <div className="flex items-center gap-3">
          <Image src="/cerise.png" alt="" width={72} height={72} priority />
          <h1 className="font-brand text-6xl font-semibold tracking-wide">Cerise</h1>
        </div>
        <p className="max-w-md text-lg text-white/80">Suivi commercial : affaires, forecast, pipe et objectifs de l&apos;équipe.</p>
      </section>
      <section className="relative flex items-center justify-center bg-[#1c2d52] px-6 py-12">
        <div className="w-full max-w-sm space-y-4 text-white">
          <p className="text-sm text-[#a9c4e6]">Connectez-vous avec votre compte Google professionnel.</p>
          <button className="btn w-full !bg-white !text-brand-navy hover:!bg-zinc-100" onClick={signIn}>
            Se connecter avec Google
          </button>
        </div>
        <Image src="/susu-logo.png" alt="SUSU" width={92} height={30} className="absolute bottom-6 right-6" />
      </section>
    </main>
  );
}
