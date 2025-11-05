// components/CofaceDashboard.jsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  Upload,
  Filter,
  Plus,
  Check,
  X,
  RotateCcw,
  Pencil,
  Trash2,
  Calendar,
  FileSpreadsheet,
  Search,
  DollarSign,
  CheckCheck,
  Mail,
} from "lucide-react";
import { Button } from "@/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/card";
import { Input } from "@/components/input";
import { Label } from "@/components/label";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/select";
import * as XLSX from "xlsx";
import LogoutButton from "@/components/LogoutButton";
import Link from "next/link";


// Supabase client lato browser
import { getSupabaseClient } from "@/lib/supabaseClient";
import CreateAppointmentModal from "@/components/CreateAppointmentModal";

import AGENT_EMAILS_FULL from "@/data/agent_emails_full.json";

/* ────────────────────────────────────────────────────────────── */
/* Costanti / util                                                */
/* ────────────────────────────────────────────────────────────── */
const STATUSES = [
  { value: "programmato", label: "Programmato" },
  { value: "svolto", label: "Svolto" },
  { value: "annullato", label: "Annullato" },
  { value: "recuperato", label: "Recuperato" },
];
// Clienti "canonici" sempre visibili nel modale Nuovo
const CLIENTI_CANONICI = [
  "Coface",
  "Credit Partner",
  "Credit Solution",
  "General Service",
  "TCI PADOVA",
  "TCI BRESCIA 2",
  "TCI MILANO 4",
  "TCI MACERATA",
  "TCI CATANIA",
];


const CLEAR_ALL_PASSWORD = "Password.2";
const EDIT_PASSWORD = "123"; // ⬅️ password operativa per modifiche/annulli/cancellazioni

// Normalizza i nomi: "mARIO roSSI" -> "Mario Rossi"
function titleCase(s = "") {
  return String(s)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ""))
    .join(" ");
}


// ---- FIX DATE: helper che restituisce yyyy-mm-dd in LOCALE (no UTC) ----
function dateToLocalISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
// yyyy-mm-dd locale, evitando shift timezone
function todayISO() {
  return dateToLocalISO(new Date());
}
function nowHM() {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}
function parseExcelDate(v) {
  if (v == null || v === "") return "";
  if (typeof v === "number") return XLSX.SSF.format("yyyy-mm-dd", v);
  if (v instanceof Date) return dateToLocalISO(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const m = String(v).match(/(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/);
  if (m) {
    const dd = m[1].padStart(2, "0");
    const mm = m[2].padStart(2, "0");
    let yyyy = m[3];
    if (yyyy.length === 2) yyyy = (Number(yyyy) + 2000).toString();
    return `${yyyy}-${mm}-${dd}`;
  }
  const d = new Date(v);
  if (!isNaN(+d)) return dateToLocalISO(d);
  return "";
}
function parseExcelTime(v) {
  const pad = (n) => String(n).padStart(2, "0");
  if (v == null || v === "") return "";
  if (typeof v === "number") {
    let frac = v - Math.floor(v);
    if (frac === 0 && v >= 0 && v <= 24) return `${pad(Math.floor(v))}:00`;
    let totalMin = Math.round(frac * 24 * 60);
    totalMin = ((totalMin % (24 * 60)) + (24 * 60)) % (24 * 60);
    const hh = Math.floor(totalMin / 60);
    const mm = totalMin % 60;
    return `${pad(hh)}:${pad(mm)}`;
  }
  if (v instanceof Date) return `${pad(v.getHours())}:${pad(v.getMinutes())}`;
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2}):(\d{1,2})(?::\d{1,2})?$/);
  if (m) {
    const hh = Math.max(0, Math.min(23, parseInt(m[1], 10)));
    const mm = Math.max(0, Math.min(59, parseInt(m[2], 10)));
    return `${pad(hh)}:${pad(mm)}`;
  }
  if (/^\d+([.,]\d+)?$/.test(s)) {
    const num = parseFloat(s.replace(",", "."));
    const totalMin = Math.round(num * 60);
    const hh = Math.floor(totalMin / 60);
    const mm = totalMin % 60;
    return `${pad(hh)}:${pad(mm)}`;
  }
  return s || "";
}
function tsFrom(dateStr, timeStr) {
  if (!dateStr) return NaN;
  const m = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return NaN;
  const y = +m[1], mo = +m[2], d = +m[3];
  let hh = 0, mm = 0;
  if (timeStr) {
    const t = String(timeStr).match(/^(\d{1,2}):(\d{1,2})$/);
    if (t) { hh = +t[1]; mm = +t[2]; }
  }
  return new Date(y, mo - 1, d, hh, mm, 0, 0).getTime();
}
function fmtDate(d) {
  if (!d) return "";
  try {
    const [y, m, dd] = d.split("-");
    return `${dd}/${m}/${y}`;
  } catch {
    return d;
  }
}
function csvSafe(v) {
  if (v == null) return "";
  const s = String(v);
  return s.includes(",") || s.includes("\n") || s.includes('"')
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

async function exportAllCSV() {
  try {
    setIsExporting?.(true);
    const allRows = await fetchAllAppointmentsPaged(1000);
    const csv = toCSV(allRows);
    downloadFile(csv, `coface_appuntamenti_ALL_${todayISO()}.csv`, "text/csv;charset=utf-8");
  } catch (e) {
    console.error("Export CSV (ALL) error:", e);
    alert("Errore durante l'esportazione completa in CSV.");
  } finally {
    setIsExporting?.(false);
  }
}

async function exportAllExcel() {
  try {
    setIsExporting?.(true);
    const allRows = await fetchAllAppointmentsPaged(1000);
    const wb = toExcelWorkbook(allRows); // riusa il tuo builder esistente
    const blob = workbookToBlob(wb);     // o equivalente utility che già usi
    downloadBlob(blob, `coface_appuntamenti_ALL_${todayISO()}.xlsx`);
  } catch (e) {
    console.error("Export Excel (ALL) error:", e);
    alert("Errore durante l'esportazione completa in Excel.");
  } finally {
    setIsExporting?.(false);
  }
}


function aggregateByMonth(rows, dateKey) {
  const map = new Map();
  for (const r of rows) {
    const d = r?.[dateKey];
    if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    const key = d.slice(0, 7);
    map.set(key, (map.get(key) || 0) + 1);
  }
  return Array.from(map.entries())
    .map(([ym, count]) => {
      const [y, m] = ym.split("-");
      return { ym, month: `${m}/${String(y).slice(2)}`, count };
    })
    .sort((a, b) => a.ym.localeCompare(b.ym))
    .slice(-12);
}
function generateId() {
  return (Date.now().toString(36) + Math.random().toString(36).slice(2, 8)).toUpperCase();
}

  // DB -> UI
  function rowFromDb(db) {
    const dataInserimento =
      db.dataInserimento ?? db.datainserimento ?? db.data_inserimento ?? null;
    const oraInserimento =
      db.oraInserimento ?? db.orainserimento ?? db.ora_inserimento ?? "";

    // normalizza tipo per la UI (sede | videocall | null)
    const tipoNorm = (() => {
      const k = String(db.tipo_appuntamento ?? "")
        .normalize("NFKC")
        .replace(/\u00A0/g, " ")   // NBSP -> spazio
        .replace(/_/g, " ")        // underscore -> spazio
        .trim()
        .replace(/\s+/g, " ")      // spazi multipli -> singolo
        .toLowerCase();
      if (!k) return null;
      if (k === "sede" || k === "in sede") return "sede";
      if (k === "videocall" || k === "video call" || k === "video-call") return "videocall";
      return null;
    })();

    return {
      id: db.id,
      dataInserimento,
      oraInserimento,

      data: db.data ?? null,
      ora: db.ora ?? "",
      azienda: db.azienda ?? "",
      referente: db.referente ?? "",
      telefono: db.telefono ?? "",
      email: db.email ?? "",
      piva: db.piva ?? "",
      indirizzo: db.indirizzo ?? "",
      città: db.citta ?? db["città"] ?? "",
      provincia: db.provincia ?? "",
      agente: db.agente ?? "",
      operatore: db.operatore ?? "",
      cliente: db.cliente ?? "Coface",
      stato: db.stato ?? "programmato",
      tipo_appuntamento: tipoNorm,
      note: db.note ?? "",
      idContaq: db.idContaq ?? "",
      dataAnnullamento: db.dataAnnullamento ?? null,
      dataFatturazione: db.dataFatturazione ?? null,
      fatturato: !!db.fatturato,
      confermato: !!db.confermato,

      created_at: db.created_at ?? null,
      updated_at: db.updated_at ?? null,
    };
  }

const toNull = (v) => (v === "" || v === undefined ? null : v);
  // UI -> DB
  function rowToDb(js) {
    // normalizza tipo per il DB (sede | videocall | null)
    const tipoNorm = (() => {
      const k = String(js?.tipo_appuntamento ?? js?.tipoAppuntamento ?? "")
        .normalize("NFKC")
        .replace(/\u00A0/g, " ")
        .replace(/_/g, " ")
        .trim()
        .replace(/\s+/g, " ")
        .toLowerCase();
      if (!k) return null;
      if (k === "sede" || k === "in sede") return "sede";
      if (k === "videocall" || k === "video call" || k === "video-call") return "videocall";
      return null;
    })();

    return {
      id: js.id,

      // 👉 usa i nomi REALI delle colonne nel DB (minuscolo)
      dataInserimento: js.dataInserimento ?? null,
      oraInserimento: js.oraInserimento ?? "",

      data: js.data ?? null,
      ora: js.ora ?? "",
      azienda: js.azienda ?? "",
      referente: js.referente ?? "",
      telefono: js.telefono ?? "",
      email: js.email ?? "",
      piva: js.piva ?? "",
      indirizzo: js.indirizzo ?? "",
      citta: js["città"] ?? js.citta ?? "",
      provincia: js.provincia ?? "",
      agente: js.agente ?? "",
      operatore: js.operatore ?? "",
      cliente: js.cliente ?? "Coface",
      stato: js.stato ?? "programmato",
      tipo_appuntamento: tipoNorm,
      note: js.note ?? "",
      idContaq: js.idContaq ?? "",
      dataAnnullamento: js.dataAnnullamento ?? null,
      dataFatturazione: js.dataFatturazione ?? null,
      fatturato: !!js.fatturato,
      confermato: !!js.confermato,
    };
  }

    // ⬇️ Mappa SOLO le chiavi presenti nel patch dalla UI al DB
  function patchToDb(patch = {}) {
    const out = {};

    // usa toNull già definito sopra nel file
    // rinomina "città" -> citta se presente nel patch
    if ("città" in patch || "citta" in patch) out.citta = patch["città"] ?? patch.citta;

    // chiavi con lo stesso nome tra UI e DB: copiale solo se presenti nel patch
    const same = [
      "id","dataInserimento","oraInserimento","data","ora","azienda","referente",
      "telefono","email","piva","indirizzo","provincia","agente","operatore",
      "cliente","stato","note","idContaq","fatturato","confermato"
    ];
    for (const k of same) if (k in patch) out[k] = patch[k];

    // date che vanno a null se stringa vuota
    if ("dataAnnullamento" in patch) out.dataAnnullamento = toNull(patch.dataAnnullamento);
    if ("dataFatturazione" in patch) out.dataFatturazione = toNull(patch.dataFatturazione);

    // normalizza tipo appuntamento SOLO se presente nel patch
    if ("tipo_appuntamento" in patch || "tipoAppuntamento" in patch) {
      const raw = patch.tipo_appuntamento ?? patch.tipoAppuntamento ?? "";
      const key = String(raw)
        .normalize("NFKC")
        .replace(/\u00A0/g, " ")
        .replace(/_/g, " ")
        .trim()
        .replace(/\s+/g, " ")
        .toLowerCase();
      if (key === "sede" || key === "in sede") out.tipo_appuntamento = "sede";
      else if (["videocall","video call","video-call"].includes(key)) out.tipo_appuntamento = "videocall";
      else out.tipo_appuntamento = null;
    }

    return out;
  }

// Scarica tutto il DB a pagine da 1000
async function fetchAllAppointmentsPaged(pageSize = 1000) {
  let from = 0;
  const all = [];
  for (;;) {
    const { data, error } = await supabase
      .from("appuntamenti")
      .select("*")
      .order("id", { ascending: true }) // ordina per chiave stabile
      .range(from, from + pageSize - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    // mapping DB -> UI
    for (const d of data) all.push(rowFromDb(d));

    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}



/* Excel headers del template */
const DEFAULT_HEADERS = [
  "ID",
  "ID Contaq",
  "Data Inserimento",
  "Ora Inserimento",
  "Data Appuntamento",
  "Ora Appuntamento",
  "Azienda",
  "P.iva",
  "Referente",
  "Telefono",
  "Email",
  "Città",
  "Provincia",
  "Agente",
  "Operatore",
  "Cliente",
  "Stato",
  "Data Annullamento",
  "Note",
  "Fatturabile",
  "Fatturato",
  "Data Fatturazione",
];
/* ────────────────────────────────────────────────────────────── */
/* EMAIL UTILS — forza sempre Gmail Web (niente prompt di sistema) */
/* ────────────────────────────────────────────────────────────── */

function joinEmails(v) {
  if (!v) return "";
  return Array.isArray(v) ? v.filter(Boolean).map(String).join(",") : String(v);
}

/** Gmail compose compatibile (u/0 = account primario; tf=cm funziona meglio con CC/BCC) */
function gmailComposeUrl({ to, cc, bcc, subject, body }) {
  const enc = encodeURIComponent;
  const base = "https://mail.google.com/mail/u/0/?view=cm&fs=1&tf=cm";
  const toStr  = joinEmails(to);
  const ccStr  = joinEmails(cc);
  const bccStr = joinEmails(bcc);

  let url = `${base}&to=${enc(toStr)}`;
  if (ccStr)  url += `&cc=${enc(ccStr)}`;
  if (bccStr) url += `&bcc=${enc(bccStr)}`;
  if (subject) url += `&su=${enc(subject)}`;
  if (body)    url += `&body=${enc(body)}`;
  return url;
}

/** build mailto: (usato solo per il fallback “ufficiale” di Gmail) */
function mailtoUrl({ to, cc, bcc, subject, body }) {
  const enc = encodeURIComponent;
  const toStr  = joinEmails(to);
  const ccStr  = joinEmails(cc);
  const bccStr = joinEmails(bcc);

  const parts = [];
  if (subject) parts.push(`subject=${enc(subject)}`);
  if (body)    parts.push(`body=${enc(body)}`);
  if (ccStr)   parts.push(`cc=${enc(ccStr)}`);
  if (bccStr)  parts.push(`bcc=${enc(bccStr)}`);

  return `mailto:${toStr}${parts.length ? "?" + parts.join("&") : ""}`;
}

/* ───────────────── EMAIL UTILS — open in NEW TAB only ───────────────── */

function _joinEmails(v) {
  return Array.isArray(v) ? v.filter(Boolean).join(",") : (v || "");
}

/** Builder: usa il converter Gmail (mantiene CC/BCC) */
function _gmailConverterUrl({ to, cc, bcc, subject, body }) {
  const enc   = encodeURIComponent;
  const toStr = _joinEmails(to);
  const ccStr = _joinEmails(cc);
  const bccStr = _joinEmails(bcc);

  const q = [];
  if (subject) q.push(`subject=${enc(subject)}`);
  if (body)    q.push(`body=${enc(body)}`);
  if (ccStr)   q.push(`cc=${enc(ccStr)}`);
  if (bccStr)  q.push(`bcc=${enc(bccStr)}`);

  const mailto = `mailto:${toStr}${q.length ? "?" + q.join("&") : ""}`;
  return `https://mail.google.com/mail/u/0/?extsrc=mailto&url=${enc(mailto)}`;
}

/**
 * Apre SEMPRE in una nuova scheda, senza toccare quella corrente.
 * Usa un <a target="_blank"> sintetico per evitare comportamenti strani.
 */
function openEmail({ to, cc, bcc, subject, body }) {
  const url = _gmailConverterUrl({ to, cc, bcc, subject, body });

  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// ---- TCI CAPACITY: costanti + helper ----
export const TCI_CLIENTI = [
  "TCI PADOVA",
  "TCI BRESCIA 2",
  "TCI MILANO 4",
  "TCI MACERATA",
  "TCI CATANIA",
];

// normalizza stringhe per confronti robusti
function norm(s) {
  return String(s || "").trim().toUpperCase();
}

// true se il cliente è uno dei TCI
export function isTciCliente(cli) {
  const n = norm(cli);
  return TCI_CLIENTI.some((x) => norm(x) === n);
}

// chiave settimana ISO: YYYY-Www (sett. che inizia il lunedì)
export function weekKeyFromDate(d) {
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return null;

  // calcolo ISO week
  const tmp = new Date(Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate()));
  const day = tmp.getUTCDay() || 7; // 1..7 (lun=1)
  tmp.setUTCDate(tmp.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((tmp - yearStart) / 86400000 + 1) / 7);
  const y = tmp.getUTCFullYear();
  return `${y}-W${String(weekNo).padStart(2, "0")}`;
}

// testo human-readable dell’intervallo (lun-dom) di una weekKey
export function weekRangeLabel(weekKey) {
  if (!weekKey) return "";
  const [y, w] = weekKey.split("-W").map((x) => Number(x));
  // trova il lunedì di quella iso-week
  const simple = new Date(Date.UTC(y, 0, 1 + (w - 1) * 7));
  const day = simple.getUTCDay() || 7;
  const monday = new Date(simple);
  monday.setUTCDate(simple.getUTCDate() - day + 1);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const fmt = (D) => `${D.getUTCDate()}/${String(D.getUTCMonth() + 1).padStart(2, "0")}`;
  return `${fmt(monday)} – ${fmt(sunday)}`;
}

/* ────────────────────────────────────────────────────────────── */
/* Helper tipo appuntamento + lookup email agente                 */
/* ────────────────────────────────────────────────────────────── */

function tipoLabel(r) {
  const raw =
    r?.tipo_appuntamento ??
    r?.tipoAppuntamento ??
    r?.tipo ??
    "";

  const k = String(raw)
    .normalize("NFKC")
    .replace(/\u00A0/g, " ")
    .replace(/_/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

  if (k === "sede" || k === "in sede") return "in sede";
  if (k === "videocall" || k === "video call" || k === "video-call") return "in videocall";
  return "";
}


/** normalizza un nome rimuovendo accenti, doppie spaziature e portando a lowercase */
function normalizeName(s) {
  return String(s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s.']/gu, " ")
    .replace(/\s+/g, " ").trim().toLowerCase();
}

/** genera alcune varianti utili per matching (nome cognome, solo cognome, iniziali, senza spazi) */
function nameVariants(fullName) {
  const norm = normalizeName(fullName);
  if (!norm) return [];
  const parts = norm.split(" ");
  const name = parts[0] || "";
  const surname = parts[parts.length - 1] || "";
  const initials = (name && surname) ? `${name[0]}.${surname}` : "";
  return Array.from(new Set([
    norm,                      // "mario rossi"
    surname,                   // "rossi"
    initials,                  // "m.rossi"
    norm.replace(/\s+/g, ""),  // "mariorossi"
  ].filter(Boolean)));
}

/** costruisce indice {variante -> email} a partire dal JSON Nome Cognome -> email */
function buildAgentIndex(mapFull) {
  const idx = {};
  for (const [full, email] of Object.entries(mapFull || {})) {
    for (const v of nameVariants(full)) {
      if (!idx[v]) idx[v] = email;
    }
  }
  return idx;
}

const AGENT_EMAIL_INDEX = buildAgentIndex(AGENT_EMAILS_FULL);

/** ritorna l’email dell’agente scritto nel record appuntamento (accetta Nome Cognome, solo cognome, ecc.) */
function getAgentEmail(r) {
  const raw = String(r?.agente || "").trim();
  if (!raw) return "";
  const norm = normalizeName(raw);

  // 1) match diretto sul Nome Cognome
  for (const [full, email] of Object.entries(AGENT_EMAILS_FULL)) {
    if (normalizeName(full) === norm) return email;
  }
  // 2) varianti (cognome, m.cognome, senza spazi, ecc.)
  return AGENT_EMAIL_INDEX[norm] || "";
}

/* ────────────────────────────────────────────────────────────── */
/* Email sent flags (persistenza locale via localStorage)         */
/* ────────────────────────────────────────────────────────────── */
function emailSentKey(type, id) {
  return `coface_email_sent:${type}:${id}`;
}
function isEmailSent(type, id) {
  if (!id) return false;
  try { return localStorage.getItem(emailSentKey(type, id)) === "1"; } catch { return false; }
}
function markEmailSent(type, id) {
  if (!id) return;
  try { localStorage.setItem(emailSentKey(type, id), "1"); } catch {}
}

/* ────────────────────────────────────────────────────────────── */
/* Template email                                                 */
/* ────────────────────────────────────────────────────────────── */
function makeEmailAgente(r) {
  const dataGGMM = fmtDate(r?.data);
  const subject = `Notifica appuntamento Coface - ${dataGGMM} alle ore ${r?.ora || ""} - ${r?.azienda || ""}`;
  const body = [
    `Gentile ${r?.agente || ""},`,
    ``,
    `abbiamo fissato un appuntamento ${tipoLabel(r)} per il giorno ${dataGGMM} alle ore ${r?.ora || ""}.`,
    ``,
    `Azienda: ${r?.azienda || ""}`,
    `P.IVA: ${r?.piva || ""}`,
    `Indirizzo: ${r?.indirizzo || ""} - ${r?.provincia || ""}`,
    ``,
    `Referente: ${r?.referente || ""}`,
    `Telefono: ${r?.telefono || ""}`,
    `EMAIL: ${r?.email || ""}`,
    ``,
    `NOTE: ${r?.note || ""}`,
    ``,
    `Buon lavoro`,
    `${r?.operatore || ""}`,
  ].join("\n");

  // cliente speciale
  const isTCI = String(r?.cliente || "").trim().toUpperCase() === "TCI PADOVA";

  // default
  let to = getAgentEmail(r) || "";
  let cc = [
    "arturo.antacido@coface.com",
    "cofaceappuntamenti@apemo.net",
    "tlcoface@contaq.it",
  ];
  let bcc = ["tlcoface@contaq.it"];

  // override per TCI PADOVA
  if (isTCI) {
    to = ["andrea.fabiani@coface.it", "andrea.bottazzin@coface.it"];
    cc = [
      "paolo.amenta@coface.it",
      "Ivan.Ciociano@coface.it",
      "cristian.annovazzi@coface.com",
      "arturo.antacido@coface.com",
      "cofaceappuntamenti@apemo.net",
    ];
    // bcc invariato
  }

  return { to, cc, bcc, subject, body };
}


function makeEmailAzienda(r) {
  const dataGGMM = fmtDate(r?.data); // formato gg/mm/aaaa
  const subject = `Conferma appuntamento Coface - ${dataGGMM} alle ore ${r?.ora || ""} - ${r?.azienda || ""}`;
  const body = [
    `Gentile  ${r?.referente || ""},`,
    ``,
    `La presente per confermare l' appuntamento ${tipoLabel(r)}, per il giorno ${dataGGMM} alle ore ${r?.ora || ""} con il nostro Sales Account ${r?.agente || ""}`,
    ``,
    `Di seguito una breve sintesi delle soluzioni COFACE che permettono di:`,
    ``,
    `- Richiedere informazioni complete in tutto il mondo in tempo reale utili per chi fa export, a condizioni molto competitive`,
    `- Confrontare i fidi dei provider di informazioni con quelli assicurativi Coface`,
    `- Sapere se i clienti hanno avuto sinistri o sono assicurati`,
    `- Conoscere il fido assicurativo e monitorarlo per essere tempestivamente avvisati in caso di revoca fidi Valutare i fidi e affidabilità dei fornitori strategici in Italia e nel mondo`,
    ``,
    `Sarà nostra cura contattarla qualche giorno prima per confermare o riprogrammare la data dell'incontro.`,
    ``,
    `La ringraziamo per il tempo che ci ha dedicato e le inviamo un cordiale saluto.`,
    ``,
    `${r?.operatore || ""}`,
    ``,
    `Customer Success Specialist`,
    ``,
    `Numero Verde: 800 600 880`,
  ].join("\n");

  // TO invariato (email azienda dal record)
  const to = r?.email || "";

  // default CC/BCC
  let cc = [getAgentEmail(r), "arturo.antacido@coface.com"].filter(Boolean);
  let bcc = ["tlcoface@contaq.it"];

  // override per TCI PADOVA: cambia solo il CC
  const isTCI = String(r?.cliente || "").trim().toUpperCase() === "TCI PADOVA";
  if (isTCI) {
    cc = [
      "andrea.fabiani@coface.it",
      "andrea.bottazzin@coface.it",
      "arturo.antacido@coface.com",
    ];
    // to e bcc invariati
  }

  return { to, cc, bcc, subject, body };
}


// ✉️ Email ANNULLO (mantieni gg/mm/aaaa) — destinatario: agente; CC/BCC come email agente
function makeEmailAnnullo(r) {
  const dataGGMM = fmtDate(r?.data);
  const subject = `Annullo appuntamento Coface - ${dataGGMM} alle ore ${r?.ora || ""} - ${r?.azienda || ""}`;
  const body = [
    `Gentile ${r?.agente || ""},`,
    ``,
    `inviamo per notifica l’annullo dell’appuntamento in oggetto precedentemente per il giorno ${dataGGMM} alle ore ${r?.ora || ""}.`,
    ``,
    `Azienda: ${r?.azienda || ""}`,
    `P.IVA: ${r?.piva || ""}`,
    `Indirizzo: ${r?.indirizzo || ""} - ${r?.provincia || ""}`,
    ``,
    `Referente: ${r?.referente || ""}`,
    `Telefono: ${r?.telefono || ""}`,
    `EMAIL: ${r?.email || ""}`,
    ``,
    `Sarà nostra cura riprendere in carico l’anagrafica per cercare di fissare un nuovo incontro`,
    ``,
    `Buon lavoro`,
    `${r?.operatore || ""}`,
  ].join("\n");

  const to  = getAgentEmail(r) || "";
  const cc  = ["arturo.antacido@coface.com"];
  const bcc = ["tlcoface@contaq.it"];

  return { to, cc, bcc, subject, body };
}

/* ─────────────────────────────────────────────────────────── */
/* Editor (modale) – COMPATTO, SCROLL INTERNO, FOOTER STICKY   */
/* ─────────────────────────────────────────────────────────── */
function Editor({
  editing,
  setEditing,
  updateRow,
  markSvolto,
  markAnnullato,
  markRecupero,
  markFatturato,
  unmarkFatturato,
  clientiOpzioni,
}) {
  if (!editing) return null;
  const r = editing;
  const locked = !!r.fatturato;

  // stato "già inviato" (persistenza locale via localStorage)
  const sentAzienda = isEmailSent("azienda", r.id);
  const sentAgente  = isEmailSent("agente",  r.id);
  const sentAnnullo = isEmailSent("annullo", r.id);

  const commonInputProps = (k) => ({
    value: r[k] ?? "",
    onChange: async (e) => {
      const v = e.target.value;
      const next = { ...r, [k]: v };
      setEditing(next);
      await updateRow(r.id, { [k]: v });
    },
    disabled: locked && k !== "note",
  });

  return (
    <div
      className="fixed inset-0 bg-black/30 flex items-end md:items-center justify-center p-4 z-50"
      onClick={() => setEditing(null)}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full md:max-w-4xl max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER (sticky) */}
        <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            <h3 className="font-semibold">Modifica appuntamento</h3>
          </div>
          <div className="text-xs text-gray-500">
            ID: <span className="font-mono">{r.id}</span>{r.fatturato ? " • FATTURATO" : ""}
          </div>
        </div>

        {/* BODY (scroll) */}
        <div className="p-4 overflow-y-auto">
          {/* Gruppo: Metadati inserimento */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
            <div>
              <Label className="text-xs">Data inserimento</Label>
              <Input type="date" {...commonInputProps("dataInserimento")} />
            </div>
            <div>
              <Label className="text-xs">Ora inserimento</Label>
              <Input type="time" {...commonInputProps("oraInserimento")} />
            </div>
            <div>
              <Label className="text-xs">Data appuntamento</Label>
              <Input type="date" {...commonInputProps("data")} />
            </div>
            <div>
              <Label className="text-xs">Ora appuntamento</Label>
              <Input type="time" {...commonInputProps("ora")} />
            </div>
          </div>

          {/* Gruppo: Anagrafica */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <div className="md:col-span-2">
              <Label className="text-xs">Azienda</Label>
              <Input {...commonInputProps("azienda")} />
            </div>

            <div>
              <Label className="text-xs">Referente</Label>
              <Input {...commonInputProps("referente")} />
            </div>
            <div>
              <Label className="text-xs">Telefono</Label>
              <Input {...commonInputProps("telefono")} />
            </div>
            <div>
              <Label className="text-xs">Email</Label>
              <Input {...commonInputProps("email")} />
            </div>
            <div>
              <Label className="text-xs">P.iva</Label>
              <Input {...commonInputProps("piva")} />
            </div>  
            <div>
              <Label className="text-xs">Regione</Label>
              <Input {...commonInputProps("città")} />
            </div>
            <div>
              <Label className="text-xs">Provincia</Label>
              <Input {...commonInputProps("provincia")} />
            </div>

            <div>
              <Label className="text-xs">Agente</Label>
              <Input {...commonInputProps("agente")} />
            </div>
            <div>
              <Label className="text-xs">Operatore</Label>
              <Input {...commonInputProps("operatore")} />
            </div>

            <div>
              <Label className="text-xs">Cliente</Label>
              <Select
                value={r.cliente || ""}
                onValueChange={(v) => updateRow(r.id, { cliente: v })}
                disabled={locked}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona cliente" />
                </SelectTrigger>
                <SelectContent>
                  {clientiOpzioni.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
            <Label>Tipo appuntamento</Label>
            <Select
              value={r.tipo_appuntamento ?? ""}
              onValueChange={(v) => {
                // normalizza: 'in_sede' -> 'sede'
                const norm = v === "in_sede" ? "sede" : v;
                setEditing({ ...r, tipo_appuntamento: norm });
                updateRow(r.id, { tipo_appuntamento: norm });
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleziona tipo appuntamento" />
              </SelectTrigger>
              <SelectContent>
                {/* usa direttamente 'sede' come valore */}
                <SelectItem value="sede">In sede</SelectItem>
                <SelectItem value="videocall">Videocall</SelectItem>
              </SelectContent>
            </Select>
            </div>

            <div className="md:col-span-2">
              <Label className="text-xs">ID Contaq (opzionale)</Label>
              <Input {...commonInputProps("idContaq")} />
            </div>
          </div>

          {/* Gruppo: Stato e fatturazione */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <div>
              <Label className="text-xs">Stato</Label>
              <Select
                value={r.stato}
                onValueChange={(v) => updateRow(r.id, { stato: v })}
                disabled={locked}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Data annullamento</Label>
              <Input type="date" {...commonInputProps("dataAnnullamento")} />
            </div>
            <div>
              <Label className="text-xs">Data fatturazione</Label>
              <Input type="date" {...commonInputProps("dataFatturazione")} />
            </div>
          </div>

          {/* Gruppo: Note e indirizzo */}
          <div className="grid grid-cols-1 gap-3">
            <div>
              <Label className="text-xs">Note</Label>
              <Input {...commonInputProps("note")} />
            </div>
            <div>
              <Label className="text-xs">Indirizzo (solo interno)</Label>
              <Input {...commonInputProps("indirizzo")} />
            </div>
          </div>
        </div>

        {/* FOOTER (sticky) */}
        <div className="p-3 border-t bg-white sticky bottom-0 z-10">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            {/* Azioni stato */}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={async () => {
                  await markSvolto(r);
                  setEditing({ ...r, stato: "svolto" });
                }}
                className="gap-2"
                disabled={locked}
              >
                <Check className="h-4 w-4" /> Segna svolto
              </Button>

              <Button
                variant="outline"
                onClick={async () => {
                  await markAnnullato(r);
                  setEditing({
                    ...r,
                    stato: "annullato",
                    dataAnnullamento: todayISO(),
                  });
                }}
                className="gap-2"
                disabled={locked}
              >
                <X className="h-4 w-4" /> Annulla
              </Button>

              <Button
                variant="outline"
                onClick={async () => {
                  await markRecupero(r);
                  setEditing({ ...r, stato: "recuperato" });
                }}
                className="gap-2"
                disabled={locked}
              >
                <RotateCcw className="h-4 w-4" /> Recuperato
              </Button>

              {!r.fatturato ? (
                <Button
                  onClick={async () => {
                    await markFatturato(r);
                    setEditing({
                      ...r,
                      fatturato: true,
                      dataFatturazione: todayISO(),
                    });
                  }}
                  className="gap-2"
                >
                  <DollarSign className="h-4 w-4" /> Segna fatturato
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  onClick={async () => {
                    await unmarkFatturato(r);
                    setEditing({
                      ...r,
                      fatturato: false,
                      dataFatturazione: "",
                    });
                  }}
                  className="gap-2"
                >
                  <DollarSign className="h-4 w-4" /> Togli fatturato
                </Button>
              )}
            </div>

            {/* Bottoni email (wrappano su 2 righe se serve) */}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  const { to, cc, bcc, subject, body } = makeEmailAzienda(r);
                  openEmail({ to, cc, bcc, subject, body });
                  markEmailSent("azienda", r.id);
                  setEditing({ ...r });
                }}
                className={`gap-2 ${sentAzienda ? "text-green-600 font-medium" : ""}`}
                title="Email conferma a azienda"
              >
                <Mail className="h-4 w-4" />
                Email azienda
              </Button>

              <Button
                variant="outline"
                onClick={() => {
                  const { to, cc, bcc, subject, body } = makeEmailAgente(r);
                  openEmail({ to, cc, bcc, subject, body });
                  markEmailSent("agente", r.id);
                  setEditing({ ...r });
                }}
                className={`gap-2 ${sentAgente ? "text-green-600 font-medium" : ""}`}
                title="Email notifica a agente"
              >
                <Mail className="h-4 w-4" />
                Email agente
              </Button>

              <Button
                variant="outline"
                onClick={() => {
                  const { to, cc, bcc, subject, body } = makeEmailAnnullo(r);
                  openEmail({ to, cc, bcc, subject, body });
                  markEmailSent("annullo", r.id);
                  setEditing({ ...r });
                }}
                className={`gap-2 ${sentAnnullo ? "text-green-600 font-medium" : ""}`}
                title="Email annullo appuntamento"
              >
                <Mail className="h-4 w-4" />
                Email annullo
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── */
/* Barre comandi                                                  */
/* ────────────────────────────────────────────────────────────── */
function FiltersBar({
  q,
  setQ,
  client,
  setClient,
  clients,
  agent,
  setAgent,
  agents,
  creator,
  setCreator,
  creators,
  status,
  setStatus,
  dayAppFrom,
  setDayAppFrom,
  dayAppTo,
  setDayAppTo,
  dayInsFrom,
  setDayInsFrom,
  dayInsTo,
  setDayInsTo,
  setPage,
}) {
  const handleTodayInsertion = () => {
    const today = todayISO();
    setDayInsFrom(today);
    setDayInsTo(today);
    setPage(1);
  };
  
  const handleClearInsertionDates = () => {
    setDayInsFrom("");
    setDayInsTo("");
    setPage(1);
  };

  const handleClearAppointmentDates = () => {
    setDayAppFrom("");
    setDayAppTo("");
    setPage(1);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="sm:col-span-2">
          <Label>Cerca</Label>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4" />
            <Input
              className="pl-8"
              placeholder="Azienda, referente, regione, note, provincia, ID Contaq…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>
        <div>
          <Label>Cliente</Label>
          <Select
            value={client}
            onValueChange={(v) => {
              setClient(v);
              setPage(1);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Tutti" />
            </SelectTrigger>
            <SelectContent>
              {clients.map((c) => (
                <SelectItem key={c} value={c}>
                  {c === "tutti" ? "Tutti" : c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Agente</Label>
          <Select
            value={agent}
            onValueChange={(v) => {
              setAgent(v);
              setPage(1);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Tutti" />
            </SelectTrigger>
            <SelectContent>
              {agents.map((a) => (
                <SelectItem key={a} value={a}>
                  {a === "tutti" ? "Tutti" : a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Operatore</Label>
          <Select
            value={creator}
            onValueChange={(v) => {
              setCreator(v);
              setPage(1);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Tutti" />
            </SelectTrigger>
            <SelectContent>
              {creators.map((a) => (
                <SelectItem key={a} value={a}>
                  {a === "tutti" ? "Tutti" : a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="col-span-2">
          <div className="flex items-end justify-between mb-1">
            <Label>Appuntamento</Label>
            <Button
              variant="link"
              size="sm"
              onClick={handleClearAppointmentDates}
              className="h-auto p-0 text-xs text-red-600 hover:text-red-500"
            >
              Cancella
            </Button>
          </div>
          <div className="flex gap-2">
            <Input
              type="date"
              placeholder="Dal gg/mm/aaaa"
              value={dayAppFrom}
              onChange={(e) => {
                setDayAppFrom(e.target.value);
                setPage(1);
              }}
            />
            <Input
              type="date"
              placeholder="Al gg/mm/aaaa"
              value={dayAppTo}
              onChange={(e) => {
                setDayAppTo(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>
        
        <div className="col-span-2">
          <div className="flex items-end justify-between mb-1">
            <Label>Inserimento</Label>
            <div className="flex gap-1">
              <Button
                variant="link"
                size="sm"
                onClick={handleTodayInsertion}
                className="h-auto p-0 text-xs text-blue-600 hover:text-blue-500"
              >
                Oggi
              </Button>
              <Button
                variant="link"
                size="sm"
                onClick={handleClearInsertionDates}
                className="h-auto p-0 text-xs text-red-600 hover:text-red-500"
              >
                Cancella
              </Button>
            </div>
          </div>
          <div className="flex gap-2">
            <Input
              type="date"
              placeholder="Dal gg/mm/aaaa"
              value={dayInsFrom}
              onChange={(e) => {
                setDayInsFrom(e.target.value);
                setPage(1);
              }}
            />
            <Input
              type="date"
              placeholder="Al gg/mm/aaaa"
              value={dayInsTo}
              onChange={(e) => {
                setDayInsTo(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>
        
        <div>
          <Label>Stato</Label>
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Tutti" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tutti">Tutti</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

function ActionsBar({
  addEmptyRow,
  fileInputRef,
  importExcel,
  downloadTemplate,
  exportExcel,
  exportCSVFatturazione,
  exportExcelFatturazione,
  clearAll,
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button onClick={addEmptyRow} className="gap-2">
        <Plus className="h-4 w-4" />
        Nuovo
      </Button>

      <Button
        variant="secondary"
        className="gap-2"
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload className="h-4 w-4" />
        Importa Excel
      </Button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) importExcel(f);
          e.target.value = "";
        }}
      />

      <Button variant="secondary" className="gap-2" onClick={downloadTemplate}>
        <FileSpreadsheet className="h-4 w-4" />
        Template
      </Button>
      <Button variant="outline" className="gap-2" onClick={() => exportExcel(true)}>
        <Download className="h-4 w-4" />
        Export (filtrato)
      </Button>
      <Button variant="outline" className="gap-2" onClick={() => exportExcel(false)}>
        <Download className="h-4 w-4" />
        Export (tutto)
      </Button>
      <Button variant="outline" className="gap-2" onClick={exportCSVFatturazione}>
        <Download className="h-4 w-4" />
        CSV Fatturazione
      </Button>
      <Button variant="outline" className="gap-2" onClick={exportExcelFatturazione}>
        <Download className="h-4 w-4" />
        Excel Fatturazione
      </Button>

      <Button
        onClick={clearAll}
        className="gap-2 bg-red-600 hover:bg-red-700 text-white"
        title="Elimina tutti"
      >
        <Trash2 className="h-4 w-4" />
        Svuota tutto
      </Button>
    </div>
  );
}
/* ────────────────────────────────────────────────────────────── */
/* “Grafici” CSS (no librerie)                                   */
/* ────────────────────────────────────────────────────────────── */
function BarChartCSS({ title, data, height = 220 }) {
  const max = Math.max(1, ...data.map((d) => d.value || 0));
  return (
    <div className="border rounded-xl p-3">
      <div className="text-sm font-medium mb-2">{title}</div>
      <div className="h-[220px] flex items-end gap-2 overflow-x-auto pb-2">
        {data.map((d, i) => (
          <div key={i} className="flex flex-col items-center justify-end">
            <div
              className="w-[18px] bg-gray-800/80 rounded-t"
              style={{ height: `${(d.value / max) * height}px` }}
              title={`${d.label}: ${d.value}`}
            />
            <div className="text-[10px] mt-1 text-gray-600">{d.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DonutCSS({ title, items }) {
  const total = items.reduce((s, x) => s + (x.value || 0), 0);
  let acc = 0;
  const segments = items.map((x) => {
    const start = (acc / (total || 1)) * 360;
    acc += x.value || 0;
    const end = (acc / (total || 1)) * 360;
    return `${x.color} ${start}deg ${end}deg`;
  });
  const gradient = `conic-gradient(${segments.join(", ")})`;

  return (
    <div className="border rounded-xl p-3">
      <div className="text-sm font-medium mb-2">{title}</div>
      <div className="flex items-center gap-6">
        <div className="w-40 h-40 rounded-full" style={{ background: gradient }} />
        <div className="text-sm space-y-2">
          {items.map((x, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ background: x.color }} />
              <span className="w-28">{x.name}</span>
              <span className="font-medium">{x.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* KPI Operatore */
function OperatorStatsCard({ rowsAll, rowsFiltered, creators }) {
  const [selectedOp, setSelectedOp] = React.useState("tutti");
  const [respectFilters, setRespectFilters] = React.useState(true);

  const base = respectFilters ? rowsFiltered : rowsAll;
  const dataRows = React.useMemo(
    () => (selectedOp === "tutti" ? base : base.filter((r) => r.operatore?.toLowerCase() === selectedOp)),
    [base, selectedOp]
  );
  const kpis = React.useMemo(() => {
    const out = { tot: 0, programmato: 0, svolto: 0, annullato: 0, recuperato: 0 };
    for (const r of dataRows) {
      out.tot++;
      if (out[r.stato] != null) out[r.stato]++;
    }
    out.conv = out.tot ? out.svolto / out.tot : 0;
    out.annRate = out.tot ? out.annullato / out.tot : 0;
    return out;
  }, [dataRows]);
  const byAppMonth = React.useMemo(
    () => aggregateByMonth(dataRows, "data").map((x) => ({ label: x.month, value: x.count })),
    [dataRows]
  );
  const byInsMonth = React.useMemo(
    () => aggregateByMonth(dataRows, "dataInserimento").map((x) => ({ label: x.month, value: x.count })),
    [dataRows]
  );
  const byStatus = [
    { name: "Programmato", value: kpis.programmato, color: "#3b82f6" },
    { name: "Svolto", value: kpis.svolto, color: "#22c55e" },
    { name: "Annullato", value: kpis.annullato, color: "#ef4444" },
    { name: "Recuperato", value: kpis.recuperato, color: "#f59e0b" },
  ];
  const chip = (label, value) => (
    <div className="rounded-2xl border px-4 py-2 text-sm bg-white shadow-sm">
      <span className="opacity-60 mr-2">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Statistiche per Operatore</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-[240px]">
            <Label>Operatore</Label>
            <Select value={selectedOp} onValueChange={setSelectedOp}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {creators.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c === "tutti" ? "Tutti" : c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 mt-6">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={respectFilters}
              onChange={(e) => setRespectFilters(e.target.checked)}
            />
            <span className="text-sm">Rispetta i filtri sopra</span>
          </label>
        </div>
        <div className="flex flex-wrap gap-3">
          {chip("Totale", kpis.tot)}
          {chip("Svolti", kpis.svolto)}
          {chip("Annullati", kpis.annullato)}
          {chip("Recuperati", kpis.recuperato)}
          {chip("Tasso svolti", `${Math.round(kpis.conv * 100)}%`)}
          {chip("Tasso annullo", `${Math.round(kpis.annRate * 100)}%`)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <BarChartCSS title="Appuntamenti per mese" data={byAppMonth} />
          <BarChartCSS title="Inserimenti per mese" data={byInsMonth} />
          <DonutCSS title="Ripartizione stati" items={byStatus} />
        </div>
      </CardContent>
    </Card>
  );
}

/* ────────────────────────────────────────────────────────────── */
/* Leaderboard Operatori – stile infografica                      */
/*  - Mese/Anno                                                   */
/*  - Target dinamico (15/mese)                                   */
/*  - % annullati con legenda colori                              */
/*  - “Mostra tutti” (>=1 appuntamento)                           */
/* ────────────────────────────────────────────────────────────── */
function OperatorLeaderboardProCard({ rows, monthTarget = 15 }) {
  // UI
  const [mode, setMode] = React.useState("month"); // "month" | "year"
  const [showAll, setShowAll] = React.useState(false);

  // helpers data
  const pad = (n) => String(n).padStart(2, "0");
  const now = new Date();
  const currentYM = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  const currentY  = `${now.getFullYear()}`;

  // filtro periodo
  const rowsPeriod = React.useMemo(() => {
    const src = Array.isArray(rows) ? rows : [];
    if (mode === "month") return src.filter(r => r.dataInserimento?.slice(0,7) === currentYM);
    return src.filter(r => r.dataInserimento?.slice(0,4) === currentY);
  }, [rows, mode, currentYM, currentY]);

  // aggregazione per operatore
  const aggregated = React.useMemo(() => {
    const map = new Map();
    for (const r of rowsPeriod) {
      const key = (r.operatore || "—").toLowerCase();
      const prev = map.get(key) || { op: key, count: 0, cancelled: 0 };
      prev.count += 1;
      if ((r.stato || "").toLowerCase() === "annullato") prev.cancelled += 1;
      map.set(key, prev);
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count || a.op.localeCompare(b.op));
  }, [rowsPeriod]);

  const leader = aggregated[0]?.count || 0;
  const annualTarget = monthTarget * (now.getMonth() + 1);
  const target = mode === "month" ? monthTarget : annualTarget;

  // util
  const pct = (num, den) => (den > 0 ? Math.min(100, Math.round((num / den) * 100)) : 0);
  const dispName = (s) => s.split(" ").map(x => x ? x[0].toUpperCase()+x.slice(1) : x).join(" ");

  // selezione righe da mostrare
  const list = React.useMemo(() => {
    const base = showAll ? aggregated.filter(x => x.count > 0) : aggregated.slice(0, 10);
    return base.map((row, i) => {
      const cancelRate = row.count ? Math.round((row.cancelled / row.count) * 100) : 0;
      const progressLeader = pct(row.count, Math.max(1, leader));
      const progressTarget = pct(row.count, target);
      return { ...row, rank: i + 1, cancelRate, progressLeader, progressTarget };
    });
  }, [aggregated, showAll, leader, target]);

  // riepilogo a destra
  const summary = React.useMemo(() => {
    const tot = aggregated.reduce((s, x) => s + x.count, 0);
    const ann = aggregated.reduce((s, x) => s + x.cancelled, 0);
    const avg = aggregated.length ? (tot / aggregated.length) : 0;
    return {
      tot,
      ann,
      annRate: tot ? Math.round((ann / tot) * 100) : 0,
      avg: Math.round(avg * 10) / 10,
    };
  }, [aggregated]);

  const title =
    mode === "month"
      ? `🏆 Classifica Operatori – ${pad(now.getMonth() + 1)}/${String(now.getFullYear()).slice(2)}`
      : `🏆 Classifica Operatori – ${now.getFullYear()}`;

  // colore barra per % annullati
  const barClass = (rate) =>
    rate >= 25 ? "bg-rose-500"
    : rate >= 10 ? "bg-amber-500"
    : "bg-emerald-600";

  // riga operatore
  const BarRow = ({ row }) => {
    const medal = row.rank === 1 ? "🥇" : row.rank === 2 ? "🥈" : row.rank === 3 ? "🥉" : `${row.rank}.`;
    return (
      <div className="grid grid-cols-12 gap-3 items-center">
        {/* col 1–5: nome + medaglia */}
        <div className="col-span-12 md:col-span-5 min-w-0">
          <div className="flex items-center gap-2">
            <div className="w-8 text-center text-lg">{medal}</div>
            <div className="font-medium truncate">{dispName(row.op)} {row.rank === 1 && <span>👑</span>}</div>
          </div>
        </div>

        {/* col 6–10: barra orizzontale vs leader */}
        <div className="col-span-12 md:col-span-5">
          <div className="h-3 bg-gray-200 rounded-full overflow-hidden" title={`${row.count} appuntamenti • ${row.cancelRate}% annullati`}>
            <div className={`h-3 ${barClass(row.cancelRate)}`} style={{ width: `${row.progressLeader}%` }} />
          </div>
          <div className="flex justify-between text-[11px] text-gray-500 mt-1">
            <span>vs leader</span>
            <span>{row.progressLeader}% • {leader - row.count > 0 ? `-${leader - row.count}` : "pari!"}</span>
          </div>
        </div>

        {/* col 11–12: numeri */}
        <div className="col-span-12 md:col-span-2 flex md:block justify-between md:justify-end text-sm">
          <div className="font-semibold">{row.count}</div>
          <div className={`ml-4 md:ml-0 ${row.cancelRate>=25 ? "text-rose-600" : row.cancelRate>=10 ? "text-amber-600" : "text-emerald-600"}`}>
            {row.cancelRate}%
          </div>
        </div>

        {/* barra “obiettivo” */}
        <div className="col-span-12">
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-2 bg-sky-600" style={{ width: `${row.progressTarget}%` }} />
          </div>
          <div className="flex justify-between text-[11px] text-gray-500 mt-1">
            <span>Obiettivo ({target})</span>
            <span>{row.progressTarget}% • {row.count < target ? `${target - row.count} al target` : "target OK!"}</span>
          </div>
        </div>

        <div className="col-span-12 border-b" />
      </div>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle>{title}</CardTitle>
            <div className="text-xs text-gray-500 mt-1">
              {mode === "month"
                ? `Target: ${monthTarget} appuntamenti per operatore nel mese`
                : `Target cumulativo: ${annualTarget} al ${pad(now.getMonth()+1)}/${now.getFullYear()}`}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              className={`px-3 py-1 text-sm rounded-full border ${mode==="month" ? "bg-gray-900 text-white" : "bg-white"}`}
              onClick={() => setMode("month")}
            >
              Mese
            </button>
            <button
              className={`px-3 py-1 text-sm rounded-full border ${mode==="year" ? "bg-gray-900 text-white" : "bg-white"}`}
              onClick={() => setMode("year")}
            >
              Anno
            </button>
            <button
              className="px-3 py-1 text-sm rounded-full border"
              onClick={() => setShowAll(s => !s)}
              title="Mostra anche gli operatori con ≥1 appuntamento"
            >
              {showAll ? "Top 10" : "Mostra tutti"}
            </button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {aggregated.length === 0 ? (
          <div className="text-sm text-gray-500">Nessun inserimento nel periodo selezionato.</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
            {/* elenco (bar chart orizzontale) */}
            <div className="space-y-3">
              {/* intestazione compatta */}
              <div className="hidden md:grid grid-cols-12 text-[11px] text-gray-500 px-1">
                <span className="col-span-5">Operatore</span>
                <span className="col-span-5">Barra vs leader</span>
                <span className="col-span-2 text-right pr-2">Appt • % ann.</span>
              </div>

              <div className="space-y-4">
                {list.map((row) => (<BarRow key={row.op} row={row} />))}
              </div>
            </div>

            {/* pannello di riepilogo / legenda */}
            <div className="rounded-xl border p-4 bg-white h-max">
              <div className="text-sm font-medium mb-2">Riepilogo</div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border p-3">
                  <div className="text-[11px] text-gray-500">Totale inserimenti</div>
                  <div className="text-lg font-semibold">{summary.tot}</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-[11px] text-gray-500">% annullati (globale)</div>
                  <div className={`text-lg font-semibold ${summary.annRate>=25 ? "text-rose-600" : summary.annRate>=10 ? "text-amber-600" : "text-emerald-600"}`}>
                    {summary.annRate}%
                  </div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-[11px] text-gray-500">Media appt / operatore</div>
                  <div className="text-lg font-semibold">{summary.avg}</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-[11px] text-gray-500">Leader (appt)</div>
                  <div className="text-lg font-semibold">{leader}</div>
                </div>
              </div>

              <div className="mt-4 text-sm">
                <div className="text-[11px] text-gray-500 mb-1">Legenda % annullati</div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-3 h-3 rounded-full bg-emerald-600" />
                    <span className="text-sm">0–9% (buono)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-3 h-3 rounded-full bg-amber-500" />
                    <span className="text-sm">10–24% (attenzione)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-3 h-3 rounded-full bg-rose-500" />
                    <span className="text-sm">≥25% (critico)</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 text-[11px] text-gray-500">
                Le barre principali misurano il progresso **vs leader**; la barra azzurra indica il **progresso verso il target**.
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}


/* ────────────────────────────────────────────────────────────── */
/* Statistiche per giorno di inserimento (ultimi 30 giorni)       */
/* ────────────────────────────────────────────────────────────── */
function InsertionStatsCard({ rows }) {
  const last30Dates = React.useMemo(() => {
    const set = new Set(
      (rows || [])
        .map((r) => r.dataInserimento)
        .filter((d) => d && /^\d{4}-\d{2}-\d{2}$/.test(d))
        .sort((a, b) => a.localeCompare(b))
    );
    const arr = Array.from(set);
    return arr.slice(-30);
  }, [rows]);

  const byDay = React.useMemo(() => {
    const map = new Map();
    for (const r of rows || []) {
      const d = r.dataInserimento;
      if (!d || !last30Dates.includes(d)) continue;
      map.set(d, (map.get(d) || 0) + 1);
    }
    return last30Dates.map((d) => ({
      label: d.split("-").reverse().join("/"),
      value: map.get(d) || 0,
    }));
  }, [rows, last30Dates]);

  const byOperatore = React.useMemo(() => {
    const map = new Map();
    for (const r of rows || []) {
      if (!r.dataInserimento || !last30Dates.includes(r.dataInserimento)) continue;
      const key = (r.operatore || "—").toLowerCase();
      map.set(key, (map.get(key) || 0) + 1);
    }
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [rows, last30Dates]);

  const byCliente = React.useMemo(() => {
    const map = new Map();
    for (const r of rows || []) {
      if (!r.dataInserimento || !last30Dates.includes(r.dataInserimento)) continue;
      const key = r.cliente || "—";
      map.set(key, (map.get(key) || 0) + 1);
    }
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [rows, last30Dates]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Statistiche per giorno di inserimento (ultimi 30 giorni presenti)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <BarChartCSS title="Totale per giorno (inserimento)" data={byDay} />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border rounded-xl p-3">
            <div className="text-sm font-medium mb-2">Per operatore</div>
            <div className="space-y-1 max-h-[260px] overflow-auto pr-2">
              {byOperatore.length === 0 ? (
                <div className="text-sm opacity-60">Nessun dato</div>
              ) : (
                byOperatore.map((x) => (
                  <div key={x.name} className="flex items-center justify-between text-sm">
                    <span className="truncate">{x.name}</span>
                    <span className="font-medium">{x.count}</span>
                  </div>
                ))
              )}
            </div>
          </div>
          <div className="border rounded-xl p-3">
            <div className="text-sm font-medium mb-2">Per cliente</div>
            <div className="space-y-1 max-h-[260px] overflow-auto pr-2">
              {byCliente.length === 0 ? (
                <div className="text-sm opacity-60">Nessun dato</div>
              ) : (
                byCliente.map((x) => (
                  <div key={x.name} className="flex items-center justify-between text-sm">
                    <span className="truncate">{x.name}</span>
                    <span className="font-medium">{x.count}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}


/* ────────────────────────────────────────────────────────────── */
/* Wrapper a scomparsa riutilizzabile                             */
/* ────────────────────────────────────────────────────────────── */
// ──────────────────────────────────────────────────────────────
function Collapsible({ title, storageKey, defaultOpen = false, children }) {
  // 1️⃣ parte sempre chiuso sul server/first paint per evitare hydration mismatch
  const [open, setOpen] = React.useState(false);
  const mountedRef = React.useRef(false);

  // 2️⃣ al mount, carico eventuale valore salvato o fallback a defaultOpen
  React.useEffect(() => {
    let initial = defaultOpen;
    try {
      if (storageKey) {
        const saved = localStorage.getItem(storageKey);
        if (saved !== null) initial = saved === "1";
      }
    } catch {}
    setOpen(initial);
    mountedRef.current = true;
  }, [storageKey, defaultOpen]);

  // 3️⃣ salva lo stato solo dopo il mount
  React.useEffect(() => {
    if (!mountedRef.current) return;
    try {
      if (storageKey) localStorage.setItem(storageKey, open ? "1" : "0");
    } catch {}
  }, [open, storageKey]);

  return (
    <div className="border rounded-xl overflow-hidden bg-white">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50"
      >
        <span className="font-medium">{title}</span>
        <span
          className={`transition-transform duration-200 ${open ? "rotate-90" : ""}`}
          aria-hidden="true"
        >
          ▸
        </span>
      </button>

      <div
        className={`transition-[grid-template-rows] duration-200 grid ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <div className="p-4">{children}</div>
        </div>
      </div>
    </div>
  );
}



/* ────────────────────────────────────────────────────────────── */
/* Leaderboard Operatori (mese corrente)                          */
/* ────────────────────────────────────────────────────────────── */
function OperatorLeaderboardCard({ rows, target = 15 }) {
  // helper
  const monthKey = (d) => d?.slice(0, 7); // "YYYY-MM"
  const pad = (n) => String(n).padStart(2, "0");

  // mese corrente in locale
  const now = new Date();
  const currentYM = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;

  // filtra per mese corrente su dataInserimento
  const rowsThisMonth = React.useMemo(
    () => rows.filter(r => r.dataInserimento && monthKey(r.dataInserimento) === currentYM),
    [rows, currentYM]
  );

  // aggrega per operatore (case-insensitive)
  const byOp = React.useMemo(() => {
    const map = new Map();
    for (const r of rowsThisMonth) {
      const key = (r.operatore || "—").toLowerCase();
      map.set(key, (map.get(key) || 0) + 1);
    }
    const arr = Array.from(map.entries())
      .map(([op, count]) => ({ op, count }))
      .sort((a, b) => b.count - a.count || a.op.localeCompare(b.op));
    return arr;
  }, [rowsThisMonth]);

  const leader = byOp[0]?.count || 0;
  const monthLabel = `${pad(now.getMonth() + 1)}/${String(now.getFullYear()).slice(2)}`;

  // frasette simpatiche
  const funBadge = (rank, count) => {
    if (rank === 1 && count >= target) return "🔥 Obiettivo centrato!";
    if (rank === 1) return "👑 In vetta!";
    if (count === 0) return "🌱 Si riparte!";
    if (leader - count <= 2) return "🏃 In rimonta!";
    return "💪 Avanti così!";
    };

  // progress %
  const pct = (num, den) => (den > 0 ? Math.min(100, Math.round((num / den) * 100)) : 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>🏆 Classifica operatori – {monthLabel}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {byOp.length === 0 ? (
          <div className="text-sm text-gray-500">Nessun inserimento questo mese.</div>
        ) : (
          <div className="space-y-3">
            {byOp.slice(0, 8).map((row, i) => {
              const rank = i + 1;
              const towardsLeader = pct(row.count, Math.max(1, leader));
              const towardsTarget = pct(row.count, target);
              const gapLeader = Math.max(0, leader - row.count);
              const gapTarget = Math.max(0, target - row.count);

              const medal =
                rank === 1 ? "🥇" :
                rank === 2 ? "🥈" :
                rank === 3 ? "🥉" : `${rank}.`;

              // nome “pulito” con prima lettera maiuscola
              const displayName = row.op
                .split(" ")
                .map(s => s ? s[0].toUpperCase() + s.slice(1) : s)
                .join(" ");

              return (
                <div key={row.op} className="rounded-xl border p-3 bg-white">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="text-xl w-8 text-center">{medal}</div>
                      <div>
                        <div className="font-medium">
                          {displayName} {rank === 1 && <span className="ml-1">👑</span>}
                        </div>
                        <div className="text-xs text-gray-500">
                          {funBadge(rank, row.count)}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-semibold">{row.count}</div>
                      <div className="text-xs text-gray-500">apppuntamenti</div>
                    </div>
                  </div>

                  {/* Progresso verso il primo */}
                  <div className="mt-3">
                    <div className="flex justify-between text-[11px] text-gray-500">
                      <span>Progress vs leader</span>
                      <span>{towardsLeader}% {gapLeader ? `• manca ${gapLeader}` : "• pari!"}</span>
                    </div>
                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div className="h-full bg-gray-800" style={{ width: `${towardsLeader}%` }} />
                    </div>
                  </div>

                  {/* Progresso verso obiettivo */}
                  <div className="mt-2">
                    <div className="flex justify-between text-[11px] text-gray-500">
                      <span>Obiettivo mese ({target})</span>
                      <span>{towardsTarget}% {gapTarget ? `• ${gapTarget} al target` : "• target OK!"}</span>
                    </div>
                    <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div className="h-full bg-green-500" style={{ width: `${towardsTarget}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CancellationStatsCard({
  stats,
  byClient,
  annMonth: annMonthProp,
  setAnnMonth: setAnnMonthProp,
  annYear: annYearProp,
  setAnnYear: setAnnYearProp,
  detailRows,
}) {
  // Stato di fallback: se il padre non passa i valori, usiamo questi
  const [annMonthState, setAnnMonthState] = useState(new Date().getMonth() + 1);
  const [annYearState, setAnnYearState] = useState(new Date().getFullYear());

  // Usa i valori del padre se presenti, altrimenti quelli interni
  const annMonth = annMonthProp ?? annMonthState;
  const annYear = annYearProp ?? annYearState;
  const setAnnMonth = setAnnMonthProp ?? setAnnMonthState;
  const setAnnYear = setAnnYearProp ?? setAnnYearState;

  // Selettori mese/anno
  const months = [
    { v: 1, l: "Gen" }, { v: 2, l: "Feb" }, { v: 3, l: "Mar" }, { v: 4, l: "Apr" },
    { v: 5, l: "Mag" }, { v: 6, l: "Giu" }, { v: 7, l: "Lug" }, { v: 8, l: "Ago" },
    { v: 9, l: "Set" }, { v: 10, l: "Ott" }, { v: 11, l: "Nov" }, { v: 12, l: "Dic" },
  ];
  const years = (() => {
    const y0 = new Date().getFullYear() - 3;
    return Array.from({ length: 7 }, (_, i) => y0 + i);
  })();

  // Utility formattazione date per export
  function fmtDate(d) {
    if (!d) return "";
    const dd = d instanceof Date ? d : new Date(d);
    if (Number.isNaN(dd.getTime())) return "";
    const y = dd.getFullYear();
    const m = String(dd.getMonth() + 1).padStart(2, "0");
    const day = String(dd.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

function exportExcel() {
  // ---- Foglio 1: RIEPILOGO per OPERATORE
  const summaryAOA = [["Operatore","Inseriti mese","Annullati mese","% annulli mese"]];
  for (const r of stats) {
    summaryAOA.push([
      r.operatore,
      r.inseritiMese,
      r.annullatiMese,
      r.percAnnulli == null ? "" : (r.percAnnulli * 100).toFixed(1) + "%"
    ]);
  }
  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.aoa_to_sheet(summaryAOA);
  XLSX.utils.book_append_sheet(wb, ws1, "Riepilogo Annulli");

  // ---- Foglio 2: DETTAGLIO per OPERATORE
  const header = [
    "ID","Operatore","Data Inserimento","Data Appuntamento",
    "Azienda","Luogo","Cliente","Agente","Tipo","Stato",
    "Data Annullamento","Referente","Email","Telefono",
    "Indirizzo","Provincia","ID Contaq","Note"
  ];
  const detailAOA = [header];
  const byOp = new Map();
  for (const r of detailRows) {
    const op = r.operatore || "—";
    if (!byOp.has(op)) byOp.set(op, []);
    byOp.get(op).push(r);
  }
  const ops = Array.from(byOp.keys()).sort((a,b) => a.localeCompare(b, "it", { sensitivity:"base" }));
  ops.forEach((op, idx) => {
    if (idx > 0) detailAOA.push([]);
    detailAOA.push([`Operatore: ${op}`]);
    for (const r of byOp.get(op)) {
      detailAOA.push([
        r.id ?? "", r.operatore ?? "", fmtDate(r.dataInserimento), fmtDate(r.dataAppuntamento),
        r.azienda ?? "", r.città || r.luogo || "", r.cliente ?? "", r.agente ?? "", r.tipo ?? "",
        r.stato ?? "", fmtDate(r.dataAnnullamento), r.referente ?? "", r.email ?? "", r.telefono ?? "",
        r.indirizzo ?? "", r.provincia ?? "", r.idContaq ?? "", r.note ?? ""
      ]);
    }
  });
  const ws2 = XLSX.utils.aoa_to_sheet(detailAOA);
  XLSX.utils.book_append_sheet(wb, ws2, "Dettaglio Appuntamenti");

  // ---- Foglio 3: TOTALE PER CLIENTE
  const byClientAOA = [["Cliente","Inseriti mese","Annullati mese","Buoni mese"]];
  for (const r of byClient) {
    byClientAOA.push([r.cliente, r.inseritiMese, r.annullatiMese, r.buoniMese]);
  }
  const ws3 = XLSX.utils.aoa_to_sheet(byClientAOA);
  XLSX.utils.book_append_sheet(wb, ws3, "Totale per cliente");

  // ---- Foglio 4: DETTAGLIO per CLIENTE (Inseriti/Annullati del mese)
  const ymOf = (d) => {
    if (!d) return "";
    const dd = d instanceof Date ? d : new Date(d);
    if (Number.isNaN(dd.getTime())) return "";
    return `${dd.getFullYear()}-${String(dd.getMonth()+1).padStart(2,"0")}`;
  };
  const ym = `${annYear}-${String(annMonth).padStart(2,"0")}`;
  const tagNelMese = (r) => {
    const isIns = ymOf(r.dataInserimento) === ym;
    const isAnn = (r.stato || "").toLowerCase() === "annullato" && ymOf(r.dataAnnullamento) === ym;
    if (isAnn) return "Annullato";
    if (isIns) return "Inserito";
    return ""; // in teoria non dovrebbe capitare, ma teniamolo safe
  };

  const byCli = new Map();
  for (const r of detailRows) {
    const cli = r.cliente || "—";
    if (!byCli.has(cli)) byCli.set(cli, []);
    byCli.get(cli).push(r);
  }

  const detailByClientAOA = [[
    "Nel mese","ID","Cliente","Operatore","Data Inserimento","Data Appuntamento",
    "Azienda","Luogo","Agente","Tipo","Stato","Data Annullamento",
    "Referente","Email","Telefono","Indirizzo","Provincia","ID Contaq","Note"
  ]];

  const clients = Array.from(byCli.keys()).sort((a,b) => a.localeCompare(b, "it", { sensitivity:"base" }));
  clients.forEach((cli, idx) => {
    if (idx > 0) detailByClientAOA.push([]);
    detailByClientAOA.push([`Cliente: ${cli}`]);
    for (const r of byCli.get(cli)) {
      detailByClientAOA.push([
        tagNelMese(r),
        r.id ?? "",
        r.cliente ?? "",
        r.operatore ?? "",
        fmtDate(r.dataInserimento),
        fmtDate(r.dataAppuntamento),
        r.azienda ?? "",
        r.città || r.luogo || "",
        r.agente ?? "",
        r.tipo ?? "",
        r.stato ?? "",
        fmtDate(r.dataAnnullamento),
        r.referente ?? "",
        r.email ?? "",
        r.telefono ?? "",
        r.indirizzo ?? "",
        r.provincia ?? "",
        r.idContaq ?? "",
        r.note ?? "",
      ]);
    }
  });
  const ws4 = XLSX.utils.aoa_to_sheet(detailByClientAOA);
  XLSX.utils.book_append_sheet(wb, ws4, "Dettaglio per cliente");

  const fname = `annulli_${annYear}-${String(annMonth).padStart(2,"0")}.xlsx`;
  XLSX.writeFile(wb, fname);
}

  // ------------------- RENDER -------------------
  return (
    <Card>
      <div className="flex items-center gap-2">
        <Select value={String(annMonth)} onValueChange={(v) => setAnnMonth(Number(v))}>
          <SelectTrigger className="w-[110px]">
            <SelectValue placeholder="Mese" />
          </SelectTrigger>
          <SelectContent>
            {months.map((m) => (
              <SelectItem key={m.v} value={String(m.v)}>
                {m.l}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={String(annYear)} onValueChange={(v) => setAnnYear(Number(v))}>
          <SelectTrigger className="w-[110px]">
            <SelectValue placeholder="Anno" />
          </SelectTrigger>
          <SelectContent>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button variant="outline" onClick={exportExcel}>
          Export Excel (4 fogli)
        </Button>
      </div>

      <div className="px-4 pb-4">
        {/* Tabella per Operatore */}
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2 pr-3">Operatore</th>
                <th className="py-2 pr-3">Inseriti mese</th>
                <th className="py-2 pr-3">Annullati mese</th>
                <th className="py-2 pr-3">% annulli mese</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((r) => {
                const pct = r.percAnnulli == null ? "—" : (r.percAnnulli * 100).toFixed(1) + "%";
                const warn = r.percAnnulli != null && r.percAnnulli > 1;
                return (
                  <tr key={r.operatore} className="border-b last:border-0">
                    <td className="py-2 pr-3">{r.operatore}</td>
                    <td className="py-2 pr-3">{r.inseritiMese}</td>
                    <td className="py-2 pr-3">{r.annullatiMese}</td>
                    <td className={`py-2 pr-3 ${warn ? "text-red-600 font-medium" : ""}`}>{pct}</td>
                  </tr>
                );
              })}
              {stats.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-4 text-center text-muted-foreground">
                    Nessun dato per il mese selezionato
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Tabella per Cliente */}
        <div className="mt-6">
          <div className="text-sm font-medium mb-2">Totali per cliente (mese selezionato)</div>
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2 pr-3">Cliente</th>
                  <th className="py-2 pr-3">Inseriti mese</th>
                  <th className="py-2 pr-3">Annullati mese</th>
                  <th className="py-2 pr-3">Buoni mese</th>
                </tr>
              </thead>
              <tbody>
                {byClient.map((r) => (
                  <tr key={r.cliente} className="border-b last:border-0">
                    <td className="py-2 pr-3">{r.cliente}</td>
                    <td className="py-2 pr-3">{r.inseritiMese}</td>
                    <td className="py-2 pr-3">{r.annullatiMese}</td>
                    <td className="py-2 pr-3">{r.buoniMese}</td>
                  </tr>
                ))}
                {byClient.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-muted-foreground">
                      Nessun dato per il mese selezionato
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <p className="text-xs text-muted-foreground mt-2">
          La metrica è: annullati con <em>data annullamento</em> nel mese / inseriti con <em>data inserimento</em> nel mese.
          <br />
          Il dettaglio include tutti gli appuntamenti inseriti-nel-mese o annullati-nel-mese, raggruppati per operatore.
        </p>
      </div>
    </Card>
  );
}

    function TodayByClientCard({ data }) {
        const { rows, totals } = data;

        return (
            <Card>
                <div className="p-4 flex items-center justify-between">
                    <div className="font-semibold text-lg">Oggi per cliente</div>
                    <div className="text-sm text-muted-foreground">
                        Totale oggi: <span className="font-medium">{totals.totale}</span>
                    </div>
                </div>

                <div className="px-4 pb-4">
                    <div className="overflow-auto">
                        <table className="min-w-full text-sm">
                            <thead>
                                <tr className="text-left border-b">
                                    <th className="py-2 pr-3">Cliente</th>
                                    <th className="py-2 pr-3">Programm.</th>
                                    <th className="py-2 pr-3">Svolti</th>
                                    <th className="py-2 pr-3">Annullati</th>
                                    <th className="py-2 pr-3">Recuperati</th>
                                    <th className="py-2 pr-3">Totale</th>
                                </tr>
                            </thead>

                            <tbody>
                                {rows.map(r => (
                                    <tr key={r.cliente} className="border-b last:border-0">
                                        <td className="py-2 pr-3">{r.cliente}</td>
                                        <td className="py-2 pr-3">{r.programmati}</td>
                                        <td className="py-2 pr-3">{r.svolti}</td>
                                        <td className="py-2 pr-3">{r.annullati}</td>
                                        <td className="py-2 pr-3">{r.recuperati}</td>
                                        <td className="py-2 pr-3 font-medium">{r.totale}</td>
                                    </tr>
                                ))}

                                {rows.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="py-4 text-center text-muted-foreground">
                                            Nessun appuntamento per oggi
                                        </td>
                                    </tr>
                                )}
                            </tbody>

                            {rows.length > 0 && (
                                <tfoot>
                                    <tr className="border-t">
                                        <td className="py-2 pr-3 font-medium">Totale</td>
                                        <td className="py-2 pr-3">{totals.programmati}</td>
                                        <td className="py-2 pr-3">{totals.svolti}</td>
                                        <td className="py-2 pr-3">{totals.annullati}</td>
                                        <td className="py-2 pr-3">{totals.recuperati}</td>
                                        <td className="py-2 pr-3 font-semibold">{totals.totale}</td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>

                    <p className="text-xs text-muted-foreground mt-2">
                        Suddivisione per <em>cliente</em> degli appuntamenti con <em>data appuntamento</em> uguale ad oggi,
                        rispettando i filtri di contesto.
                    </p>
                </div>
            </Card>
        );
    }


function TciWeeklyCapacityCard({ rows, target = 4 }) {
  const tciWeekly = useMemo(() => {
    const base = rows ?? [];
    // cliente -> (mondayKey -> { count, label })
    const map = new Map();

    const norm = (s) => String(s || "").trim().toUpperCase();
    const mesi = [
      "gennaio","febbraio","marzo","aprile","maggio","giugno",
      "luglio","agosto","settembre","ottobre","novembre","dicembre"
    ];

    // Ritorna { key: 'YYYY-MM-DD' del lunedì, label: '3–7 novembre' }
    function weekInfoFromDate(d) {
      const dt = d instanceof Date ? d : new Date(d);
      if (Number.isNaN(dt.getTime())) return null;

      const day = dt.getDay() || 7;           // domenica=7
      const monday = new Date(dt);
      monday.setHours(0, 0, 0, 0);
      monday.setDate(dt.getDate() - (day - 1));

      const friday = new Date(monday);
      friday.setDate(monday.getDate() + 4);

      const key = monday.toISOString().slice(0, 10); // YYYY-MM-DD
      const label = `${monday.getDate()}–${friday.getDate()} ${mesi[friday.getMonth()]}`;
      return { key, label };
    }

    const TCI_CLIENTI = [
      "TCI PADOVA",
      "TCI BRESCIA 2",
      "TCI MILANO 4",
      "TCI MACERATA",
      "TCI CATANIA",
    ];

    // Conteggio appuntamenti per settimana (da data appuntamento)
    for (const r of base) {
      const cli = r?.cliente || "";
      if (!TCI_CLIENTI.includes(norm(cli))) continue;

      const wk = weekInfoFromDate(r?.data);
      if (!wk) continue;

      const keyClient = TCI_CLIENTI.find((x) => norm(x) === norm(cli)) || cli;
      if (!map.has(keyClient)) map.set(keyClient, new Map());

      const inner = map.get(keyClient);
      const prev = inner.get(wk.key) || { count: 0, label: wk.label };
      inner.set(wk.key, { count: prev.count + 1, label: wk.label });
    }

    // ✅ Forza la presenza della settimana corrente (anche se 0) per TUTTI i TCI
    const cur = weekInfoFromDate(new Date());
    for (const cli of TCI_CLIENTI) {
      if (!map.has(cli)) map.set(cli, new Map());
      const inner = map.get(cli);
      if (!inner.has(cur.key)) inner.set(cur.key, { count: 0, label: cur.label });
    }

    return map; // Map<string, Map<string, {count, label}>>
  }, [rows]);

  // Preparo righe UI ordinate per cliente + settimana (cronologica)
  const rowsUi = [];
  for (const [client, weeks] of tciWeekly.entries()) {
    const ordered = Array.from(weeks.entries()).sort((a, b) => a[0].localeCompare(b[0])); // sort su mondayKey
    for (const [, v] of ordered) {
      const count = v.count;
      const label = v.label;
      let cls = "text-amber-600";          // sotto target
      if (count === target) cls = "text-green-600";
      if (count > target) cls = "text-red-600 font-medium";
      rowsUi.push({ client, label, count, cls });
    }
  }

  return (
    <Card>
      <div className="p-4">
        <div className="font-semibold mb-2">Capacità settimanale TCI</div>
        <div className="text-sm text-muted-foreground mb-3">
          Target massimo per settimana: <span className="font-medium">{target}</span>
        </div>

        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2 pr-3">Cliente</th>
                <th className="py-2 pr-3">Settimana</th>
                <th className="py-2 pr-3">Appuntamenti</th>
              </tr>
            </thead>
            <tbody>
              {rowsUi.map((r, i) => {
                const prevClient = i > 0 ? rowsUi[i - 1].client : null;
                const newGroup = r.client !== prevClient; // nuovo cliente ⇒ divisorio

                return (
                  <React.Fragment key={`${r.client}-${r.label}`}>
                    {newGroup && (
                      <tr className="bg-gray-100">
                        <td colSpan={3} className="py-1 pl-2 font-semibold text-gray-700 border-t">
                          {r.client}
                        </td>
                      </tr>
                    )}

                    <tr className="border-b last:border-0">
                      {/* colonna cliente vuota nelle righe di dettaglio */}
                      <td className="py-2 pr-3"></td>
                      <td className="py-2 pr-3">{r.label}</td>
                      <td className={`py-2 pr-3 ${r.cls}`}>{r.count}</td>
                    </tr>
                  </React.Fragment>
                );
              })}

              {rowsUi.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-4 text-center text-muted-foreground">
                    Nessun appuntamento TCI nel periodo visibile.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-muted-foreground mt-2">
          Conteggio per <em>data appuntamento</em>, raggruppato per settimana (lun–ven).{" "}
          Colori: <span className="text-amber-600">giallo</span> &lt; target,{" "}
          <span className="text-green-600">verde</span> = target,{" "}
          <span className="text-red-600">rosso</span> &gt; target.
        </p>
      </div>
    </Card>
  );
}



/* ────────────────────────────────────────────────────────────── */
/* Componente principale                                          */
/* ────────────────────────────────────────────────────────────── */
export default function CofaceAppuntamentiDashboard() {
  const fileInputRef = useRef(null);
  const supabase = getSupabaseClient();

  const canInsert = true;
  const canUpdate = true;
  const canDelete = true;

  const editUnlockedRef = useRef(false);
  function ensureEditPassword() {
    if (editUnlockedRef.current) return true;
    const pwd = prompt("Modifica protetta.\nInserisci la password:");
    if (pwd === EDIT_PASSWORD) {
      editUnlockedRef.current = true;
      return true;
    }
    alert("Password errata.");
    return false;
  }

  /* dati dal DB */
  const [rows, setRows] = useState([]);
  /* filtri / ordinamento / UI */
  const [q, setQ] = useState("");
  const [agent, setAgent] = useState("tutti");
  const [creator, setCreator] = useState("tutti");
  const [client, setClient] = useState("tutti");
  const [status, setStatus] = useState("tutti");
  const [dayAppFrom, setDayAppFrom] = useState("");
  const [dayAppTo, setDayAppTo] = useState("");
  const [dayInsFrom, setDayInsFrom] = useState("");
  const [dayInsTo, setDayInsTo] = useState("");
  const [sortBy, setSortBy] = useState("inserimento");
  const [sortDir, setSortDir] = useState("asc");
  const [editing, setEditing] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [createOpen, setCreateOpen] = useState(false);
  const now = new Date();
  const [annMonth, setAnnMonth] = useState(now.getMonth() + 1); // 1..12
  const [annYear,  setAnnYear]  = useState(now.getFullYear());

  

  // Primo fetch (pubblico) + realtime
  useEffect(() => {
    let mounted = true;

    // 1) Primo fetch: TUTTO lo storico (nessun filtro)
    const refresh = async () => {
      try {
      const { data, error } = await supabase
        .from("appointments")
        .select("*")
        .order("dataInserimento", { ascending: false })   // più recenti prima
        .order("oraInserimento",  { ascending: false })   // più recenti prima
        .range(0, 1999);                                  // prendi fino a 2000 righe

        // DEBUG: rimuovi quando hai finito
        console.log(
          "FETCH rows:",
          data?.length,
          "esempi:",
          (data || []).slice(0, 5).map((r) => r.id)
        );

        if (!mounted) return;
        if (error != null && (error.message || error.code)) {
          console.error("Select error:", error);
          alert("Errore lettura appuntamenti: " + (error.message || error.code));
          return;
        }
        setRows((data ?? []).map(rowFromDb));
      } catch (e) {
        console.error("Select failed:", e);
        alert("Errore lettura appuntamenti: " + (e?.message || e));
      }
    };

    refresh();

    // 2) Realtime: applica SOLO il delta (niente refetch globale)
    const ch = supabase
      .channel("rt:appointments")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "appointments" },
        (payload) => {
          setRows((prev) => {
            if (payload.eventType === "INSERT") {
              const r = rowFromDb(payload.new);
              return prev.some((x) => x.id === r.id) ? prev : [r, ...prev];
            }
            if (payload.eventType === "UPDATE") {
              const r = rowFromDb(payload.new);
              const exists = prev.some((x) => x.id === r.id);
              return exists ? prev.map((x) => (x.id === r.id ? r : x)) : [r, ...prev];
            }
            if (payload.eventType === "DELETE") {
              const id = payload.old?.id;
              return prev.filter((x) => x.id !== id);
            }
            return prev;
          });
        }
      )
      .subscribe();

    // 3) (facoltativo) piccolo refresh quando torni sulla tab
    const onVis = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      mounted = false;
      try { supabase.removeChannel(ch); } catch {}
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  /* ✅ AUTO: imposta "svolto" dopo 3 giorni dalla data appuntamento (se non già svolto/annullato) */
  const autoRunRef = useRef(false);
  useEffect(() => {
    if (autoRunRef.current) return;
    if (!rows || rows.length === 0) return;

    const now = new Date();
    const toAuto = rows.filter((r) => {
      if (!r?.data) return false;
      if (r.stato === "svolto" || r.stato === "annullato") return false;
      const ts = tsFrom(r.data, r.ora || "00:00");
      if (Number.isNaN(ts)) return false;
      const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;
      return now.getTime() - ts >= THREE_DAYS;
    });

    if (toAuto.length === 0) return;

    (async () => {
      for (const r of toAuto) {
        // bypass password: regola automatica di sistema
        await _updateRow(r.id, { stato: "svolto" });
      }
    })();

    autoRunRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  /* liste dinamiche */
const agents = useMemo(() => {
  const uniqLower = Array.from(
    new Set(
      rows
        .map((r) => (r.agente || "").toLowerCase().replace(/\s+/g, " ").trim())
        .filter(Boolean)
    )
  );
  const display = uniqLower.map(titleCase);
  return ["tutti", ...display.sort((a, b) => a.localeCompare(b))];
}, [rows]);

  const creators = useMemo(
    () => ["tutti", ...Array.from(new Set(rows.map((r) => r.operatore).filter(Boolean).map(s => s.toLowerCase()))).sort((a, b) => a.localeCompare(b))],
    [rows]
  );
  const clients = useMemo(
    () => ["tutti", ...Array.from(new Set([...CLIENTI_CANONICI, ...rows.map((r) => r.cliente).filter(Boolean)]))],
    [rows]
  );

  /* filtra + ordina */
  const filtered = useMemo(() => {
    let out = rows;
    if (agent !== "tutti") out = out.filter((r) => r.agente === agent);
    if (creator !== "tutti") out = out.filter((r) => r.operatore?.toLowerCase() === creator);
    if (client !== "tutti") out = out.filter((r) => r.cliente === client);
    if (status !== "tutti") out = out.filter((r) => r.stato === status);
    if (dayAppFrom) out = out.filter((r) => r.data >= dayAppFrom);
    if (dayAppTo) out = out.filter((r) => r.data <= dayAppTo);
    if (dayInsFrom) out = out.filter((r) => r.dataInserimento >= dayInsFrom);
    if (dayInsTo) out = out.filter((r) => r.dataInserimento <= dayInsTo);
    
    if (q.trim()) {
      const n = q.trim().toLowerCase();
      out = out.filter((r) =>
        [
          r.azienda, r.referente, r.email, r.telefono, r.piva, r.città, r.indirizzo,
          r.provincia, r.agente, r.operatore, r.cliente, r.idContaq, r.note,
        ]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(n))
      );
    }
    return out.sort((a, b) => {
      const aKey = sortBy === "inserimento" ? tsFrom(a.dataInserimento, a.oraInserimento) : tsFrom(a.data, a.ora);
      const bKey = sortBy === "inserimento" ? tsFrom(b.dataInserimento, b.oraInserimento) : tsFrom(b.data, b.ora);
      const aNa = Number.isNaN(aKey), bNa = Number.isNaN(bKey);
      if (aNa && bNa) return 0;
      if (aNa) return sortDir === "asc" ? 1 : -1;
      if (bNa) return sortDir === "asc" ? -1 : 1;
      return sortDir === "asc" ? aKey - bKey : bKey - aKey;
    });
  }, [rows, agent, creator, client, status, dayAppFrom, dayAppTo, dayInsFrom, dayInsTo, q, sortBy, sortDir]);

  {/* ───────────────── Leaderboard operatori del mese ───────────────── */}
  <div className="mt-4">
    <OperatorLeaderboardCard rows={rows} target={15} />
  </div>
  
const cancellationStats = useMemo(() => {
  // Helper: anno-mese di una data (supporta Date o stringa ISO)
  function ymOf(d) {
    if (!d) return null;
    const dt = d instanceof Date ? d : new Date(d);
    if (Number.isNaN(dt.getTime())) return null;
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
  }

  const ym = `${annYear}-${String(annMonth).padStart(2, "0")}`;

  // Base coerente con i filtri di contesto (agente/operatore/cliente + ricerca libera)
  let base = rows;
  if (agent !== "tutti")   base = base.filter(r => r.agente === agent);
  if (creator !== "tutti") base = base.filter(r => (r.operatore || "").toLowerCase() === creator);
  if (client !== "tutti")  base = base.filter(r => r.cliente === client);
  if (q?.trim()) {
    const n = q.trim().toLowerCase();
    base = base.filter((r) =>
      [
        r.azienda, r.referente, r.email, r.telefono, r.piva, r.città, r.indirizzo,
        r.provincia, r.agente, r.operatore, r.cliente, r.idContaq, r.note,
      ]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(n))
    );
  }

  const insMap = new Map(); // inseriti nel mese (denominatore)
  const annMap = new Map(); // annullati "arrivati" nel mese (numeratore)

  for (const r of base) {
    const op = (r.operatore || "—").toLowerCase();

    // Denominatore: data inserimento nel mese
    if (ymOf(r.dataInserimento) === ym) {
      insMap.set(op, (insMap.get(op) || 0) + 1);
    }

    // Numeratore: stato annullato con data annullamento nel mese
    if ((r.stato || "").toLowerCase() === "annullato" && ymOf(r.dataAnnullamento) === ym) {
      annMap.set(op, (annMap.get(op) || 0) + 1);
    }
  }

  const ops = new Set([...insMap.keys(), ...annMap.keys()]);
  const out = [];
  for (const op of ops) {
    const inseritiMese  = insMap.get(op) || 0;
    const annullatiMese = annMap.get(op) || 0;
    const percAnnulli   = inseritiMese > 0 ? (annullatiMese / inseritiMese) : null; // null = N/D
    out.push({ operatore: op, inseritiMese, annullatiMese, percAnnulli });
  }

  out.sort((a, b) => (b.percAnnulli ?? -1) - (a.percAnnulli ?? -1));
  return out;
}, [rows, agent, creator, client, q, annMonth, annYear]);

const cancellationByClient = useMemo(() => {
  function ymOf(d) {
    if (!d) return null;
    const dt = d instanceof Date ? d : new Date(d);
    if (Number.isNaN(dt.getTime())) return null;
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
  }
  const ym = `${annYear}-${String(annMonth).padStart(2, "0")}`;

  // stessa base dei filtri già usata per cancellationStats
  let base = rows;
  if (agent !== "tutti")   base = base.filter(r => r.agente === agent);
  if (creator !== "tutti") base = base.filter(r => (r.operatore || "").toLowerCase() === creator);
  if (client !== "tutti")  base = base.filter(r => r.cliente === client);
  if (q?.trim()) {
    const n = q.trim().toLowerCase();
    base = base.filter((r) =>
      [
        r.azienda, r.referente, r.email, r.telefono, r.piva, r.città, r.indirizzo,
        r.provincia, r.agente, r.operatore, r.cliente, r.idContaq, r.note,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(n))
    );
  }

  const insMap = new Map(); // inseriti nel mese
  const annMap = new Map(); // annullati con data annullamento nel mese

  for (const r of base) {
    const cli = r.cliente || "—";
    if (ymOf(r.dataInserimento) === ym) {
      insMap.set(cli, (insMap.get(cli) || 0) + 1);
    }
    if ((r.stato || "").toLowerCase() === "annullato" && ymOf(r.dataAnnullamento) === ym) {
      annMap.set(cli, (annMap.get(cli) || 0) + 1);
    }
  }

  const clients = new Set([...insMap.keys(), ...annMap.keys()]);
  const out = [];
  for (const cli of clients) {
    const inseritiMese  = insMap.get(cli) || 0;
    const annullatiMese = annMap.get(cli) || 0;
    const buoniMese     = Math.max(0, inseritiMese - annullatiMese);
    out.push({ cliente: cli, inseritiMese, annullatiMese, buoniMese });
  }

  out.sort((a, b) => (b.buoniMese - a.buoniMese) || a.cliente.localeCompare(b.cliente, "it", { sensitivity: "base" }));
  return out;
}, [rows, agent, creator, client, q, annMonth, annYear]);

const cancellationDetailRows = useMemo(() => {
  function ymOf(d) {
    if (!d) return null;
    const dt = d instanceof Date ? d : new Date(d);
    if (Number.isNaN(dt.getTime())) return null;
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
  }
  const ym = `${annYear}-${String(annMonth).padStart(2, "0")}`;

  // Base coerente con i filtri di contesto (agente/operatore/cliente + ricerca libera),
  // ignorando volutamente filtri di stato/data: l'intervallo è il mese selezionato.
  let base = rows;
  if (agent !== "tutti")   base = base.filter(r => r.agente === agent);
  if (creator !== "tutti") base = base.filter(r => (r.operatore || "").toLowerCase() === creator);
  if (client !== "tutti")  base = base.filter(r => r.cliente === client);
  if (q?.trim()) {
    const n = q.trim().toLowerCase();
    base = base.filter((r) =>
      [
        r.azienda, r.referente, r.email, r.telefono, r.piva, r.città, r.indirizzo,
        r.provincia, r.agente, r.operatore, r.cliente, r.idContaq, r.note,
      ]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(n))
    );
  }

  // Dettaglio del MESE: prendiamo tutti gli app.
  // (1) inseriti nel mese  OR  (2) annullati nel mese
  const detail = base.filter(r => {
    const inseritoYM = ymOf(r.dataInserimento) === ym;
    const annYM = (r.stato || "").toLowerCase() === "annullato" && ymOf(r.dataAnnullamento) === ym;
    return inseritoYM || annYM;
  });

  // Ordine: Operatore asc, poi Data Inserimento asc, poi ID
  detail.sort((a, b) => {
    const oa = (a.operatore || "—").localeCompare(b.operatore || "—", "it", { sensitivity: "base" });
    if (oa !== 0) return oa;
    const da = new Date(a.dataInserimento || 0).getTime();
    const db = new Date(b.dataInserimento || 0).getTime();
    if (da !== db) return da - db;
    return String(a.id || "").localeCompare(String(b.id || ""));
  });

  return detail;
}, [rows, agent, creator, client, q, annMonth, annYear]);

const todayByClient = useMemo(() => {
  // oggi (in locale) — confrontiamo solo Y-M-D
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth();
  const d = today.getDate();

  function isToday(dateLike) {
    if (!dateLike) return false;
    const dt = dateLike instanceof Date ? dateLike : new Date(dateLike);
    return (
      dt.getFullYear() === y &&
      dt.getMonth() === m &&
      dt.getDate() === d
    );
  }

  // Base coerente con i filtri di contesto
  let base = rows;
  if (agent !== "tutti")   base = base.filter(r => r.agente === agent);
  if (creator !== "tutti") base = base.filter(r => (r.operatore || "").toLowerCase() === creator);
  if (client !== "tutti")  base = base.filter(r => r.cliente === client);
  if (q?.trim()) {
    const n = q.trim().toLowerCase();
    base = base.filter((r) =>
      [
        r.azienda, r.referente, r.email, r.telefono, r.piva, r.città, r.indirizzo,
        r.provincia, r.agente, r.operatore, r.cliente, r.idContaq, r.note,
      ]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(n))
    );
  }

  // 🔴 QUI il cambio: consideriamo SOLO gli appuntamenti INSERITI OGGI
  const todayRows = base.filter(r => isToday(r.dataInserimento));

  // Raggruppo per cliente e conteggi stato
  const map = new Map();
  for (const r of todayRows) {
    const cli = r.cliente || "—";
    if (!map.has(cli)) map.set(cli, { cliente: cli, programmati: 0, svolti: 0, annullati: 0, recuperati: 0, totale: 0 });
    const g = map.get(cli);
    const stato = (r.stato || "").toLowerCase();
    if (stato === "svolto") g.svolti += 1;
    else if (stato === "annullato") g.annullati += 1;
    else if (stato === "recuperato") g.recuperati += 1;
    else g.programmati += 1;
    g.totale += 1;
  }

  const out = Array.from(map.values());
  out.sort((a, b) => b.totale - a.totale || a.cliente.localeCompare(b.cliente, "it", { sensitivity: "base" }));

  const totals = out.reduce((acc, r) => {
    acc.programmati += r.programmati;
    acc.svolti += r.svolti;
    acc.annullati += r.annullati;
    acc.recuperati += r.recuperati;
    acc.totale += r.totale;
    return acc;
  }, { programmati: 0, svolti: 0, annullati: 0, recuperati: 0, totale: 0 });

  return { rows: out, totals };
}, [rows, agent, creator, client, q]);


  
  /* paginazione */
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);
  useEffect(() => { if (page > totalPages) setPage(1); }, [totalPages, page]);

  /* KPI */
  const kpis = useMemo(() => {
    const base = { programmato: 0, svolto: 0, annullato: 0, recuperato: 0 };
    for (const r of filtered) base[r.stato] = (base[r.stato] || 0) + 1;
    const fatturabili = filtered.filter((r) => r.stato === "svolto").length;
    const fatturati = filtered.filter((r) => r.fatturato).length;
    return { ...base, fatturabili, fatturati, totale: filtered.length };
  }, [filtered]);

  /* CRUD (DB) */
  function addEmptyRow() {
    setCreateOpen(true);
  }


  
  // --- CREA NUOVO APPUNTAMENTO (con ritorno dal DB + dedup) ---
  async function handleCreate(form) {
    try {
      if (!form?.piva || String(form.piva).trim().length < 3) {
        alert("La P.iva è obbligatoria.");
        return false;
      }

      // normalizza tipo per il DB ('sede' | 'videocall' | null)
      const normalizeTipo = (v) => {
        const key = String(v ?? "")
          .normalize("NFKC")
          .replace(/\u00A0/g, " ")
          .replace(/_/g, " ")
          .trim()
          .replace(/\s+/g, " ")
          .toLowerCase();
        if (key === "sede" || key === "in sede") return "sede";
        if (key === "videocall" || key === "video call" || key === "video-call") return "videocall";
        return null;
      };
      const tipoNorm = normalizeTipo(form?.tipo_appuntamento);

      // riga lato UI (coerente con il resto dell'app)
      const jsRow = {
        id: generateId(),
        dataInserimento: todayISO(),
        oraInserimento: nowHM(),
        ...form,
        piva: String(form.piva).trim(),
        città: form["città"] ?? form.citta ?? "",
        stato: form.stato || "programmato",
        fatturato: !!form.fatturato,
        tipo_appuntamento: tipoNorm,
      };

      // mapping verso i nomi di colonna del DB
      const payload = rowToDb(jsRow);

      // 👉 chiediamo a Supabase di ritornare la riga inserita
      const { data, error } = await supabase
        .from("appointments")
        .insert(payload)
        .select("*")
        .single();

      if (error) {
        console.error("Insert error:", error);
        alert("Errore durante la creazione: " + (error.message || "insert failed"));
        return false;
      }

      // usiamo la riga del DB (garantisce coerenza totale)
      const serverRow = rowFromDb(data);

      setRows((prev) =>
        prev.some((x) => x.id === serverRow.id) ? prev : [serverRow, ...prev]
      );

      return true;
    } catch (e) {
      console.error("Create error", e?.message || e);
      alert("Errore durante la creazione");
      return false;
    }
  }


  async function _updateRow(id, patch) {
    const dbPatch = patchToDb(patch);
    const { data, error } = await supabase
      .from("appointments")
      .update(dbPatch)
      .eq("id", id)
      .select("id");

    if (error) {
      alert(`Errore salvataggio: ${error.message}`);
      return false;
    }
    if (!data || data.length === 0) {
      alert("Permesso negato (RLS)");
      return false;
    }

    // aggiorna lo stato locale solo con le chiavi toccate
    setRows((p) => p.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    return true;
  }


  async function updateRowSecure(id, patch) {
    if (!ensureEditPassword()) return false;
    return _updateRow(id, patch);
  }
  
   async function updateConfirmed(r) {
    const patch = { confermato: !r.confermato };
    const { data, error } = await supabase
      .from("appointments")
      .update(patch)
      .eq("id", r.id)
      .select("id");
    if (error) {
      alert(`Errore aggiornamento: ${error.message}`);
      return false;
    }
    if (!data || data.length === 0) {
      alert("Permesso negato (RLS)");
      return false;
    }
    setRows((p) => p.map((row) => (row.id === r.id ? { ...row, ...patch } : row)));
    return true;
  }

  async function removeRow(id) {
    if (!ensureEditPassword()) return false;
    const { data, error } = await supabase
      .from("appointments")
      .delete()
      .eq("id", id)
      .select("id");
    if (error) {
      alert(`Errore eliminazione: ${error.message}`);
      return false;
    }
    if (!data || data.length === 0) {
      alert("Permesso negato (RLS)");
      return false;
    }
    setRows((p) => p.filter((r) => r.id !== id));
    return true;
  }

  function markSvolto(r) { 
  return updateRowSecure(r.id, { stato: "svolto", dataAnnullamento: null }); 
}
function markAnnullato(r) { 
  return updateRowSecure(r.id, { stato: "annullato", dataAnnullamento: todayISO() }); 
}
function markRecupero(r) { 
  return updateRowSecure(r.id, { stato: "recuperato", dataAnnullamento: null }); 
}
  function markFatturato(r) { return updateRowSecure(r.id, { fatturato: true, dataFatturazione: todayISO() }); }
  function unmarkFatturato(r) { return updateRowSecure(r.id, { fatturato: false, dataFatturazione: "" }); }

  async function clearAll() {
    const pwd = prompt(
      "ATTENZIONE: eliminerai TUTTI gli appuntamenti.\nInserisci la password per confermare:"
    );
    if (pwd !== CLEAR_ALL_PASSWORD) return alert("Password errata. Operazione annullata.");
    if (!confirm("Confermi l'eliminazione definitiva?")) return;
    const { error } = await supabase.from("appointments").delete().neq("id", "");
    if (error) {
      alert(`Errore eliminazione: ${error.message}`);
      return;
    }
    setRows([]);
  }

  function downloadTemplate() {
    const wb = XLSX.utils.book_new();
    const sample = [{
      ID: generateId(),
      "ID Contaq": "",
      "Data Inserimento": todayISO(),
      "Ora Inserimento": nowHM(),
      "Data Appuntamento": todayISO(),
      "Ora Appuntamento": "09:00",
      Azienda: "ACME S.p.A.",
      Referente: "Mario Rossi",
      Telefono: "021234567",
      Email: "mario@example.com",
      "Città": "Milano",
      Provincia: "MI",
      Agente: "Bianchi",
      Operatore: "Operatore1",
      Cliente: "Coface",
      Stato: "programmato",
      "Data Annullamento": "",
      Note: "",
      Fatturabile: "No",
      Fatturato: "No",
      "Data Fatturazione": "",
    }];
    const ws = XLSX.utils.json_to_sheet(sample, { header: DEFAULT_HEADERS });
    XLSX.utils.book_append_sheet(wb, ws, "Appuntamenti");
    XLSX.writeFile(wb, "template_appuntamenti.xlsx");
  }

  function importExcel(file) {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(ws, { defval: "" });
      const mapped = json.map((r) => {
        let statoRaw = String(r["Stato"] || "").toLowerCase().trim().replace(/\s+/g, "_");
        if (statoRaw === "da_recuperare") statoRaw = "recuperato";
        const allowed = ["programmato", "svolto", "annullato", "recuperato"];
        const stato = allowed.includes(statoRaw) ? statoRaw : "programmato";

        const fatturatoRaw = String(r["Fatturato"] || "").toLowerCase().trim();
        const fatturato = ["si", "sì", "true", "1", "x", "yes"].includes(fatturatoRaw);

        const obj = {
          id: r["ID"] || generateId(),
          idContaq: r["ID Contaq"] || "",
          dataInserimento: parseExcelDate(r["Data Inserimento"]) || todayISO(),
          oraInserimento: parseExcelTime(r["Ora Inserimento"]) || nowHM(),
          data: parseExcelDate(r["Data Appuntamento"]) || null,
          ora: parseExcelTime(r["Ora Appuntamento"]) || "",
          azienda: r["Azienda"] || "",
          piva: String(r["P.iva"] || "").trim(),
          referente: r["Referente"] || "",
          telefono: r["Telefono"] || "",
          email: r["Email"] || "",
          città: r["Città"] || "",
          provincia: r["Provincia"] || "",
          agente: r["Agente"] || "",
          operatore: r["Operatore"] || "",
          cliente: r["Cliente"] || "",
          stato,
          dataAnnullamento: parseExcelDate(r["Data Annullamento"]) || null,
          note: r["Note"] || "",
          fatturato,
          dataFatturazione: parseExcelDate(r["Data Fatturazione"]) || null,
        };
        return rowToDb(obj);
      });

      await supabase.from("appointments").upsert(mapped, { onConflict: "id" });
      const { data: data2 } = await supabase.from("appointments").select("*");
      setRows((data2 || []).map(rowFromDb));
    };
    reader.readAsArrayBuffer(file);
  }

  function exportExcel(currentOnly = false) {
    const data = (currentOnly ? filtered : rows).map((r) => ({
      ID: r.id,
      "ID Contaq": r.idContaq || "",
      "Data Inserimento": r.dataInserimento || "",
      "Ora Inserimento": r.oraInserimento || "",
      "Data Appuntamento": r.data || "",
      "Ora Appuntamento": r.ora || "",
      Azienda: r.azienda || "",
      "P.iva": r.piva || "",
      Referente: r.referente || "",
      Telefono: r.telefono || "",
      Email: r.email || "",
      "Città": r.città || "",
      Provincia: r.provincia || "",
      Agente: r.agente || "",
      Operatore: r.operatore || "",
      Cliente: r.cliente || "",
      Stato: r.stato || "",
      "Data Annullamento": r.dataAnnullamento || "",
      Note: r.note || "",
      Fatturabile: r.stato === "svolto" ? "Sì" : "No",
      Fatturato: r.fatturato ? "Sì" : "No",
      "Data Fatturazione": r.dataFatturazione || "",
    }));
    const ws = XLSX.utils.json_to_sheet(data, { header: DEFAULT_HEADERS });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Appuntamenti");
    XLSX.writeFile(wb, `export_appuntamenti_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  function exportCSVFatturazione() {
    const header = [
      "ID","ID Contaq","Data Inserimento","Ora Inserimento","Data Appuntamento",
      "Ora Appuntamento","Azienda","Referente","Agente","Operatore","Cliente",
      "Provincia","Fatturabile",
    ].join(",");
    const lines = filtered
      .filter((r) => r.stato === "svolto" && !r.fatturato)
      .map((r) =>
        [
          r.id, r.idContaq || "", r.dataInserimento || "", r.oraInserimento || "",
          r.data || "", r.ora || "", r.azienda || "", r.referente || "",
          r.agente || "", r.operatore || "", r.cliente || "", r.provincia || "", "Sì",
        ].map(csvSafe).join(",")
      );
    const blob = new Blob([header + "\n" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fatturazione_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportExcelFatturazione() {
    const data = filtered
      .filter((r) => r.stato === "svolto" && !r.fatturato)
      .map((r) => ({
        ID: r.id,
        "ID Contaq": r.idContaq || "",
        "Data Inserimento": r.dataInserimento || "",
        "Ora Inserimento": r.oraInserimento || "",
        "Data Appuntamento": r.data || "",
        "Ora Appuntamento": r.ora || "",
        Azienda: r.azienda || "",
        Referente: r.referente || "",
        Agente: r.agente || "",
        Operatore: r.operatore || "",
        Cliente: r.cliente || "",
        Provincia: r.provincia || "",
        Fatturabile: "Sì",
      }));
    const ws = XLSX.utils.json_to_sheet(data, {
      header: [
        "ID","ID Contaq","Data Inserimento","Ora Inserimento","Data Appuntamento",
        "Ora Appuntamento","Azienda","Referente","Agente","Operatore","Cliente",
        "Provincia","Fatturabile",
      ],
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Fatturazione");
    XLSX.writeFile(wb, `fatturazione_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  /* UI helpers */
  function KPI() {
    const chip = (label, value) => (
      <div className="rounded-2xl border px-4 py-2 text-sm bg-white shadow-sm">
        <span className="opacity-60 mr-2">{label}</span>
        <span className="font-semibold">{value}</span>
      </div>
    );
    return (
      <div className="flex flex-wrap gap-3">
        {chip("Totale", kpis.totale)}
        {chip("Programmato", kpis.programmato)}
        {chip("Svolto", kpis.svolto)}
        {chip("Annullato", kpis.annullato)}
        {chip("Recuperato", kpis.recuperato)}
        {chip("Fatturabili", kpis.fatturabili)}
        {chip("Fatturati", kpis.fatturati)}
      </div>
    );
  }

  function Row({ r }) {
    const statusBadge = {
      programmato: "bg-blue-50 text-blue-700 border-blue-200",
      svolto: "bg-green-50 text-green-700 border-green-200",
      annullato: "bg-red-50 text-red-700 border-red-200",
      recuperato: "bg-amber-50 text-amber-700 border-amber-200",
    }[r.stato] || "";

    const tipoLabel =
      r.tipo_appuntamento === "sede" ? "In sede" :
      r.tipo_appuntamento === "videocall" ? "Videocall" :
      "—";

    return (
      <tr className="border-b hover:bg-gray-50">
        <td className="p-2 font-mono text-xs opacity-60">
          <div>{r.id}</div>
          {r.confermato && <div className="text-[11px] text-green-600 font-semibold">Confermato</div>}
        </td>
        <td className="p-2">{r.operatore || <span className="opacity-50">—</span>}</td>
        <td className="p-2 whitespace-nowrap">
          {fmtDate(r.dataInserimento)}
          <div className="text-xs opacity-60">{r.oraInserimento}</div>
        </td>
        <td className="p-2 whitespace-nowrap">
          {fmtDate(r.data)}
          <div className="text-xs opacity-60">{r.ora}</div>
        </td>
        <td className="p-2">
          <div className="font-medium">{r.azienda || <span className="opacity-50">—</span>}</div>
          <div className="text-xs opacity-60">{r.referente || ""}</div>
        </td>
        <td className="p-2">
          <div>{r.città || <span className="opacity-50">—</span>}</div>
          <div className="text-xs opacity-60">{r.provincia}</div>
        </td>
        <td className="p-2">{r.cliente || <span className="opacity-50">—</span>}</td>
        <td className="p-2">{r.agente}</td>
        {/* ✅ Nuova colonna Tipo */}
        <td className="p-2">{tipoLabel}</td>
        <td className="p-2">
          <span className={`text-xs px-2 py-1 rounded-full border ${statusBadge}`}>
            {STATUSES.find((s) => s.value === r.stato)?.label}
          </span>
          {r.stato === "annullato" && r.dataAnnullamento && (
            <div className="text-xs opacity-60 mt-1">
              Annullato il {fmtDate(r.dataAnnullamento)}
            </div>
          )}
          {r.fatturato && (
            <div className="text-[11px] mt-1 px-2 py-0.5 rounded-full border bg-gray-50">
              Fatturato {r.dataFatturazione ? `(${fmtDate(r.dataFatturazione)})` : ""}
            </div>
          )}
        </td>

        {/* ✅ Colonna “Azioni” sticky e con i pulsanti dentro al contenitore */}
        <td className="p-2 sticky right-0 bg-white z-10 border-l w-[200px]">
          <div className="flex items-center gap-1">
            <Button
              variant="secondary"
              size="icon"
              className="h-8 w-8"
              onClick={() => setEditing(r)}
              title="Dettagli / Modifica"
            >
              <Pencil className="h-4 w-4" />
            </Button>

            {canUpdate && (
              <>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => markSvolto(r)}
                  title="Segna svolto"
                  disabled={r.fatturato}
                >
                  <Check className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => markAnnullato(r)}
                  title="Annulla"
                  disabled={r.fatturato}
                >
                  <X className="h-4 w-4" />
                </Button>
              </>
            )}

            {canDelete && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => removeRow(r.id)}
                title="Elimina"
                disabled={r.fatturato}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
            
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => updateConfirmed(r)}
              title={r.confermato ? 'Togli conferma' : 'Conferma'}
            >
              <CheckCheck className="h-4 w-4" />
            </Button>
          </div>
        </td>
      </tr>
    );
  }

  /* Render */
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Coface – Gestione Appuntamenti</h1>
        <LogoutButton />
      </div>

        {/* Pulsante Calendario */}
        <div className="mt-3">
          <Link
            href="/calendario"
            className="inline-flex items-center gap-2 rounded-md bg-sky-600 px-3 py-1.5 text-white hover:bg-sky-700 shadow-sm"
          >
            📅 Apri Calendario
          </Link>
        </div>


      {/* RIGA 1 – CERCA & FILTRI */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Cerca & Filtri
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FiltersBar
            q={q}
            setQ={setQ}
            client={client}
            setClient={setClient}
            clients={clients}
            agent={agent}
            setAgent={setAgent}
            agents={agents}
            creator={creator}
            setCreator={setCreator}
            creators={creators}
            status={status}
            setStatus={setStatus}
            dayAppFrom={dayAppFrom}
            setDayAppFrom={setDayAppFrom}
            dayAppTo={dayAppTo}
            setDayAppTo={setDayAppTo}
            dayInsFrom={dayInsFrom}
            setDayInsFrom={setDayInsFrom}
            dayInsTo={dayInsTo}
            setDayInsTo={setDayInsTo}
            setPage={setPage}
          />
        </CardContent>
      </Card>

      {/* RIGA 2 – IMPORT & EXPORT */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Import & Export</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionsBar
            addEmptyRow={addEmptyRow}
            fileInputRef={fileInputRef}
            importExcel={importExcel}
            downloadTemplate={downloadTemplate}
            exportExcel={exportExcel}
            exportCSVFatturazione={exportCSVFatturazione}
            exportExcelFatturazione={exportExcelFatturazione}
            clearAll={clearAll}
          />
        </CardContent>
      </Card>

      {/* RIGA 3 – KPI */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Numeri</CardTitle>
        </CardHeader>
        <CardContent>
          <KPI />
        </CardContent>
      </Card>

      <Collapsible
        title="📆 Oggi per cliente"
        storageKey="coface:collapse:today-by-client"
        defaultOpen={true}
      >
        <TodayByClientCard data={todayByClient} />
      </Collapsible>


  {/* Leaderboard Operatori – collassabile, Mese/Anno, % annullati */}
  <Collapsible
    title="🏆 Classifica Operatori"
    storageKey="coface:collapse:leaderboard-v3"  // nuovo nome
    defaultOpen={false}                          // chiusa di default
  >
    <OperatorLeaderboardProCard rows={rows} monthTarget={15} />
  </Collapsible>

  <Collapsible
    title="📉 Annulli (mese vs inseriti)"
    storageKey="coface:collapse:ann-stats"
    defaultOpen={false}
  >
    <CancellationStatsCard
      stats={cancellationStats}
      byClient={cancellationByClient}
      annMonth={annMonth}
      setAnnMonth={setAnnMonth}
      annYear={annYear}
      setAnnYear={setAnnYear}
      detailRows={cancellationDetailRows}
    />
  </Collapsible>

  {/* 📊 Nuova card: capacità settimanale TCI */}
<Collapsible
  title="📊 Capacità settimanale TCI"
  storageKey="coface:collapse:tci-capacity"
  defaultOpen={false}
>
  <TciWeeklyCapacityCard rows={rows} target={4} />
</Collapsible>


  {/* ✅ Nuova card: statistiche per giorno di inserimento */}
  <Collapsible
    title="Statistiche per giorno di inserimento (ultimi 30 giorni presenti)"
    storageKey="coface:collapse:ins-stats"
    defaultOpen={false}
  >
    <InsertionStatsCard rows={rows} />
  </Collapsible>

  {/* STATISTICHE PER OPERATORE */}
  <Collapsible
    title="Statistiche per Operatore"
    storageKey="coface:collapse:op-stats"
    defaultOpen={false}
  >
    <OperatorStatsCard
      rowsAll={rows}
      rowsFiltered={filtered}
      creators={creators}
    />
  </Collapsible>


      {/* TABELLA */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Elenco appuntamenti</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <Label className="whitespace-nowrap">Ordina per</Label>
              <Select
                value={sortBy}
                onValueChange={(v) => { setSortBy(v); setPage(1); }}
              >
                <SelectTrigger className="w-[220px] md:w-[220px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inserimento">Inserimento (data/ora)</SelectItem>
                  <SelectItem value="appuntamento">Appuntamento (data/ora)</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={sortDir}
                onValueChange={(v) => { setSortDir(v); setPage(1); }}
              >
                <SelectTrigger className="w-[160px] md:w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="asc">Crescente</SelectItem>
                  <SelectItem value="desc">Decrescente</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* ✅ wrapper con overflow-x e posizionamento relativo per la sticky column */}
          <div className="relative overflow-x-auto border rounded-xl">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="p-2">ID</th>
                  <th className="p-2">Operatore</th>
                  <th className="p-2">Inserimento</th>
                  <th className="p-2">Appuntamento</th>
                  <th className="p-2">Azienda</th>
                  <th className="p-2">Luogo</th>
                  <th className="p-2">Cliente</th>
                  <th className="p-2">Agente</th>
                  {/* ✅ nuova colonna visibile */}
                  <th className="p-2">Tipo</th>
                  <th className="p-2">Stato</th>
                  {/* ✅ header sticky allineato alla colonna azioni */}
                  <th className="p-2 sticky right-0 bg-white z-20 w-[200px] shadow-[inset_8px_0_8px_-8px_rgba(0,0,0,0.12)]">
                    Azioni
                  </th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => (<Row key={r.id} r={r} />))}
                {pageRows.length === 0 && (
                  <tr>
                    <td colSpan={11} className="p-6 text-center text-sm opacity-60">
                      Nessun risultato
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between mt-4">
            <div className="text-sm opacity-70">
              {filtered.length} risultati • Pagina {page} di {totalPages}
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs">Righe per pagina</Label>
              <Input
                type="number"
                min={1}
                max={200}
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value || 25))}
                className="w-[90px]"
              />
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))}>
                Precedente
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                Successiva
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs opacity-60">
        Dati condivisi tramite Supabase (Postgres + Realtime). Import/Export Excel,
        CSV/Excel fatturazione, password per modifiche “123”, cancellazione protetta.
      </p>

      {/* Modale editor – usa funzioni protette */}
      <Editor
        editing={editing}
        setEditing={setEditing}
        updateRow={updateRowSecure}
        markSvolto={markSvolto}
        markAnnullato={markAnnullato}
        markRecupero={markRecupero}
        markFatturato={markFatturato}
        unmarkFatturato={unmarkFatturato}
        clientiOpzioni={clients.slice(1)}
      />

      <CreateAppointmentModal
        open={createOpen}
        setOpen={setCreateOpen}
        onCreate={handleCreate}
        clientOptions={clients.slice(1)}
        canInsert={canInsert}
      />
    </div>
  );
}