"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Sur téléphone, l'onglet « Synthèse » mène aux résultats de l'équipe ou au suivi des comptes Premium. */
export function SummarySwitch() {
  const premium = usePathname().startsWith("/premium");
  const item = (on: boolean) => `flex-1 rounded-md py-1.5 text-center ${on ? "bg-white font-semibold text-zinc-900 shadow-sm" : "text-zinc-600"}`;
  return (
    <div className="flex rounded-lg bg-zinc-200/70 p-0.5 text-sm md:hidden">
      <Link href="/rapports" className={item(!premium)}>
        Équipe
      </Link>
      <Link href="/premium" className={item(premium)}>
        ★ Premium
      </Link>
    </div>
  );
}
