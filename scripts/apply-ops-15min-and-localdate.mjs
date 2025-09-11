// scripts/apply-ops-15min-and-localdate.mjs
import fs from "node:fs";
import path from "node:path";

const file = path.resolve("components/CofaceDashboard.jsx");
let src = fs.readFileSync(file, "utf8");

// 1) todayISO -> versione locale (niente UTC)
src = src.replace(
/function todayISO\(\)\s*\{[\s\S]*?\}/,
`function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return \`\${yyyy}-\${mm}-\${dd}\`;
}`
);

// 2) aggiungi stato utente/me e mounted subito dopo il role
src = src.replace(
/const \[role, setRole\] = useState\("viewer"\);/,
`const [role, setRole] = useState("viewer");
  const [me, setMe] = useState({ name: "", email: "" });
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);`
);

// 3) dentro l'effetto che fa getUser: salva anche name/email
src = src.replace(
/useEffect\(\(\) => \{\s*let mounted = true;[\s\S]*?setRole\("viewer"\);\s*\}\)\(\);\s*return \(\) => \{ mounted = false; \};\s*\}, \[supabase\]\);/m,
`useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (!mounted) return;
        setRole(data?.user?.app_metadata?.role || "viewer");
        setMe({
          name: data?.user?.user_metadata?.name || data?.user?.user_metadata?.full_name || "",
          email: data?.user?.email || ""
        });
      } catch {
        setRole("viewer");
      }
    })();
    return () => { mounted = false; };
  }, [supabase]);`
);

// 4) prima del blocco CRUD inserisci helper per la finestra 15'
src = src.replace(
/\/\* KPI \*\/[\s\S]*?return \{\s*\.\.\.base, fatturabili, fatturati, totale: filtered.length \};\s*\}, \[filtered\]\);\s*\n\s*\/\* CRUD \(DB\) \*\//m,
match => match + `
  // ---- permessi "modifica entro 15 min" (per operatore) ----
  const isSameOperator = (row) => {
    if (!row || !row.operatore) return false;
    const mine = (me.name || me.email || "").trim().toLowerCase();
    return mine && row.operatore.trim().toLowerCase() === mine;
  };
  const canEditRow = (row) => {
    if (!mounted) return false;                // evita mismatch SSR/CSR
    if (role === "admin") return true;
    if (role !== "operator") return false;
    if (!isSameOperator(row)) return false;
    const ts = tsFrom(row?.dataInserimento, row?.oraInserimento);
    if (Number.isNaN(ts)) return false;
    return (Date.now() - ts) <= 15 * 60 * 1000; // 15 minuti
  };
`
);

// 5) in Editor: accetta canEdit e usa quello per disabled + banner
src = src.replace(
/function Editor\(\{[\s\S]*?clientiOpzioni,\s*canUpdate,[\s\S]*?\}\) \{/m,
`function Editor({
  editing,
  setEditing,
  updateRow,
  markSvolto,
  markAnnullato,
  markRecupero,
  markFatturato,
  unmarkFatturato,
  clientiOpzioni,
  canUpdate,     // admin (stato/azioni)
  canEdit        // admin oppure operatore entro 15' e creatore
}) {`
);

src = src.replace(
/const locked = !!r\.fatturato;[\s\S]*?const commonInputProps = \(k\) => \(\{[\s\S]*?disabled: !canUpdate \|\| \(locked && k !== "note"\),\s*\}\);\s*/m,
`const locked = !!r.fatturato;
  const commonInputProps = (k) => ({
    value: r[k] ?? "",
    onChange: (e) => {
      const v = e.target.value;
      const next = { ...r, [k]: v };
      setEditing(next);
      updateRow(r.id, { [k]: v });
    },
    disabled: !canEdit || (locked && k !== "note"),
  });`
);

// Banner in alto (se non si può modificare)
src = src.replace(
/<div className="flex items-center justify-between p-4 border-b">/,
`<div className="p-3 text-[13px] text-gray-700 bg-gray-50 border-b">
            <span className="inline-flex items-center gap-2">
              {!canEdit && (
                <>
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full border">🔒</span>
                  Modifica bloccata: trascorsi 15 minuti dall'inserimento o non sei il creatore.
                </>
              )}
              {canEdit && <span className="opacity-70">Modifica consentita</span>}
            </span>
          </div>
          <div className="flex items-center justify-between p-4 border-b">`
);

// Select disabilitate: usa canEdit (non canUpdate)
src = src.replace(/disabled=\{!canUpdate \|\| locked\}/g, `disabled={!canEdit || locked}`);

// 6) guard in updateRow: blocca salvataggi non consentiti
src = src.replace(
/async function updateRow\(id, patch\) \{\s*const \{ data, error \} = await supabase/,
`async function updateRow(id, patch) {
    if (role !== "admin") {
      const row = rows.find(r => r.id === id);
      if (!canEditRow(row)) {
        alert("Modifica non consentita: finestra di 15 minuti scaduta o non sei il creatore.");
        return false;
      }
    }
    const { data, error } = await supabase`
);

// 7) markAnnullato: usa todayISO (ora locale)
src = src.replace(
/function markAnnullato\(r\) \{ updateRow\(r\.id, \{ stato: "annullato", dataAnnullamento: todayISO\(\) \} \); \}/,
`function markAnnullato(r) { updateRow(r.id, { stato: "annullato", dataAnnullamento: todayISO() }); }`
);

// 8) handleCreate: dataInserimento/oraInserimento già usano todayISO/nowHM -> ok

// 9) montare l'Editor solo da client + passare canEdit calcolato
src = src.replace(
/<Editor\s*\n\s*editing=\{editing\}[\s\S]*?canUpdate=\{canUpdate\}\s*\/>/m,
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

fs.writeFileSync(file, src, "utf8");
console.log("✅ Patch applicata. Riavvia/aggiorna il dev server se necessario.");
