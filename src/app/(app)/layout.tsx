import Link from "next/link";
import { getSession } from "@/lib/session";
import { signOut } from "./actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile, user } = await getSession();
  return (
    <div className="min-h-screen">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/affaires" className="font-semibold">
            CRM Forecast
          </Link>
          <nav className="flex gap-4 text-sm">
            <Link href="/affaires" className="hover:underline">
              Affaires
            </Link>
            <Link href="/affaires?vue=relances" className="hover:underline">
              À relancer
            </Link>
            <Link href="/tableau-de-bord" className="hover:underline">
              Tableau de bord
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm text-zinc-600">
            <span>{profile?.full_name ?? user.email}</span>
            <form action={signOut}>
              <button className="hover:underline">Déconnexion</button>
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
