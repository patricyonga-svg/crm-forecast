import { redirect } from "next/navigation";
import { getReferences, getSession } from "@/lib/session";
import { ROLES, type Profile } from "@/lib/domain";
import { saveUser } from "./actions";

export default async function UsersPage() {
  const { supabase, user, profile } = await getSession();
  if (profile?.role !== "admin") redirect("/affaires");
  const refs = await getReferences(supabase);
  const { data: users } = await supabase.from("profiles").select("*").order("created_at", { ascending: false }).returns<(Profile & { created_at: string })[]>();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Utilisateurs</h1>
        <p className="text-sm text-zinc-600">
          Chaque collègue apparaît ici après sa première connexion avec Google. Choisissez son rôle, son pays et, pour un commercial, son nom
          dans le fichier de forecast pour lui rattacher ses affaires.
        </p>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-zinc-500">
            <tr>
              <th className="py-2 pr-3 font-medium">Nom</th>
              <th className="py-2 pr-3 font-medium">Rôle</th>
              <th className="py-2 pr-3 font-medium">Pays</th>
              <th className="py-2 pr-3 font-medium">Nom dans le fichier</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(users ?? []).map((u) => {
              const rep = refs.reps.find((r) => r.profile_id === u.id);
              const isMe = u.id === user.id;
              return (
                <tr key={u.id} className="border-t border-zinc-100 align-top">
                  <td className="py-2 pr-3">
                    <div className="font-medium">{u.full_name}</div>
                    <div className="text-zinc-500">{u.email}</div>
                  </td>
                  <td className="py-2 pr-3" colSpan={4}>
                    <form action={saveUser} className="grid gap-2 md:grid-cols-4">
                      <input type="hidden" name="id" value={u.id} />
                      <select name="role" defaultValue={u.role} className="input" disabled={isMe} title={isMe ? "Vous ne pouvez pas changer votre propre rôle" : undefined}>
                        {ROLES.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                      <select name="country_code" defaultValue={u.country_code ?? ""} className="input">
                        <option value="">—</option>
                        {refs.countries.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <select name="sales_rep_id" defaultValue={rep?.id ?? ""} className="input">
                        <option value="">—</option>
                        {refs.reps
                          .filter((r) => !r.profile_id || r.profile_id === u.id)
                          .map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.display_name}
                              {r.country_code ? ` (${r.country_code})` : ""}
                            </option>
                          ))}
                      </select>
                      <button className="btn-secondary">Enregistrer</button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="card text-sm text-zinc-600">
        <p className="font-medium text-zinc-900">Rôles</p>
        <ul className="mt-1 list-disc pl-5">
          {ROLES.map((r) => (
            <li key={r.value}>
              <span className="font-medium">{r.label}</span> : {r.help}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
