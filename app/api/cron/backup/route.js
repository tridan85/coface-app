// app/api/cron/backup/route.js
import { NextResponse } from "next/server";
import { Readable } from "stream";
import { google } from "googleapis";
import { createClient } from "@supabase/supabase-js";

/**
 * CSV helpers
 */
const HEADERS = [
  "id",
  "idContaq",
  "dataInserimento",
  "oraInserimento",
  "data",
  "ora",
  "azienda",
  "referente",
  "telefono",
  "email",
  "citta",
  "provincia",
  "agente",
  "operatore",
  "cliente",
  "stato",
  "dataAnnullamento",
  "note",
  "fatturato",
  "dataFatturazione",
  "indirizzo",
];

function csvEscape(v) {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return s.includes(",") || s.includes("\n") || s.includes('"')
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}
function rowsToCsv(rows) {
  const lines = [];
  lines.push(HEADERS.join(","));
  for (const r of rows) {
    const line = HEADERS.map((k) => csvEscape(r[k])).join(",");
    lines.push(line);
  }
  return lines.join("\n");
}

/**
 * Main GET handler
 */
export async function GET(req) {
  try {
    const url = new URL(req.url);
    const secret = url.searchParams.get("secret");

    const {
      CRON_SECRET,
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      GOOGLE_SERVICE_ACCOUNT_JSON,
      GOOGLE_DRIVE_FOLDER_ID,
    } = process.env;

    // 1) sicurezza
    if (!CRON_SECRET || secret !== CRON_SECRET) {
      return NextResponse.json(
        { ok: false, error: "unauthorized" },
        { status: 401 }
      );
    }

    // 2) check env
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { ok: false, error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" },
        { status: 500 }
      );
    }
    if (!GOOGLE_SERVICE_ACCOUNT_JSON || !GOOGLE_DRIVE_FOLDER_ID) {
      return NextResponse.json(
        { ok: false, error: "Missing GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_DRIVE_FOLDER_ID" },
        { status: 500 }
      );
    }

    // 3) Supabase: estrai dati
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await supabase
      .from("appointments")
      .select("*")
      .order("dataInserimento", { ascending: true })
      .order("oraInserimento", { ascending: true });

    if (error) {
      return NextResponse.json(
        { ok: false, error: `Supabase error: ${error.message}` },
        { status: 500 }
      );
    }

    const rows = data || [];
    const csv = rowsToCsv(rows);

    // 4) Google Drive (Service Account) – Drive Condiviso
    const credentials = JSON.parse(GOOGLE_SERVICE_ACCOUNT_JSON);
    const jwt = new google.auth.JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: ["https://www.googleapis.com/auth/drive"],
    });
    const drive = google.drive({ version: "v3", auth: jwt });

    const folderId = GOOGLE_DRIVE_FOLDER_ID; // deve essere in un Drive Condiviso
    const today = new Date();
    const yyyy = String(today.getFullYear());
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    const filename = `coface_backup_${yyyy}-${mm}-${dd}.csv`;

    // 4a) se il file di oggi esiste già nella cartella del Drive Condiviso -> skip
    const existing = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false and name = '${filename}'`,
      fields: "files(id,name)",
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
    });

    if (existing.data.files && existing.data.files.length > 0) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: "already_exists",
        file: existing.data.files[0],
        count: rows.length,
      });
    }

    // 4b) upload su Drive Condiviso
    const media = { mimeType: "text/csv", body: Readable.from(csv) };
    const fileMetadata = { name: filename, parents: [folderId], mimeType: "text/csv" };

    const upload = await drive.files.create({
      requestBody: fileMetadata,
      media,
      fields: "id,name,webViewLink,webContentLink",
      supportsAllDrives: true,
    });

    return NextResponse.json({
      ok: true,
      uploaded: upload.data,
      count: rows.length,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
