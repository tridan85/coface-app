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
  clientOptions = [],
}) {
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState({
    idContaq: "",
    data: "",
    ora: "",
    azienda: "",
    referente: "",
    telefono: "",
    email: "",
    piva: "",
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

  const REQUIRED_KEYS = {
    data: "Data appuntamento",
    ora: "Ora appuntamento",
    azienda: "Azienda",
    referente: "Referente",
    telefono: "Telefono",
    email: "Email",
    piva: "P.iva",
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
  
  const ch =
    (k) =>
    (e) => {
      const v = typeof e === "string" ? e : e?.target?.value;
      setF((s) => ({ ...s, [k]: v ?? "" }));
    };

  const validate = () => {
    for (const [k, label] of Object.entries(REQUIRED_KEYS)) {
      const v = (f?.[k] ?? "").toString().trim();
      if (!v) {
        alert(`Campo obbligatorio: ${label}`);
        return false;
      }
    }
    if ((f.piva || "").trim().length < 3) {
      alert("La P.iva è obbligatoria.");
      return false;
    }
    return true;
  };

  const reset = () => {
    setF({
      idContaq: "",
      data: "",
      ora: "",
      azienda: "",
      referente: "",
      telefono: "",
      email: "",
      piva: "",
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
  };

  const submit = async () => {
    if (!validate()) return;
    try {
      setSaving(true);
      const ok = await onCreate?.(f);
      if (ok !== false) {
        reset();
        setOpen(false);
      }
    } catch (e) {
      alert("Errore creazione: " + (e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[min(980px,92vw)] rounded-2xl bg-white shadow-xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b p-4">
          <div className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            <h3 className="text-lg font-semibold">Nuovo appuntamento</h3>
          </div>
        </div>

        <div className="p-4 space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label>Data appuntamento</Label>
              <div className="relative">
                <Input
                  type="date"
                  value={f.data}
                  onChange={ch("data")}
                  required
                />
                <Calendar className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50" />
              </div>
            </div>
            <div>
              <Label>Ora appuntamento</Label>
              <Input type="time" value={f.ora} onChange={ch("ora")} required />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label>Azienda</Label>
              <Input value={f.azienda} onChange={ch("azienda")} required />
            </div>
            <div>
              <Label>Referente</Label>
              <Input
                value={f.referente}
                onChange={ch("referente")}
                required
              />
            </div>

            <div>
              <Label>Telefono</Label>
              <Input value={f.telefono} onChange={ch("telefono")} required />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={f.email}
                onChange={ch("email")}
                required
              />
            </div>

            <div>
              <Label>P.iva</Label>
              <Input
                value={f.piva || ""}
                onChange={ch("piva")}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label>Regione</Label>
              <Input value={f["città"]} onChange={ch("città")} required />
            </div>
            <div>
              <Label>Provincia</Label>
              <Input value={f.provincia} onChange={ch("provincia")} required />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <Label>Operatore</Label>
              <Input value={f.operatore} onChange={ch("operatore")} required />
            </div>
            <div>
              <Label>Agente</Label>
              <Input value={f.agente} onChange={ch("agente")} required />
            </div>
            <div>
              <Label>Cliente</Label>
              <Select
                value={f.cliente}
                onValueChange={(v) => ch("cliente")(v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona cliente" />
                </SelectTrigger>
                <SelectContent>
                  {(clientOptions?.length ? clientOptions : ["Coface"]).map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label>Tipo appuntamento</Label>
              <Select
                value={f.tipo_appuntamento}
                onValueChange={(v) => setF((s) => ({ ...s, tipo_appuntamento: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona tipo appuntamento" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sede">In sede</SelectItem>
                  <SelectItem value="videocall">Videocall</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>ID Contaq (opzionale)</Label>
              <Input value={f.idContaq} onChange={ch("idContaq")} />
            </div>
          </div>
          
          <div>
            <Label>Note</Label>
            <Input value={f.note} onChange={ch("note")} required />
          </div>

          <div>
            <Label>Indirizzo (solo interno)</Label>
            <Input value={f.indirizzo} onChange={ch("indirizzo")} required />
          </div>
        </div>

        <div className="border-t p-4 flex items-center justify-end gap-2">
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