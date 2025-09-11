// scripts/apply-ops-create-patch.mjs
import fs from "fs";
import path from "path";

const dashPath = path.join("components", "CofaceDashboard.jsx");
const modalPath = path.join("components", "CreateAppointmentModal.jsx");

// ---------- helpers
function saveBackup(p) {
  const s = fs.readFileSync(p, "utf8");
  fs.writeFileSync(p + ".bak", s);
  return s;
}
function write(p, s) {
  fs.writeFileSync(p, s, "utf8");
}
function insertAfter(s, anchor, payload) {
  const i = s.indexOf(anchor);
  if (i < 0) return s;
  return s.slice(0, i + anchor.length) + payload + s.slice(i + anchor.length);
}
function addImportIfMissing(s, importLine) {
  if (s.includes(importLine)) return s;
  // inserisco dopo l’ultimo import
  const m = [...s.matchAll(/^\s*import .*;$/gm)];
  if (!m.length) return importLine + "\n" + s;
  const last = m[m.length - 1];
  const idx = last.index + last[0].length;
  return s.slice(0, idx) + "\n" + importLine + s.slice(idx);
}

// ---------- patch CofaceDashboard.jsx
if (!fs.existsSync(dashPath)) {
  console.error("❌ Non trovo", dashPath);
  process.exit(1);
}
let s = saveBackup(dashPath);

// 1) Import della nuova modale
s = addImportIfMissing(s, `import CreateAppointmentModal from "@/components/CreateAppointmentModal";`);

// 2) Permessi dopo il client supabase
s = insertAfter(
  s,
  `const supabase = getSupabaseClient();`,
  `
/* PATCH: ruolo & permessi */
const [role, setRole] = useState("viewer");
useEffect(() => {
  let mounted = true;
  (async () => {
    try {
      const { data } = await supabase.auth.getUser();
      if (!mounted) return;
      setRole(data?.user?.app_metadata?.role || "viewer");
    } catch {
      setRole("viewer");
    }
  })();
  return () => { mounted = false; };
}, [supabase]);

const canInsert = role === "admin" || role === "operator"; // operator può creare
const canUpdate = role === "admin";                        // solo admin modifica/stato
const canDelete = role === "admin";                        // solo admin elimina
`
);

// 3) Stato apertura modale di creazione, lo mettiamo vicino agli altri state
s = insertAfter(
  s,
  `const [pageSize, setPageSize] = useState(25);`,
  `\n  const [createOpen, setCreateOpen] = useState(false);\n`
);

// 4) ActionsBar: aggiungi props canInsert/canDelete alla firma
s = s.replace(
  /function\s+ActionsBar\s*\(\{\s*([\s\S]*?)\}\)\s*\{/,
  (m, g1) => {
    if (/canInsert|canDelete/.test(g1)) return m; // già patchato
    const withFlags = g1.trim().replace(/,\s*$/, "");
    const sep = withFlags ? ", " : "";
    return `function ActionsBar({ ${withFlags}${sep}canInsert, canDelete }) {`;
  }
);

// 5) ActionsBar: mostra “Nuovo” solo se canInsert
s = s.replace(
  /(\n\s*)<Button\s+onClick=\{addEmptyRow\}([\s\S]*?)<\/Button>/,
  (m, sp, rest) => `${sp}{canInsert && (<Button onClick={addEmptyRow}${rest}</Button>)}`);

// 6) ActionsBar: mostra “Svuota tutto” solo se canDelete
s = s.replace(
  /(\n\s*)<Button([\s\S]*?)onClick=\{clearAll\}([\s\S]*?)>[\s\S]*?Svuota tutto[\s\S]*?<\/Button>/,
  (m, sp, a, b) => `${sp}{canDelete && (<Button${a}onClick={clearAll}${b}>Svuota tutto</Button>)}`);

// 7) pass flags quando usi <ActionsBar ... />
s = s.replace(
  /<ActionsBar([^>]*?)\/>/,
  (m, g1) => (g1.includes("canInsert") ? m : `<ActionsBar${g1} canInsert={canInsert} canDelete={canDelete} />`)
);

// 8) addEmptyRow: per gli operator apre la modale invece di inserire record vuoto
s = s.replace(
  /async function addEmptyRow\(\)\s*\{/,
  `async function addEmptyRow() {
  if (!canUpdate) { // operator
    setCreateOpen(true);
    return;
  }`
);

// 9) Aggiungi handler di creazione (INSERT singola) dentro il componente
s = insertAfter(
  s,
  `async function addEmptyRow()`,
  `

async function handleCreate(form) {
  const newRow = {
    id: generateId(),
    idContaq: form.idContaq || "",
    dataInserimento: todayISO(),
    oraInserimento: nowHM(),
    data: form.data || null,
    ora: form.ora || "",
    azienda: form.azienda || "",
    referente: form.referente || "",
    telefono: form.telefono || "",
    email: form.email || "",
    indirizzo: form.indirizzo || "",
    città: form["città"] ?? form.citta ?? "",
    provincia: form.provincia || "",
    agente: form.agente || "",
    operatore: form.operatore || "",
    cliente: form.cliente || "",
    stato: form.stato || "programmato",
    dataAnnullamento: null,
    note: form.note || "",
    fatturato: !!form.fatturato,
    dataFatturazione: null,
  };

  const { data, error } = await supabase
    .from("appointments")
    .insert(rowToDb(newRow))
    .select("id");

  if (error) {
    alert(\`Errore creazione: \${error.message}\`);
    return false;
  }
  if (!data || data.length === 0) {
    alert("Permesso negato (RLS)");
    return false;
  }
  setRows((p) => [newRow, ...p]);
  return true;
}
`
);

// 10) Rendi la modale vicino all’<Editor ... />
s = s.replace(
  /(<Editor[\s\S]*?\/>\s*\n)/,
  `$1      <CreateAppointmentModal
        open={createOpen}
        setOpen={setCreateOpen}
        onCreate={handleCreate}
        clientiOpzioni={clients.slice(1)}
        canInsert={canInsert}
      />\n`
);

write(dashPath, s);
console.log("✅ Patch file:", dashPath);

// ---------- crea CreateAppointmentModal.jsx
const modalCode = `
// components/CreateAppointmentModal.jsx
"use client";
import React, { useState } from "react";
import { Button } from "@/components/button";
import { Input } from "@/components/input";
import { Label } from "@/components/label";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/select";
import { Calendar, Plus } from "lucide-react";

export default function CreateAppointmentModal({ open, setOpen, onCreate, clientiOpzioni, canInsert }) {
  if (!open || !canInsert) return null;

  const [saving, setSaving] = useState(false);
  const [f, setF] = useState({
    idContaq: "",
    data: "",
    ora: "",
    azienda: "",
    referente: "",
    telefono: "",
    email: "",
    indirizzo: "",
    città: "",
    provincia: "",
    agente: "",
    operatore: "",
    cliente: "",
    stato: "programmato",
    note: "",
    fatturato: false,
  });

  const ch = (k) => (e) => setF((p) => ({ ...p, [k]: e.target ? e.target.value : e }));

  async function submit() {
    setSaving(true);
    const ok = await onCreate(f);
    setSaving(false);
    if (ok) setOpen(false);
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-end md:items-center justify-center p-4 z-50" onClick={() => setOpen(false)}>
      <div className="bg-white rounded-2xl shadow-xl w-full md:max-w-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            <h3 className="font-semibold">Nuovo appuntamento</h3>
          </div>
        </div>

        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Data appuntamento</Label>
            <Input type="date" value={f.data} onChange={ch("data")} />
          </div>
          <div>
            <Label>Ora appuntamento</Label>
            <Input type="time" value={f.ora} onChange={ch("ora")} />
          </div>

          <div className="md:col-span-2">
            <Label>Azienda</Label>
            <Input value={f.azienda} onChange={ch("azienda")} />
          </div>
          <div>
            <Label>Referente</Label>
            <Input value={f.referente} onChange={ch("referente")} />
          </div>
          <div>
            <Label>Telefono</Label>
            <Input value={f.telefono} onChange={ch("telefono")} />
          </div>
          <div>
            <Label>Email</Label>
            <Input value={f.email} onChange={ch("email")} />
          </div>

          <div>
            <Label>Città</Label>
            <Input value={f["città"]} onChange={ch("città")} />
          </div>
          <div>
            <Label>Provincia</Label>
            <Input value={f.provincia} onChange={ch("provincia")} />
          </div>

          <div>
            <Label>Agente</Label>
            <Input value={f.agente} onChange={ch("agente")} />
          </div>
          <div>
            <Label>Operatore</Label>
            <Input value={f.operatore} onChange={ch("operatore")} />
          </div>

          <div>
            <Label>Cliente</Label>
            <Select value={f.cliente} onValueChange={(v) => setF((p) => ({ ...p, cliente: v }))}>
              <SelectTrigger>
                <SelectValue placeholder="Seleziona cliente" />
              </SelectTrigger>
              <SelectContent>
                {clientiOpzioni.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="md:col-span-2">
            <Label>ID Contaq (opzionale)</Label>
            <Input value={f.idContaq} onChange={ch("idContaq")} />
          </div>

          <div className="md:col-span-2">
            <Label>Note</Label>
            <Input value={f.note} onChange={ch("note")} />
          </div>
        </div>

        <div className="p-4 border-t flex items-center justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Annulla</Button>
          <Button onClick={submit} className="gap-2" disabled={saving}>
            <Plus className="h-4 w-4" /> {saving ? "Creazione..." : "Crea"}
          </Button>
        </div>
      </div>
    </div>
  );
}
`;
write(modalPath, modalCode);
console.log("✅ Creato file:", modalPath);

console.log("\n🎉 Fatto. Riavvia/aggiorna il dev server se necessario.");
