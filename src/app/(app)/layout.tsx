import Image from "next/image";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { Suspense } from "react";
import { MainNav } from "@/components/MainNav";
import { UserMenu } from "@/components/UserMenu";
import { signOut } from "./actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, profile, user } = await getSession();
  const today = new Date().toISOString().slice(0, 10);
  // Même règle que la vue « Actions à faire » : action prévue aujourd'hui ou avant, affaire ni gagnée ni perdue.
  const { count: overdue } = await supabase
    .from("deals")
    .select("id", { count: "exact", head: true })
    .lte("next_action_date", today)
    .not("stage", "in", "(won,perdu)");
  const settings = [
    ...(profile?.role === "admin" || profile?.role === "manager" ? [{ href: "/parametres/objectifs", label: "Objectifs" }] : []),
    { href: "/parametres/pipeline", label: "Paramètres pipeline" },
    ...(profile?.role === "admin" ? [{ href: "/utilisateurs", label: "Utilisateurs" }] : []),
  ];
  return (
    <div className="flex min-h-screen flex-col">
      <header className="bg-brand-navy text-white">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 py-2 pl-3 pr-4">
          <Link href="/affaires" className="flex items-center gap-1.5">
            <Image src="/cerise.png" alt="" width={34} height={34} priority />
            <span className="font-brand text-2xl font-semibold tracking-wide">Cerise</span>
          </Link>
          <Suspense>
            <MainNav settings={settings} overdue={overdue ?? 0} />
          </Suspense>
          <div className="ml-auto flex items-center gap-2">
            <form action="/affaires" className="hidden md:block" role="search">
              <input
                name="q"
                type="search"
                placeholder="Rechercher un client…"
                aria-label="Rechercher un client"
                className="w-52 rounded-md border border-white/10 bg-white/10 px-3 py-1.5 text-sm text-white placeholder:text-white/50 focus:border-white/40 focus:bg-white/15 focus:outline-none"
              />
            </form>
            <Link href="/affaires/nouvelle" className="rounded-md bg-brand-orange px-3 py-1.5 text-sm font-semibold text-white hover:brightness-110">
              + Affaire
            </Link>
            <UserMenu name={profile?.full_name ?? user.email ?? "Mon compte"} signOut={signOut} />
          </div>
        </div>
      </header>
      {!profile?.country_code && profile?.role !== "admin" && profile?.role !== "direction" && (
        <div className="bg-amber-50 px-4 py-2 text-center text-sm text-amber-900">
          Votre compte n&apos;est pas encore rattaché à un pays. Un administrateur doit le compléter pour que vous voyiez vos affaires.
        </div>
      )}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
      <footer className="flex justify-end px-4 pb-4">
        <Image src="/susu-logo.png" alt="SUSU" width={74} height={24} />
      </footer>
    </div>
  );
}
