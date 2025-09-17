#!/usr/bin/env node
// patch-coface-15-9.mjs
// Applica tutte le modifiche richieste alla dashboard Coface partendo da "14-9 ok FUNZIONANTE.txt"
// Uso: node patch-coface-15-9.mjs "14-9 ok FUNZIONANTE.txt" > "15-9 aggiornato.txt"

import fs from "fs";

const file = process.argv[2];
if (!file) {
  console.error("Uso: node patch-coface-15-9.mjs <percorso-file-sorgente>");
  process.exit(1);
}
let src = fs.readFileSync(file, "utf8");

function onceInsertAfter(markerRegex, insertion, tag) {
  if (src.includes(insertion.trim())) {
    console.error(`= ${tag}: già presente, salto`);
    return;
  }
  const m = src.match(markerRegex);
  if (!m) {
    console.error(`! ${tag}: marker non trovato, salto`);
    return;
  }
  const idx = m.index + m[0].length;
  src = src.slice(0, idx) + insertion + src.slice(idx);
  console.error(`+ ${tag}: inserito`);
}

function replaceOnce(regex, repl, tag) {
  if (regex.test(src)) {
    src = src.replace(regex, repl);
    console.error(`~ ${tag}: sostituito`);
  } else {
    console.error(`! ${tag}: pattern non trovato, salto`);
  }
}

function ensureHeaderAdded(beforeHeaderRegex, headerTextToAdd, tag) {
  const m = src.match(beforeHeaderRegex);
  if (!m) {
    console.error(`! ${tag}: header target non trovato, salto`);
    return;
  }
  const tableHeadBlock = m[0];
  if (tableHeadBlock.includes(headerTextToAdd)) {
    console.error(`= ${tag}: già presente, salto`);
    return;
  }
  const updated = tableHeadBlock.replace(
    /(\s*<\/tr>\s*<\/thead>)/,
    `\n  ${headerTextToAdd}$1`
  );
  src = src.replace(tableHeadBlock, updated);
  console.error(`+ ${tag}: header aggiunto`);
}

function insertAfterInFiltersBar(afterLabelTextRegex, addition, tag) {
  const m = src.match(afterLabelTextRegex);
  if (!m) {
    console.error(`! ${tag}: blocco FiltersBar target non trovato, salto`);
    return;
  }
  if (src.includes(addition.trim())) {
    console.error(`= ${tag}: già presente, salto`);
    return;
  }
  const idx = m.index + m[0].length;
  src = src.slice(0, idx) + addition + src.slice(idx);
  console.error(`+ ${tag}: UI FiltersBar aggiunta`);
}

// 1) Utility normOp + canonicalizeOperators (inserire prima del blocco "/* mapping JS <-> DB */")
onceInsertAfter(
  /\n\/\* Excel headers del template \*\/[\s\S]*?const DEFAULT_HEADERS[\s\S]*?\];\n/,
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
    if (!map.has(key)) map.set(key, raw); // conserva la prima forma visiva
  }
  return map; // es: { "mario": "Mario" }
}
`,
  "Utility operatore"
);

// 2) Stati nuovi (insFrom/insTo) accanto a monthIns/dayIns
replaceOnce(
  /(const\s*\[\s*monthIns[\s\S]*?setDayIns\]\s*=\s*useState\(""\);\s*)/,
  `$1
  const [insFrom, setInsFrom] = useState("");   // Inserimento dal
  const [insTo, setInsTo] = useState("");       // Inserimento al
`,
  "State insFrom/insTo"
);

// 3) FiltersBar: props insFrom/insTo in definizione componente
replaceOnce(
  /function\s+FiltersBar\s*\(\{\s*([\s\S]*?)\}\)\s*\{/,
  (m, props) => {
    if (props.includes("insFrom") || props.includes("insTo")) {
      console.error("= Props FiltersBar: già patchate");
      return m;
    }
    const patched = props.replace(
      /setDayIns,\s*/,
      `setDayIns,
  insFrom,
  setInsFrom,
  insTo,
  setInsTo,
  `
    );
    return `function FiltersBar({ ${patched} }) {`;
  },
  "Props FiltersBar insFrom/insTo"
);

// 3b) Filters: UI “Inserimento dal/al” (dopo blocco “Giorno (inserimento)”)
insertAfterInFiltersBar(
  /<div>\s*<Label>Giorno \(inserimento\)<\/Label>[\s\S]*?<div>\s*<\/div>\s*<\/div>\s*/,
  `
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
`,
  "UI insFrom/insTo in FiltersBar"
);

// 3c) Uso FiltersBar nel parent: pass props
replaceOnce(
  /<FiltersBar([\s\S]*?)setDayIns=\{setDayIns\}([\s\S]*?)setPage=\{setPage\}\s*\/>/,
  (m, pre, post) => {
    if (m.includes("insFrom={insFrom}")) {
      console.error("= Props parent FiltersBar: già presenti");
      return m;
    }
    return `<FiltersBar${pre}setDayIns={setDayIns}
            insFrom={insFrom}
            setInsFrom={setInsFrom}
            insTo={insTo}
            setInsTo={setInsTo}${post}setPage={setPage} />`;
  },
  "Parent props FiltersBar insFrom/insTo"
);

// 4) Filtri: aggiungi range su dataInserimento + operatore case-insensitive
replaceOnce(
  /if\s*\(monthIns\)[\s\S]*?;\s*\/\/ ✅ filtro mese inserimento\s*\n\s*if\s*\(dayIns\)[\s\S]*?;\s*\/\/ ✅ filtro giorno inserimento\s*/,
  (m) => `${m}
    // ✅ range Inserimento dal/al
    if (insFrom) out = out.filter((r) => (r.dataInserimento || "") >= insFrom);
    if (insTo)   out = out.filter((r) => (r.dataInserimento || "") <= insTo);
`,
  "Filtro range inserimento"
);

replaceOnce(
  /if\s*\(\s*creator\s*!==\s*"tutti"\s*\)\s*out\s*=\s*out\.filter\(\(r\)\s*=>\s*r\.operatore\s*===\s*creator\);\s*/,
  `if (creator !== "tutti") {
    const key = normOp(creator);
    out = out.filter((r) => normOp(r.operatore) === key);
  }
  `,
  "Filtro operatore case-insensitive"
);

// 5) creators: unificazione (case-insensitive)
replaceOnce(
  /const\s+creators\s*=\s*useMemo\([\s\S]*?\);\s*\n/,
  `const creators = useMemo(() => {
    const map = canonicalizeOperators(rows);
    const displayList = Array.from(map.values()).sort((a, b) => a.localeCompare(b));
    return ["tutti", ...displayList];
  }, [rows]);
  `,
  "Creators unificati"
);

// 6) “Città” → “Regione” (etichette/placeholder/thead)
replaceOnce(
  /<Label>Città<\/Label>/g,
  `<Label>Regione</Label>`,
  "Label Regione (Editor)"
);
replaceOnce(
  /placeholder="Azienda, referente, città, note, provincia, ID Contaq…"/,
  `placeholder="Azienda, referente, regione, note, provincia, ID Contaq…"`,
  "Placeholder regione"
);
replaceOnce(
  /<th className="p-2">Luogo<\/th>/,
  `<th className="p-2">Regione/Prov.</th>`,
  "Header Regione/Prov."
);

// 7) Colonna Operatore come 2ª colonna (thead)
replaceOnce(
  /<thead[\s\S]*?<tr>\s*<th className="p-2">ID<\/th>\s*<th className="p-2">Inserimento<\/th>/,
  (m) => m.replace(
    `<th className="p-2">Inserimento</th>`,
    `<th className="p-2">Operatore</th><th className="p-2">Inserimento</th>`
  ),
  "Header operatore 2ª colonna"
);

// 7b) Body: sposta cella operatore subito dopo ID; rimuovi quella vecchia
// Inserisci dopo cella ID
replaceOnce(
  /(<td className="p-2 font-mono text-xs opacity-60">\{r\.id\}<\/td>\s*)<td className="p-2 whitespace-nowrap">/,
  `$1<td className="p-2">{r.operatore || <span className="opacity-50">—</span>}</td><td className="p-2 whitespace-nowrap">`,
  "Body operatore after ID"
);
// Rimuovi la vecchia cella operatore più avanti (se presente)
replaceOnce(
  /\s*<td className="p-2">\{r\.operatore \|\| <span className="opacity-50">—<\/span>\}<\/td>\s*/,
  `\n`,
  "Body operatore rimozione cella vecchia"
);

// 8) Colonna “Confermato” (checkbox, senza password) + helper + update free

// 8a) helper in utility (aggiungi prima di "/* KPI Operatore */" o in coda alle util)
onceInsertAfter(
  /\/\*\s*KPI Operatore\s*\*\//,
  `
/* Confermato (salvato in note con tag [#CONF]) */
function isConfirmed(r) {
  return /\\[#CONF\\]/i.test(r?.note || "");
}
function toggleConfirmNote(note, to) {
  const has = /\\[#CONF\\]/i.test(note || "");
  if (to && !has) return ((note || "") + " [#CONF]").trim();
  if (!to && has) return (note || "").replace(/\\s*\\[#CONF\\]\\s*/gi, " ").trim();
  return note || "";
}
`,
  "Helper Confermato"
);

// 8b) update libero (senza password) nel componente principale
replaceOnce(
  /\/\* CRUD \(DB\) \*\//,
  `/* CRUD (DB) */
  async function updateRowFree(id, patch) {
    return _updateRow(id, patch); // senza ensureEditPassword
  }
`,
  "updateRowFree"
);

// 8c) aggiungi header prima di “Azioni”
ensureHeaderAdded(
  /<thead[\s\S]*?<tr>[\s\S]*?<\/thead>/,
  `<th className="p-2">Confermato</th>`,
  "Header Confermato"
);

// 8d) cella body prima della colonna Azioni sticky
replaceOnce(
  /(\{\/* ✅ Colonna “Azioni”[\s\S]*?className="p-2 sticky right-0[\s\S]*?<\/td>\s*<\/tr>)/,
  (m) => {
    if (m.includes('type="checkbox"') && m.includes('isConfirmed(r)')) {
      console.error("= Cella Confermato già presente");
      return m;
    }
    return m.replace(
      /<td className="p-2 sticky right-0/,
      `<td className="p-2">
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
        <td className="p-2 sticky right-0`
    );
  },
  "Body colonna Confermato"
);

// 9) (auto-svolto già presente) — nessuna modifica

// 10) (stats inserimento già presente) — opzionale normalizzazione operatore: lascia invariato

// Output finale
process.stdout.write(src);
