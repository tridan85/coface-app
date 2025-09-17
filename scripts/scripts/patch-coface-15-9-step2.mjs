#!/usr/bin/env node
// patch-coface-15-9-step2.mjs
// Completa patch mancanti: utility operatore, UI insFrom/insTo in FiltersBar, cella Confermato

import fs from "fs";

const file = process.argv[2] || ".\\15-9 aggiornato.txt"; // di default lavora sull’output già generato
if (!fs.existsSync(file)) {
  console.error("Sorgente non trovato:", file);
  process.exit(1);
}
let src = fs.readFileSync(file, "utf8");

// --- 1) Utility operatore: inserisci prima di "/* Editor (modale) */"
if (!/function\s+normOp\s*\(/.test(src)) {
  src = src.replace(
    /\n\/\*\s*Editor\s*\(modale\)\s*\*\//,
    `
/* ─────────────────────────────────────────────────────────── */
/* Normalizzazione Operatore (case-insensitive)                */
/* ─────────────────────────────────────────────────────────── */
function normOp(s) {
  return (s ?? "").trim().toLowerCase();
}
function canonicalizeOperators(rows) {
  const map = new Map();
  for (const r of rows) {
    const raw = r?.operatore ?? "";
    const key = normOp(raw);
    if (!key) continue;
    if (!map.has(key)) map.set(key, raw);
  }
  return map;
}

/* ─────────────────────────────────────────────────────────── */
$&
`
  );
  console.error("+ Utility operatore: inserite");
} else {
  console.error("= Utility operatore: già presenti");
}

// --- 2) FiltersBar: aggiungi due input "Inserimento dal/al" in coda al grid se mancanti
if (!/Inserimento dal/.test(src) || !/Inserimento al/.test(src)) {
  src = src.replace(
    /function\s+FiltersBar\s*\([\s\S]*?\)\s*\{\s*return\s*\(\s*<div className="grid[\s\S]*?>/,
    (m) => m + `
      {/* Inserimento dal/al */}
      <div>
        <Label>Inserimento dal</Label>
        <div className="relative">
          <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4" />
          <Input
            type="date"
            className="pl-8"
            value={insFrom}
            onChange={(e) => { setInsFrom(e.target.value); setPage(1); }}
          />
        </div>
      </div>
      <div>
        <Label>Inserimento al</Label>
        <div className="relative">
          <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4" />
          <Input
            type="date"
            className="pl-8"
            value={insTo}
            onChange={(e) => { setInsTo(e.target.value); setPage(1); }}
          />
        </div>
      </div>
    `
  );
  console.error("+ UI FiltersBar: campi dal/al aggiunti");
} else {
  console.error("= UI FiltersBar: già presenti");
}

// --- 3) Body tabella: aggiungi colonna Confermato prima della colonna Azioni sticky
// (se la checkbox non esiste già)
if (!/checked=\{isConfirmed\(r\)\}/.test(src)) {
  src = src.replace(
    /<td className="p-2 sticky right-0 bg-white z-10 border-l w-\[200px\]">/,
    `
      <td className="p-2">
        <input
          type="checkbox"
          className="h-4 w-4"
          checked={isConfirmed(r)}
          onChange={async (e) => {
            const next = toggleConfirmNote(r.note, e.target.checked);
            await updateRowFree(r.id, { note: next });
          }}
        />
      </td>
      <td className="p-2 sticky right-0 bg-white z-10 border-l w-[200px]">`
  );
  console.error("+ Body colonna Confermato: aggiunta");
} else {
  console.error("= Body colonna Confermato: già presente");
}

process.stdout.write(src);
