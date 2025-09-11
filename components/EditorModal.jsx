"use client";

import React from "react";
import { Calendar, Check, X, RotateCcw, DollarSign } from "lucide-react";
import { Button } from "@/components/button";
import { Input } from "@/components/input";
import { Label } from "@/components/label";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/select";

// NOTE: questa è la stessa costante usata nel file principale
const STATUSES = [
  { value: "programmato", label: "Programmato" },
  { value: "svolto", label: "Svolto" },
  { value: "annullato", label: "Annullato" },
  { value: "recuperato", label: "Recuperato" },
];

// Helpers locali con fix timezone
function todayLocalISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function tsFromLocal(dateStr, timeStr) {
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

/**
 * EditorModal
 * Estratto in file client separato per eliminare l'errore
 * "Expected static flag was missing".
 */
export default function EditorModal({
  editing,
  setEditing,
  updateRow,
  markSvolto,
  markAnnullato,
  markRecupero,
  markFatturato,
  unmarkFatturato,
  clientiOpzioni,
  isAdmin, // ⬅️ ruolo
  currentOperatorLabel, // ⬅️ etichetta operatore corrente
}) {
  if (!editing) return null;
  const r = editing;
  const locked = !!r.fatturato;

  // 15 minuti in ms
  const EDIT_WINDOW_MS = 15 * 60 * 1000;
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // timestamp inserimento (locale)
  const tsInsert = tsFromLocal(r.dataInserimento, r.oraInserimento);
  const remaining = Math.max(0, EDIT_WINDOW_MS - (now - tsInsert));
  const isOwner = String(r.operatore || "").trim().toLowerCase() === String(currentOperatorLabel || "").trim().toLowerCase();
  const operatorCanEdit = isOwner && remaining > 0;

  // permesso effettivo in modale
  const canUpdate = isAdmin || operatorCanEdit;

  const commonInputProps = (k) => ({
    value: r[k] ?? "",
    onChange: (e) => {
      const v = e.target.value;
      const next = { ...r, [k]: v };
      setEditing(next);
      if (canUpdate && !(locked && k !== "note")) {
        updateRow(r.id, { [k]: v });
      }
    },
    disabled: !canUpdate || (locked && k !== "note") || (!isAdmin && k === "operatore"),
  });

  const mm = String(Math.floor(remaining / 60000)).padStart(2, "0");
  const ss = String(Math.floor((remaining % 60000) / 1000)).padStart(2, "0");

  return (
    <div
      className="fixed inset-0 bg-black/30 flex items-end md:items-center justify-center p-4 z-50"
      onClick={() => setEditing(null)}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full md:max-w-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            <h3 className="font-semibold">Modifica appuntamento</h3>
          </div>
          {/* Badge permessi & countdown */}
          <div className="text-xs rounded-full px-3 py-1 border bg-gray-50">
            {isAdmin ? (
              <span>Admin • modifica sempre</span>
            ) : operatorCanEdit ? (
              <span>Puoi modificare ancora {mm}:{ss}</span>
            ) : (
              <span>Modifica bloccata (solo note se fatturato = false)</span>
            )}
          </div>
        </div>

        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Inserimento */}
          <div>
            <Label>Data inserimento</Label>
            <Input type="date" value={r.dataInserimento || ""} disabled />
          </div>
          <div>
            <Label>Ora inserimento</Label>
            <Input type="time" value={r.oraInserimento || ""} disabled />
          </div>

          {/* Appuntamento */}
          <div>
            <Label>Data appuntamento</Label>
            <Input type="date" {...commonInputProps("data")} />
          </div>
          <div>
            <Label>Ora appuntamento</Label>
            <Input type="time" {...commonInputProps("ora")} />
          </div>

          <div className="md:col-span-2">
            <Label>Azienda</Label>
            <Input {...commonInputProps("azienda")} />
          </div>
          <div>
            <Label>Referente</Label>
            <Input {...commonInputProps("referente")} />
          </div>
          <div>
            <Label>Telefono</Label>
            <Input {...commonInputProps("telefono")} />
          </div>
          <div>
            <Label>Email</Label>
            <Input {...commonInputProps("email")} />
          </div>

          <div>
            <Label>Città</Label>
            <Input {...commonInputProps("città")} />
          </div>
          <div>
            <Label>Provincia</Label>
            <Input {...commonInputProps("provincia")} />
          </div>

          <div>
            <Label>Agente</Label>
            <Input {...commonInputProps("agente")} />
          </div>
          <div>
            <Label>Operatore</Label>
            <Input {...commonInputProps("operatore")} />
          </div>

          <div>
            <Label>Cliente</Label>
            <Select
              value={r.cliente || ""}
              onValueChange={(v) => canUpdate && updateRow(r.id, { cliente: v })}
              disabled={!canUpdate || locked}
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

          <div className="md:col-span-2">
            <Label>ID Contaq (opzionale)</Label>
            <Input {...commonInputProps("idContaq")} />
          </div>

          <div>
            <Label>Stato</Label>
            <Select
              value={r.stato}
              onValueChange={(v) => canUpdate && updateRow(r.id, { stato: v })}
              disabled={!isAdmin || locked}
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
            <Label>Data annullamento</Label>
            <Input type="date" {...commonInputProps("dataAnnullamento")} />
          </div>

          <div>
            <Label>Data fatturazione</Label>
            <Input type="date" {...commonInputProps("dataFatturazione")} />
          </div>

          <div className="md:col-span-2">
            <Label>Note</Label>
            <Input {...commonInputProps("note")} />
          </div>
          <div className="md:col-span-2">
            <Label>Indirizzo (solo interno)</Label>
            <Input {...commonInputProps("indirizzo")} />
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t flex flex-wrap items-center justify-between gap-2">
          <div className="text-sm opacity-70">
            ID: {r.id} {r.fatturato ? "• FATTURATO" : ""}
          </div>

          {/* Bottoni di stato – solo admin */}
          {isAdmin && (
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  markSvolto(r);
                  setEditing({ ...r, stato: "svolto" });
                }}
                className="gap-2"
                disabled={locked}
              >
                <Check className="h-4 w-4" /> Segna svolto
              </Button>

              <Button
                variant="outline"
                onClick={() => {
                  markAnnullato(r);
                  setEditing({
                    ...r,
                    stato: "annullato",
                    dataAnnullamento: todayLocalISO(),
                  });
                }}
                className="gap-2"
                disabled={locked}
              >
                <X className="h-4 w-4" /> Annulla
              </Button>

              <Button
                variant="outline"
                onClick={() => {
                  markRecupero(r);
                  setEditing({ ...r, stato: "recuperato" });
                }}
                className="gap-2"
                disabled={locked}
              >
                <RotateCcw className="h-4 w-4" /> Recuperato
              </Button>

              {!r.fatturato ? (
                <Button
                  onClick={() => {
                    markFatturato(r);
                    setEditing({
                      ...r,
                      fatturato: true,
                      dataFatturazione: todayLocalISO(),
                    });
                  }}
                  className="gap-2"
                >
                  <DollarSign className="h-4 w-4" /> Segna fatturato
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  onClick={() => {
                    unmarkFatturato(r);
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
          )}
        </div>
      </div>
    </div>
  );
}
