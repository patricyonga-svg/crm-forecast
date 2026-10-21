/** Choix du trimestre (formulaire GET, conserve les autres paramètres passés en `keep`). */
export function QuarterPicker({ value, keep = {} }: { value: string; keep?: Record<string, string | undefined> }) {
  const year = Number(value.slice(0, 4));
  const options = [year - 1, year, year + 1].flatMap((y) => [1, 2, 3, 4].map((q) => `${y}-T${q}`));
  return (
    <form className="flex gap-2">
      {Object.entries(keep).map(([k, v]) => v && <input key={k} type="hidden" name={k} value={v} />)}
      <select name="trimestre" defaultValue={value} className="input">
        {options.map((q) => (
          <option key={q} value={q}>
            {q.replace("-", " ")}
          </option>
        ))}
      </select>
      <button className="btn-secondary">Afficher</button>
    </form>
  );
}
