// components/CreateAppointmentModal.jsx
"use client";

import React, { useState } from "react";
import { Button } from "@/components/button";
import { Input } from "@/components/input";
import { Label } from "@/components/label";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/select";
import { Calendar, Plus } from "lucide-react";

export default function CreateAppointmentModal({
  open,
  setOpen,
  onCreate,
  clientiOpzioni,
  canInsert,
}) {
  if (!open || !canInsert) return null;

  const [saving, setSaving] = useState(false);

  // N.B.: in UI usiamo "città" (accentata). In DB è "citta" (mappata da rowToDb).
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
    tipo_appuntamento: "",
  });

  const ch = (k) => (e) =>
    setF((p) => ({ ...p, [k]: e?.target ? e.target.value : e }));

  // ✅ tutti obbligatori tranne idContaq
  const REQUIRED_KEYS = {
    data: "Data appuntamento",
    ora: "Ora appuntamento",
    azienda: "Azienda",
    referente: "Referente",
    telefono: "Telefono",
    email: "Email",
    indirizzo: "Indirizzo (solo interno)",
    "città": "Regione",
    provincia: "Provincia",
    agente: "Agente",
    operatore: "Operatore",
    cliente: "Cliente",
    stato: "Stato",
    note: "Note",
    tipo_appuntamento: "Tipo appuntamento",
  };

  function validateRequired(payload) {
    const missing = Object.entries(REQUIRED_KEYS)
      .filter(([k]) => !String(payload[k] ?? "").trim())
      .map(([, label]) => `• ${label}`);
    if (missing.length) {
      alert(
        "Compila i campi obbligatori:\n\n" +
          missing.join("\n")
      );
      return false;
    }
    return true;
  }

  async function submit() {
    try {
      const payload = { ...f };
      if (!validateRequired(payload)) return;

      setSaving(true);
      const ok = await onCreate(payload); // passa TUTTO lo state (incluso tipo_appuntamento)
      setSaving(false);
      if (ok) setOpen(false);
    } catch {
      setSaving(false);
      alert("Errore durante la creazione");
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/30 flex items-end md:items-center justify-center p-4 z-50"
      onClick={() => setOpen(false)}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full md:max-w-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            <h3 className="font-semibold">Nuovo appuntamento</h3>
          </div>
        </div>

        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Data / Ora */}
          <div>
            <Label>Data appuntamento</Label>
            <Input type="date" value={f.data} onChange={ch("data")} required />
          </div>
          <div>
            <Label>Ora appuntamento</Label>
            <Input type="time" value={f.ora} onChange={ch("ora")} required />
          </div>

          {/* Anagrafica base */}
          <div className="md:col-span-2">
            <Label>Azienda</Label>
            <Input value={f.azienda} onChange={ch("azienda")} required />
          </div>
          <div>
            <Label>Referente</Label>
            <Input value={f.referente} onChange={ch("referente")} required />
          </div>
          <div>
            <Label>Telefono</Label>
            <Input value={f.telefono} onChange={ch("telefono")} required />
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" value={f.email} onChange={ch("email")} required />
          </div>

          {/* Regione / Provincia */}
          <div>
            <Label>Regione</Label>
            <Input value={f["città"]} onChange={ch("città")} required />
          </div>
          <div>
            <Label>Provincia</Label>
            <Input value={f.provincia} onChange={ch("provincia")} required />
          </div>

          {/* Agente / Operatore */}
          <div>
            <Label>Agente</Label>
            <Input value={f.agente} onChange={ch("agente")} required />
          </div>
          <div>
            <Label>Operatore</Label>
            <Input value={f.operatore} onChange={ch("operatore")} required />
          </div>

          {/* Cliente */}
          <div>
            <Label>Cliente</Label>
            <Select
              value={f.cliente}
              onValueChange={(v) => setF((p) => ({ ...p, cliente: v }))}
              required
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleziona cliente" />
              </SelectTrigger>
              <SelectContent>
                {(clientiOpzioni || []).map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Tipo appuntamento (token tecnici) */}
          <div>
            <Label>Tipo appuntamento</Label>
            <Select
              value={f.tipo_appuntamento}
              onValueChange={(v) => setF((p) => ({ ...p, tipo_appuntamento: v }))}
              required
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleziona tipo appuntamento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="in_sede">In sede</SelectItem>
                <SelectItem value="videocall">Videocall</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* ID Contaq (unico NON obbligatorio) */}
          <div className="md:col-span-2">
            <Label>ID Contaq (opzionale)</Label>
            <Input value={f.idContaq} onChange={ch("idContaq")} />
          </div>

          {/* Note */}
          <div className="md:col-span-2">
            <Label>Note</Label>
            <Input value={f.note} onChange={ch("note")} required />
          </div>

          {/* Indirizzo */}
          <div className="md:col-span-2">
            <Label>Indirizzo (solo interno)</Label>
            <Input value={f.indirizzo} onChange={ch("indirizzo")} required />
          </div>
        </div>

        <div className="p-4 border-t flex items-center justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Annulla
          </Button>
          <Button onClick={submit} className="gap-2" disabled={saving}>
            <Plus className="h-4 w-4" />
            {saving ? "Creazione..." : "Crea"}
          </Button>
        </div>
      </div>
    </div>
  );
}
