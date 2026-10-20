// Écriture dans Google Sheets avec un compte de service, sans dépendance externe.
import { createSign } from "node:crypto";

async function accessToken(): Promise<string> {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!;
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY!.replace(/\\n/g, "\n");
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({
    iss: email,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(key, "base64url");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }),
  });
  if (!res.ok) throw new Error(`Authentification Google : ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

/** Remplace tout le contenu d'un onglet par `rows`. */
export async function replaceSheet(spreadsheetId: string, tab: string, rows: (string | number)[][]) {
  const token = await accessToken();
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values`;
  const range = encodeURIComponent(`'${tab}'`);
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const clear = await fetch(`${base}/${range}:clear`, { method: "POST", headers });
  if (!clear.ok) throw new Error(`Effacement de l'onglet : ${clear.status} ${await clear.text()}`);
  const update = await fetch(`${base}/${range}?valueInputOption=RAW`, { method: "PUT", headers, body: JSON.stringify({ values: rows }) });
  if (!update.ok) throw new Error(`Écriture de l'onglet : ${update.status} ${await update.text()}`);
}
