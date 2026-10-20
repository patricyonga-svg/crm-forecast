// Conversion des valeurs saisies à la main dans l'onglet Detail du Sheet.

export type Stage = "opportunite" | "forecast" | "won_pending" | "won";

const COUNTRIES: Record<string, string> = {
  senegal: "SN",
  "cote d'ivoire": "CI",
  cameroun: "CM",
};

const STAGES: Record<string, Stage> = {
  opportunite: "opportunite",
  forecast: "forecast",
  "won pending": "won_pending",
  won: "won",
};

// Mois en français et en anglais, avec ou sans abréviation.
const MONTHS: Record<string, number> = {
  janv: 1, janvier: 1, jan: 1, january: 1,
  fevr: 2, fevrier: 2, fev: 2, feb: 2, february: 2,
  mars: 3, mar: 3, march: 3,
  avr: 4, avril: 4, apr: 4, april: 4,
  mai: 5, may: 5,
  juin: 6, jun: 6, june: 6,
  juil: 7, juillet: 7, jul: 7, july: 7,
  aout: 8, aug: 8, august: 8,
  sept: 9, septembre: 9, sep: 9, september: 9,
  oct: 10, octobre: 10, october: 10,
  nov: 11, novembre: 11, november: 11,
  dec: 12, decembre: 12, december: 12,
};

// Année des trimestres sans année (« T3 ») dans le fichier actuel.
export const DEFAULT_YEAR = 2026;

/** Minuscules, sans accents ni espaces superflus. */
export function key(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’ʼ]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function parseCountry(value: string): string | null {
  return COUNTRIES[key(value)] ?? null;
}

export function parseStage(value: string): Stage | null {
  return STAGES[key(value)] ?? null;
}

/** « 3 723 762 XOF » → 3723762. Vide → null. */
export function parseAmount(value: string): number | null {
  const digits = value.replace(/XOF|XAF|FCFA/gi, "").replace(/[\s  ]/g, "").replace(",", ".");
  if (digits === "") return null;
  const n = Number(digits);
  return Number.isFinite(n) ? Math.round(n) : null;
}

/** Nombre entier seulement ; « 500-1000 » reste à traiter à la main. */
export function parseBeneficiaries(value: string): number | null {
  const v = value.trim();
  return /^\d+$/.test(v) ? Number(v) : null;
}

function iso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function endOfMonth(year: number, month: number): string {
  return iso(year, month, new Date(Date.UTC(year, month, 0)).getUTCDate());
}

function fullYear(y: string): number {
  return y.length === 2 ? 2000 + Number(y) : Number(y);
}

/**
 * Date de closing prévue. Un trimestre ou un mois donne le dernier jour de la période.
 * Renvoie null quand la valeur n'est pas interprétable ; elle est alors conservée telle quelle.
 */
export function parseClosing(value: string): string | null {
  const v = key(value);
  if (v === "") return null;

  // 30/09/2026
  let m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return iso(y, mo, d);
    return null;
  }

  // Numéro de série Google Sheets (jours depuis le 30/12/1899).
  if (/^\d{5}$/.test(v)) {
    const date = new Date(Date.UTC(1899, 11, 30) + Number(v) * 86400000);
    return endOfMonth(date.getUTCFullYear(), date.getUTCMonth() + 1);
  }

  // T3, T4, T1FY27, T1_2027, T2_2027
  m = v.match(/^t([1-4])(?:\s*(?:_|fy)?\s*(\d{2}|\d{4}))?$/);
  if (m) {
    const q = Number(m[1]);
    const year = m[2] ? fullYear(m[2]) : DEFAULT_YEAR;
    return endOfMonth(year, q * 3);
  }

  // juin-26, juil.-2026, Aout 2026, Mar-27, septembre 2026
  m = v.match(/^([a-z]+)\.?[\s-]+(\d{2}|\d{4})$/);
  if (m && MONTHS[m[1]]) return endOfMonth(fullYear(m[2]), MONTHS[m[1]]);

  return null;
}

/** Nom d'affichage d'un commercial : « ALICE » → « Alice », « Bruno  » → « Bruno ». */
export function displayName(value: string): string {
  const v = value.replace(/\s+/g, " ").trim();
  if (v === v.toUpperCase() || v === v.toLowerCase()) {
    return v.toLowerCase().replace(/(^|[\s-])\p{L}/gu, (c) => c.toUpperCase());
  }
  return v;
}

export function clientKind(name: string, businessLine: string | null): "entreprise" | "famille" | "particulier" {
  const k = key(name);
  if (/(^|\s)famill?e\b|^cohorte famille|^pack famil/.test(k)) return "famille";
  if (businessLine && key(businessLine) === "b2c") return "particulier";
  return "entreprise";
}

export type ParsedNote = { author: string | null; date: string | null; body: string };

const NOTE_START = /^([A-Za-zÀ-ÿ]{2,10})\s*(?:[_ ]\s*)?(?:(\d{1,2})\/(\d{1,2})\/?)?\s*:\s*/;

/**
 * Découpe la colonne Commentaire en notes datées : « MSO 18/08 : … », « CDI_20/08 : … ».
 * Les lignes qui ne commencent pas par ce motif prolongent la note précédente.
 * Une date dans le futur par rapport à `today` est rattachée à l'année précédente.
 */
export function splitComment(value: string, today: string): ParsedNote[] {
  const text = value.trim();
  if (text === "") return [];
  const [ty, tm, td] = today.split("-").map(Number);
  const notes: ParsedNote[] = [];

  for (const line of text.split(/\r?\n/)) {
    const m = line.match(NOTE_START);
    if (m && (m[2] || m[1] === m[1].toUpperCase())) {
      let date: string | null = null;
      if (m[2]) {
        const d = Number(m[2]);
        const mo = Number(m[3]);
        const future = mo > tm || (mo === tm && d > td);
        date = iso(future ? ty - 1 : ty, mo, d);
      }
      notes.push({ author: m[1], date, body: line.slice(m[0].length).trim() });
    } else if (notes.length > 0) {
      notes[notes.length - 1].body += "\n" + line.trim();
    } else {
      notes.push({ author: null, date: null, body: line.trim() });
    }
  }
  return notes.map((n) => ({ ...n, body: n.body.trim() })).filter((n) => n.body !== "");
}
