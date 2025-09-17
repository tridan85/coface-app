#!/usr/bin/env node
// apply-coface-patches.mjs
// Applica in-place le modifiche richieste alla dashboard Coface.
// Uso:
//   node scripts/apply-coface-patches.mjs "app/CofaceDashboard.jsx"
//   (oppure senza argomento: prova a trovarlo ricorsivamente)
//
// Crea un backup UTF-8: <file>.bak

import fs from "fs";
import path from "path";

const userArg = process.argv[2];

function findCandidate(startDir) {
  const names = [
    "CofaceDashboard.jsx","CofaceDashboard.tsx",
    "CofaceAppuntamentiDashboard.jsx","CofaceAppuntamentiDashboard.tsx",
    "CofaceDashboard.js","CofaceAppuntamentiDashboard.js",
    "14-9 ok FUNZIONANTE.txt", // fallback
  ];
  const stack = [startDir];
  while (stack.length) {
    const dir = stack.pop();
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (!/node_modules|\.next|\.git/.test(p)) stack.push(p); continue; }
      if (names.includes(e.name)) return p;
    }
  }
  return null;
}

const targetPath = userArg && fs.existsSync(userArg)
  ? userArg
  : findCandidate(process.cwd());

if (!targetPath) {
  console.error("❌ File dashboard non trovato. Passa il percorso del file, es:");
  console.error('   node scripts/apply-coface-patches.mjs "app/CofaceDashboard.jsx"');
  process.exit(1);
}

let src = fs.readFileSync(targetPath, "utf8");
const before = src;

// tiny utils
const has = (pat) => (typeof pat === "string" ? src.includes(pat) : pat.test(src));
const rep = (regex, repl, tag) => {
  const next = src.replace(regex, repl);
  if (next !== src) { console.error("~", tag); src = next; } else { console.error("=", tag, "(nessuna sostituzione)"); }
};
const insertAfter = (regex, addition, tag) => {
  const m = src.match(regex);
  if (!m) { console.error("!", tag, "(ancora non trovata)"); return; }
  if (src.includes(addition.trim())) { console.error("=", tag, "(già presente)"); return; }
  const idx = m.index + m[0].length;
  src = src.slice(0, idx) + addition + src.slice(idx);
  console.error("+", tag);
};

// 0) Import Calendar (se non c’è già)
rep(
  /(from\s+"lucide-react"\s*;\s*)/,
  (m) => src.includes("Calendar") ? m : m.replace('";', ', Calendar";').replace(', Calendar"', '"'),
  "Import Calendar (idempotente)"
);

// 1) Helpers normOp/canonicalize + Confermato (prima di /* Editor (modale) */)
if (!has(/function\s+normOp\s*\(/)) {
  rep(
    /\n\/\*\s*Editor\s*\(modale\)\s*\*\//,
`
// ───────────────────────────────────────────────────────────
// Normalizzazione Operatore (case-insensitive) + Confermato
// ───────────────────────────────────────────────────────────
function normOp(s){return (s??"").trim().toLowerCase();}
function canonicalizeOperators(rows){
  const map=new Map();
  for (const r of rows){ const raw=r?.operatore??""; const k=normOp(raw); if(!k) continue; if(!map.has(k)) map.set(k,raw); }
  return map; // { "mario": "Mario" }
}
function isConfirmed(r){ return /\\[#CONF\\]/i.test(r?.note||""); }
function toggleConfirmNote(note,to){
  const has=/\\[#CONF\\]/i.test(note||"");
  if(to && !has) return ((note||"")+" [#CONF]").trim();
  if(!to && has) return (note||"").replace(/\\s*\\[#CONF\\]\\s*/gi," ").trim();
  return note||"";
}
// ───────────────────────────────────────────────────────────
$&
`,
    "Helpers operatore + Confermato"
  );
} else {
  console.error("= Helpers operatore: già presenti");
}

// 2) Stati insFrom/insTo accanto a monthIns/dayIns
rep(
  /(const\s*\[\s*monthIns[\s\S]*?setDayIns\]\s*=\s*useState\(\s*""\s*\)\s*;)/,
  `$1
  const [insFrom, setInsFrom] = useState(""); // Inserimento dal (yyyy-mm-dd)
  const [insTo, setInsTo]     = useState(""); // Inserimento al  (yyyy-mm-dd)
`,
  "State insFrom/insTo"
);

// 3) FiltersBar: props + UI “Inserimento dal/al”
rep(
  /function\s+FiltersBar\s*\(\{\s*([\s\S]*?)\}\)\s*\{/,
  (m, props) => m.includes("insFrom") ? m :
`function FiltersBar({ ${props.replace(/setDayIns,\s*/, "setDayIns, insFrom, setInsFrom, insTo, setInsTo, ")} }) {`,
  "FiltersBar props insFrom/insTo"
);

rep(
  /<div>\s*<Label>Giorno \(inserimento\)<\/Label>[\s\S]*?<Input[\s\S]*?setDayIns\(e\.target\.value\);[\s\S]*?\/>\s*<\/div>\s*<\/div>/,
  (m)=> m + `
      <div>
        <Label>Inserimento dal</Label>
        <div className="relative">
          <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4" />
          <Input type="date" className="pl-8" value={insFrom}
            onChange={(e)=>{ setInsFrom(e.target.value); setPage(1); }} />
        </div>
      </div>
      <div>
        <Label>Inserimento al</Label>
        <div className="relative">
          <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4" />
          <Input type="date" className="pl-8" value={insTo}
            onChange={(e)=>{ setInsTo(e.target.value); setPage(1); }} />
        </div>
      </div>
  `,
  "UI FiltersBar Inserimento dal/al"
);

// 3c) Pass props dal parent
rep(
  /<FiltersBar([\s\S]*?)setDayIns=\{setDayIns\}([\s\S]*?)setPage=\{setPage\}\s*\/>/,
  (m, pre, post) =>
    m.includes("insFrom={insFrom}") ? m :
`<FiltersBar${pre}setDayIns={setDayIns}
            insFrom={insFrom} setInsFrom={setInsFrom}
            insTo={insTo}     setInsTo={setInsTo}${post}setPage={setPage} />`,
  "Parent -> FiltersBar props insFrom/insTo"
);

// 4) Filtri: range su dataInserimento + operatore case-insensitive
rep(
  /(if\s*\(monthIns\)[\s\S]*?;\s*\/\/ ✅ nuovo filtro mese inserimento\s*\n\s*if\s*\(dayIns\)[\s\S]*?;\s*\/\/ ✅ nuovo filtro giorno inserimento\s*)/,
  (m)=> m + `
    // ✅ range Inserimento dal/al
    if (insFrom) out = out.filter((r) => (r.dataInserimento || "") >= insFrom);
    if (insTo)   out = out.filter((r) => (r.dataInserimento || "") <= insTo);
`,
  "Filtro range inserimento"
);

rep(
  /if\s*\(\s*creator\s*!==\s*"tutti"\s*\)\s*out\s*=\s*out\.filter\(\(r\)\s*=>\s*r\.operatore\s*===\s*creator\);\s*/,
  `if (creator !== "tutti") {
    const key = normOp(creator);
    out = out.filter((r) => normOp(r.operatore) === key);
  }
  `,
  "Filtro operatore case-insensitive"
);

// 5) creators unificati
rep(
  /const\s+creators\s*=\s*useMemo\([\s\S]*?\]\);\s*\n/,
  `const creators = useMemo(() => {
    const map = canonicalizeOperators(rows);
    const display = Array.from(map.values()).sort((a,b)=>a.localeCompare(b));
    return ["tutti", ...display];
  }, [rows]);
  `,
  "Creators unificati"
);

// 6) UI: “Città” -> “Regione”; header “Luogo” -> “Regione/Prov.”; placeholder
rep(/<Label>Città<\/Label>/g, `<Label>Regione</Label>`, "Label Regione (Editor)");
rep(/placeholder="Azienda, referente, città, note, provincia, ID Contaq…"/,
   `placeholder="Azienda, referente, regione, note, provincia, ID Contaq…"`,
   "Placeholder Regione");
rep(/<th className="p-2">Luogo<\/th>/, `<th className="p-2">Regione\/Prov.<\/th>`, "Header Regione/Prov.");

// 7) Operatore 2ª colonna
rep(
  /(<thead[\s\S]*?<tr>\s*<th className="p-2">ID<\/th>\s*)<th className="p-2">Inserimento<\/th>/,
  `$1<th className="p-2">Operatore</th><th className="p-2">Inserimento</th>`,
  "Thead: Operatore 2ª"
);

// Body: inserisci cella Operatore dopo ID; rimuovi quella vecchia
rep(
  /(<td className="p-2 font-mono text-xs opacity-60">\{r\.id\}<\/td>\s*)<td className="p-2 whitespace-nowrap">/,
  `$1<td className="p-2">{r.operatore || <span className="opacity-50">—</span>}</td><td className="p-2 whitespace-nowrap">`,
  "Body: Operatore dopo ID"
);
rep(/\s*<td className="p-2">\{r\.operatore \|\| <span className="opacity-50">—<\/span>\}<\/td>\s*/, `\n`, "Body: rimuovi vecchia cella Operatore");

// 8) “Confermato” checkbox (thead + body + updateRowFree)
if (!has(/async function updateRowFree/)) {
  rep(/\/\*\s*CRUD\s*\(DB\)\s*\*\//, `/* CRUD (DB) */\n  async function updateRowFree(id, patch){ return _updateRow(id, patch); }\n`, "updateRowFree()");
}

rep(
  /(<thead[\s\S]*?<tr>[\s\S]*?)<th className="p-2 sticky right-0[\s\S]*?>\s*Azioni/ ,
  (m, headStart) =>
    headStart.includes(`>Confermato<`) ? m :
    headStart + `<th className="p-2">Confermato</th>` + m.slice(headStart.length),
  "Thead: Confermato"
);

rep(
  /<td className="p-2 sticky right-0 bg-white z-10 border-l w-\[200px\]">/,
  `
    <td className="p-2">
      <input type="checkbox" className="h-4 w-4"
        checked={isConfirmed(r)}
        onChange={async (e)=>{ const next=toggleConfirmNote(r.note, e.target.checked); await updateRowFree(r.id,{note:next}); }} />
    </td>
    <td className="p-2 sticky right-0 bg-white z-10 border-l w-[200px]">`,
  "Body: Confermato"
);

// --- Scrittura finale (solo se è cambiato) ---
if (src === before) {
  console.error("= Nessuna modifica scritta (file già patchato?)");
  process.exit(0);
}

fs.writeFileSync(targetPath + ".bak", before, { encoding: "utf8" });
fs.writeFileSync(targetPath, src, { encoding: "utf8" });
console.error("✅ Patch applicata. Backup:", targetPath + ".bak");
