/** Question Oui / Non obligatoire, en boutons radio. */
export function YesNo({ name, label, defaultValue }: { name: string; label: string; defaultValue?: boolean | null }) {
  return (
    <fieldset className="space-y-1 text-sm">
      <legend className="text-zinc-600">{label} *</legend>
      <div className="flex gap-2">
        {[
          ["oui", "Oui"],
          ["non", "Non"],
        ].map(([value, text]) => (
          <label key={value} className="flex cursor-pointer items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-1.5 has-[:checked]:border-brand-blue has-[:checked]:bg-blue-50">
            <input type="radio" name={name} value={value} required defaultChecked={defaultValue === (value === "oui")} className="accent-brand-blue" />
            {text}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
