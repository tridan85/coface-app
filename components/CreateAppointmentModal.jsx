
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
