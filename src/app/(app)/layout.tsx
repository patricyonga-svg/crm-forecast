import Image from "next/image";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { NavDropdown } from "@/components/NavDropdown";
import { signOut } from "./actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile, user } = await getSession();
  return (
    <div className="min-h-screen">
      <header className="bg-brand-header text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/affaires" className="flex items-center gap-2.5">
            <Image src="/susu-logo.png" alt="SUSU" width={74} height={24} priority />
            <span className="border-l border-white/20 pl-2.5 text-lg font-extrabold tracking-tight">Cerise</span>
          </Link>
          <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-white/80">
            <Link href="/affaires" className="hover:text-white">
              Affaires
            </Link>
            <Link href="/affaires?vue=relances" className="hover:text-white">
              Actions à faire
            </Link>
            <Link href="/rapports" className="hover:text-white">
              Rapports
            </Link>
            <NavDropdown
              label="Paramètres"
              items={[
                ...(profile?.role === "admin" || profile?.role === "manager" ? [{ href: "/parametres/objectifs", label: "Objectifs" }] : []),
                { href: "/parametres/pipeline", label: "Paramètres pipeline" },
              ]}
            />
            {profile?.role === "admin" && (
              <Link href="/utilisateurs" className="hover:text-white">
                Utilisateurs
              </Link>
            )}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm text-white/70">
            <span>{profile?.full_name ?? user.email}</span>
            <form action={signOut}>
              <button className="hover:text-white">Déconnexion</button>
            </form>
          </div>
        </div>
      </header>
      {!profile?.country_code && profile?.role !== "admin" && profile?.role !== "direction" && (
        <div className="bg-amber-50 px-4 py-2 text-center text-sm text-amber-900">
          Votre compte n&apos;est pas encore rattaché à un pays. Un administrateur doit le compléter pour que vous voyiez vos affaires.
        </div>
      )}
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
