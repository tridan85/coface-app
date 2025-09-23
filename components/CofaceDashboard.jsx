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
const CLIENTI_CANONICI = [
  "Coface",
  "Credit Partner",
  "Credit Solution",
  "General Service",
];

const CLEAR_ALL_PASSWORD = "Password.2";
const EDIT_PASSWORD = "123"; // ⬅️ password operativa per modifiche/annulli/cancellazioni

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

/* mapping JS <-> DB */
function rowFromDb(db) {
  return {
    ...db,
    // UI: "città" (accentata) ←→ DB: citta
    città: db.citta ?? "",
    // UI espone direttamente la chiave DB corretta (niente camel)
    tipo_appuntamento: db.tipo_appuntamento ?? db.tipoappuntamento ?? null,
  };
}
const toNull = (v) => (v === "" || v === undefined ? null : v);
// mappa solo i campi speciali; il resto passa così com'è
function rowToDb(js) {
  const { città, tipoAppuntamento, ...rest } = js || {}; // scarta eventuale camel
  return {
    ...rest,             // include tipo_appuntamento se presente
    citta: città ?? "",  // mapping UI->DB
  };
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

/**
 * Apre SEMPRE Gmail Web nella stessa tab con To/CC/BCC/Subject/Body.
 * Se il primo compose ignora CC/BCC (alcuni tenant/policy), dopo 250ms
 * forza il percorso ufficiale Gmail che converte un mailto in compose
 * preservando i campi.
 */
function openEmail({ to, cc, bcc, subject, body }) {
  try {
    const urlG = gmailComposeUrl({ to, cc, bcc, subject, body });
    window.location.assign(urlG);

    // Fallback “ufficiale” Gmail (conversione mailto→compose)
    setTimeout(() => {
      const mailto = mailtoUrl({ to, cc, bcc, subject, body });
      const enc = encodeURIComponent;
      const gmailConvert = `https://mail.google.com/mail/u/0/?extsrc=mailto&url=${enc(mailto)}`;
      window.location.assign(gmailConvert);
    }, 250);
  } catch {
    // Estremo: prova direttamente la conversione mailto→compose
    const mailto = mailtoUrl({ to, cc, bcc, subject, body });
    const enc = encodeURIComponent;
    window.location.assign(`https://mail.google.com/mail/u/0/?extsrc=mailto&url=${enc(mailto)}`);
  }
}

/* ────────────────────────────────────────────────────────────── */
/* Helper tipo appuntamento + lookup email agente                 */
/* ────────────────────────────────────────────────────────────── */

function tipoLabel(r) {
  const t = r?.tipo_appuntamento;
  if (t === "in_sede") return "in sede";
  if (t === "videocall") return "videocall";
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

  const to = getAgentEmail(r) || "";
  const cc = ["arturo.antacido@coface.com", "customersuccess.italy@coface.com", "cofaceappuntamenti@apemo.net " ];
  const bcc = ["tlcoface@contaq.it"];

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

  const to = r?.email || ""; // email azienda dal record
  const cc = [getAgentEmail(r), "arturo.antacido@coface.com"].filter(Boolean);
  const bcc = ["tlcoface@contaq.it"];

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
              <Input type="date" value={r.dataInserimento || ""} disabled />
            </div>
            <div>
              <Label className="text-xs">Ora inserimento</Label>
              <Input type="time" value={r.oraInserimento || ""} disabled />
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
              <Label className="text-xs">Tipo appuntamento</Label>
              <Select
                value={r.tipo_appuntamento || ""}
                onValueChange={(v) => {
                  setEditing({ ...r, tipo_appuntamento: v });
                  updateRow(r.id, { tipo_appuntamento: v });
                }}
                disabled={locked}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="in_sede">In sede</SelectItem>
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
/* Nuova card: Statistiche per giorno di inserimento              */
/* ────────────────────────────────────────────────────────────── */
function InsertionStatsCard({ rows }) {
  const last30Dates = React.useMemo(() => {
    const set = new Set(
      rows
        .map((r) => r.dataInserimento)
        .filter((d) => d && /^\d{4}-\d{2}-\d{2}$/.test(d))
        .sort((a, b) => a.localeCompare(b))
    );
    const arr = Array.from(set);
    return arr.slice(-30);
  }, [rows]);
  const byDay = React.useMemo(() => {
    const map = new Map();
    for (const r of rows) {
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
    for (const r of rows) {
      if (!r.dataInserimento || !last30Dates.includes(r.dataInserimento)) continue;
      map.set((r.operatore || "—").toLowerCase(), (map.get((r.operatore || "—").toLowerCase()) || 0) + 1);
    }
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [rows, last30Dates]);
  const byCliente = React.useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      if (!r.dataInserimento || !last30Dates.includes(r.dataInserimento)) continue;
      map.set(r.cliente || "—", (map.get(r.cliente || "—") || 0) + 1);
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
              {byOperatore.map((x) => (
                <div key={x.name} className="flex items-center justify-between text-sm">
                  <span className="truncate">{x.name}</span>
                  <span className="font-medium">{x.count}</span>
                </div>
              ))}
              {byOperatore.length === 0 && <div className="text-sm opacity-60">Nessun dato</div>}
            </div>
          </div>
          <div className="border rounded-xl p-3">
            <div className="text-sm font-medium mb-2">Per cliente</div>
            <div className="space-y-1 max-h-[260px] overflow-auto pr-2">
              {byCliente.map((x) => (
                <div key={x.name} className="flex items-center justify-between text-sm">
                  <span className="truncate">{x.name}</span>
                  <span className="font-medium">{x.count}</span>
                </div>
              ))}
              {byCliente.length === 0 && <div className="text-sm opacity-60">Nessun dato</div>}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ⬇️ INCOLLA QUI, poco sopra a: export default function CofaceAppuntamentiDashboard() { ... }
function Collapsible({ title, storageKey, defaultOpen = false, children }) {
  const [open, setOpen] = React.useState(() => {
    try {
      const saved = storageKey ? localStorage.getItem(storageKey) : null;
      return saved != null ? saved === "1" : defaultOpen;
    } catch {
      return defaultOpen;
    }
  });

  React.useEffect(() => {
    try { if (storageKey) localStorage.setItem(storageKey, open ? "1" : "0"); } catch {}
  }, [open, storageKey]);

  return (
    <div className="border rounded-xl overflow-hidden bg-white">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50"
      >
        <span className="font-medium">{title}</span>
        <span className={`transition-transform duration-200 ${open ? "rotate-90" : ""}`} aria-hidden>
          ▸
        </span>
      </button>

      <div className={`transition-[grid-template-rows] duration-200 grid ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="overflow-hidden">
          <div className="p-4">{children}</div>
        </div>
      </div>
    </div>
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

  // Primo fetch (pubblico) + realtime
  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("*")
        .order("dataInserimento", { ascending: true })
        .order("oraInserimento", { ascending: true });

      if (!mounted) return;

      if (error) {
        console.error("Select error:", error);
        alert("Errore lettura appuntamenti: " + error.message);
        return;
      }
      setRows((data || []).map(rowFromDb));
    })();

    const ch = supabase
      .channel("realtime:appointments")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "appointments" },
        async () => {
          const { data, error } = await supabase.from("appointments").select("*");
          if (error) {
            console.error("Realtime refresh error:", error);
            return;
          }
          setRows((data || []).map(rowFromDb));
        }
      )
      .subscribe();
    return () => {
      mounted = false;
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const agents = useMemo(
    () => ["tutti", ...Array.from(new Set(rows.map((r) => r.agente).filter(Boolean))).sort((a, b) => a.localeCompare(b))],
    [rows]
  );
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
          r.azienda, r.referente, r.email, r.telefono, r.città, r.indirizzo,
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

  // Inserisce un nuovo appuntamento su Supabase e aggiorna la tabella locale
  async function handleCreate(form) {
    try {
      const supabase = getSupabaseClient();
      const id = generateId();

      const jsRow = {
        id,
        dataInserimento: todayISO(),
        oraInserimento: nowHM(),

        // prendi tutto dal form (include tipo_appuntamento)
        ...form,

        // normalizzazioni minime
        città: form["città"] ?? form.citta ?? "",
        data: form.data || null,
        stato: form.stato || "programmato",
        fatturato: !!form.fatturato,

        // se l’utente non sceglie niente, salva null
        tipo_appuntamento: form.tipo_appuntamento || null,
      };

      const payload = rowToDb(jsRow); // mappa solo “città” -> citta
      const { error } = await supabase.from("appointments").insert(payload);
      if (error) throw error;

      setRows((prev) => [jsRow, ...prev]);
      return true;
    } catch (e) {
      console.error("Create error", e?.message || e);
      alert("Errore durante la creazione");
      return false;
    }
  }

  async function _updateRow(id, patch) {
    const { data, error } = await supabase
      .from("appointments")
      .update(rowToDb(patch))
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

  function markSvolto(r) { return updateRowSecure(r.id, { stato: "svolto" }); }
  function markAnnullato(r) { return updateRowSecure(r.id, { stato: "annullato", dataAnnullamento: todayISO() }); }
  function markRecupero(r) { return updateRowSecure(r.id, { stato: "recuperato" }); }
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
      r.tipo_appuntamento === "in_sede" ? "In sede" :
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
                <SelectTrigger className="w:[220px] md:w-[220px]">
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
                <SelectTrigger className="w:[160px] md:w-[160px]">
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
        clientiOpzioni={clients.slice(1)}
        canInsert={canInsert}
      />
    </div>
  );
}
