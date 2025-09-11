// scripts/fix-dup-canedit.mjs
import fs from "node:fs";
import path from "node:path";

const file = path.resolve("components/CofaceDashboard.jsx");
let src = fs.readFileSync(file, "utf8");

// 1) elimina QUALSIASI definizione precedente di isSameOperator / canEditRow
src = src.replace(/const\s+isSameOperator\s*=\s*\([\s\S]*?\}\s*;/g, "");
src = src.replace(/const\s+canEditRow\s*=\s*\([\s\S]*?\}\s*;/g, "");

// 2) inserisci la versione unica subito PRIMA del commento /* CRUD (DB) */
src = src.replace(
  /\/\*\s*CRUD\s*\(DB\)\s*\*\//,
`// ---- permessi "modifica entro 15 min" (operatore) ----
const isSameOperator = (row) => {
  if (!row || !row.operatore) return false;
  const mine = (me.name || me.email || "").trim().toLowerCase();
  return mine && row.operatore.trim().toLowerCase() === mine;
};
const canEditRow = (row) => {
  if (!mounted) return false;                 // evita mismatch SSR/CSR
  if (role === "admin") return true;
  if (role !== "operator") return false;
  if (!isSameOperator(row)) return false;
  const ts = tsFrom(row?.dataInserimento, row?.oraInserimento);
  if (Number.isNaN(ts)) return false;
  return (Date.now() - ts) <= 15 * 60 * 1000; // 15 minuti
};
/* CRUD (DB) */`
);

// 3) assicura che l’Editor riceva canEdit calcolato una volta sola
src = src.replace(
  /<Editor[\s\S]*?canUpdate=\{canUpdate\}[\s\S]*?\/>/m,
`{mounted && (
  <Editor
    editing={editing}
    setEditing={setEditing}
    updateRow={updateRow}
    markSvolto={markSvolto}
    markAnnullato={markAnnullato}
    markRecupero={markRecupero}
    markFatturato={markFatturato}
    unmarkFatturato={unmarkFatturato}
    clientiOpzioni={clients.slice(1)}
    canUpdate={canUpdate}
    canEdit={editing ? canEditRow(editing) : false}
  />
)}`
);

// 4) scrivi il file
fs.writeFileSync(file, src, "utf8");
console.log("✅ Duplicati rimossi e canEditRow unificato.");
