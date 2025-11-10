"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Calendar, dateFnsLocalizer, Views } from "react-big-calendar";
import {
  parse, format,
  startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  startOfDay, endOfDay, addMinutes, isSameDay, setHours, setMinutes,
} from "date-fns";
import it from "date-fns/locale/it";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { createClient } from "@supabase/supabase-js";
import CreateAppointmentModal from "@/components/CreateAppointmentModal";

/* ============== Supabase (singleton) ============== */
const supabase =
  globalThis.__sb ||
  (globalThis.__sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ));

/* ============== Localizer IT ============== */
const locales = { it };
const localizer = dateFnsLocalizer({
  format: (date, fmt, options) => format(date, fmt, { locale: it, ...options }),
  parse: (dateStr, fmt) => parse(dateStr, fmt, new Date(), { locale: it }),
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }),
  getDay: (d) => d.getDay(),
  locales,
});

/* ============== Helpers ============== */
function toISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// "YYYY-MM-DD" + "HH:mm" -> Date
function buildDate(dateISO, hhmm) {
  const d = dateISO instanceof Date ? dateISO : new Date(dateISO);
  if (Number.isNaN(d.getTime())) return null;
  let h = 9, m = 0;
  if (typeof hhmm === "string" && /^\d{1,2}:\d{2}$/.test(hhmm)) {
    const [H, M] = hhmm.split(":").map((x) => parseInt(x, 10));
    if (!Number.isNaN(H)) h = H;
    if (!Number.isNaN(M)) m = M;
  }
  const out = new Date(d);
  out.setHours(h, m, 0, 0);
  return out;
}
function endPlus1h(dt) { if (!dt) return null; const out = new Date(dt); out.setMinutes(out.getMinutes() + 60); return out; }
function hhmm(date) { return format(date, "HH:mm", { locale: it }); }

// Colore deterministico per agente
function colorForAgent(name = "") {
  const palette = ["#60a5fa","#f472b6","#34d399","#f59e0b","#a78bfa","#f87171","#38bdf8","#fb923c","#4ade80","#c084fc"];
  let h = 0; const s = String(name || "");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

/* ====== Parametri disponibilità ====== */
const SLOT_MINUTES = 60;  // durata appuntamento
const BUFFER_MINUTES = 60; // distanza minima tra appuntamenti
const WORK_START_HOUR = 9;
const WORK_END_HOUR = 18;

/* ====== Clienti canonici per select nel modale ====== */
const CLIENTI_CANONICI = [
  "Coface",
  "Credit Partner",
  "Credit Solution",
  "General Service",
  "TCI PADOVA",
  "TCI BRESCIA 2",
  "TCI MILANO 4",
  "TCI MACERATA",
  "TCI CATANIA",
  "Satispay",
];

/* ============== Pagina Calendario ============== */
export default function CalendarioPage() {
  const [events, setEvents] = useState([]);
  const [view, setView] = useState(Views.WEEK);
  const [date, setDate] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const [agent, setAgent] = useState("tutti");
  const [agents, setAgents] = useState([]); // tendina

  // Modale condiviso (tuo)
  const [modalOpen, setModalOpen] = useState(false);
  const [modalInitial, setModalInitial] = useState({});

  // Range visibile
  const currentRange = useMemo(() => {
    let start, end;
    if (view === Views.MONTH) {
      start = startOfWeek(startOfMonth(date), { weekStartsOn: 1 });
      end = endOfWeek(endOfMonth(date), { weekStartsOn: 1 });
    } else if (view === Views.WEEK) {
      start = startOfWeek(date, { weekStartsOn: 1 });
      end = endOfWeek(date, { weekStartsOn: 1 });
    } else if (view === Views.DAY) {
      start = startOfDay(date);
      end = endOfDay(date);
    } else {
      start = startOfWeek(date, { weekStartsOn: 1 });
      end = endOfWeek(date, { weekStartsOn: 1 });
    }
    return { start, end };
  }, [date, view]);

  /* --------- Agenti: fetch completo (no range), dedup e merge --------- */
  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from("appointments")
          .select("agente")
          .not("agente", "is", null)
          .neq("agente", "")
          .order("agente", { ascending: true })
          .range(0, 100000); // tetto alto
        if (error) throw error;

        const all = [...new Set((data || []).map((r) => (r.agente || "").trim()))]
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b, "it"));
        setAgents(all);
      } catch (e) {
        setErrorMsg(`Errore agenti: ${e?.message || e}`);
      }
    })();
  }, []);

  /* --------- Eventi per intervallo + filtro agente --------- */
  const loadEvents = useCallback(async (start, end, currentAgent) => {
    setLoading(true);
    setErrorMsg("");

    const startISO = toISO(start);
    const endPlus = new Date(end); endPlus.setDate(endPlus.getDate() + 1);
    const endISO = toISO(endPlus);

    try {
      let q = supabase
        .from("appointments")
        .select("id, data, ora, azienda, cliente, agente, operatore, stato", { count: "exact" })
        .gte("data", startISO)
        .lt("data", endISO)
        .order("data", { ascending: true })
        .order("ora", { ascending: true });

      if (currentAgent && currentAgent !== "tutti") {
        q = q.eq("agente", currentAgent); // match esatto
      }

      const { data, error } = await q;
      if (error) throw error;

      // merge agenti trovati nel range (evita “buchi”)
      const foundAgents = [...new Set((data || []).map((r) => (r.agente || "").trim()))]
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, "it"));
      if (foundAgents.length) {
        setAgents((prev) =>
          [...new Set([...prev, ...foundAgents])]
            .filter(Boolean)
            .sort((a, b) => a.localeCompare(b, "it"))
        );
      }

      const mapped = (data || []).map((r) => {
        const startDt = buildDate(r?.data, r?.ora);
        const endDt = endPlus1h(startDt);
        if (!startDt || !endDt) return null;

        const title = `${hhmm(startDt)} · ${[r?.azienda, r?.agente].filter(Boolean).join(" — ") || "Appuntamento"}`;
        const col = colorForAgent(r?.agente);

        return {
          id: String(r.id),
          title,
          start: startDt,
          end: endDt,
          allDay: false,
          resource: r,
          backgroundColor: col,
          borderColor: col,
          textColor: "#111827",
        };
      }).filter(Boolean);

      setEvents(mapped);
    } catch (e) {
      setErrorMsg(String(e?.message || e));
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEvents(currentRange.start, currentRange.end, agent);
  }, [currentRange, agent, loadEvents]);

  // Colori per stato
  const eventPropGetter = useMemo(() => {
    return (event) => {
      const stato = event?.resource?.stato?.toLowerCase?.() || "";
      let bg = event?.backgroundColor || "#2563eb";
      if (stato.includes("annull")) bg = "#dc2626";
      else if (stato.includes("svolt")) bg = "#16a34a";
      else if (stato.includes("programm")) bg = "#f59e0b";
      return { style: { backgroundColor: bg, color: "white", borderRadius: 6, border: 0 } };
    };
  }, []);

  // Legenda agenti
  const legendAgents = useMemo(() => {
    const names = [...new Set(events.map((e) => e?.resource?.agente).filter(Boolean))]
      .sort((a, b) => String(a).localeCompare(String(b), "it"));
    return names.map((name) => ({ name, color: colorForAgent(name) }));
  }, [events]);

  /* --------- Disponibilità: slot per agente --------- */
  const availableSlotsByDay = useMemo(() => {
    if (!agent || agent === "tutti") return {};
    const agentEvents = events.filter(
      (e) => (e?.resource?.agente || "").toLowerCase() === agent.toLowerCase()
    );
    const occupied = agentEvents.map((e) => ({
      start: addMinutes(e.start, -BUFFER_MINUTES),
      end: addMinutes(e.end, BUFFER_MINUTES),
    }));
    const overlaps = (aStart, aEnd) => occupied.some(({ start, end }) => aStart < end && aEnd > start);

    const out = {};
    const dayCount = Math.ceil((currentRange.end - currentRange.start) / (1000 * 60 * 60 * 24)) + 1;

    for (let i = 0; i < dayCount; i++) {
      const day = new Date(
        currentRange.start.getFullYear(),
        currentRange.start.getMonth(),
        currentRange.start.getDate() + i
      );
      let cursor = setMinutes(setHours(day, WORK_START_HOUR), 0);
      const dayEnd = setMinutes(setHours(day, WORK_END_HOUR), 0);

      const slots = [];
      while (addMinutes(cursor, SLOT_MINUTES) <= dayEnd) {
        const s = cursor;
        const e = addMinutes(cursor, SLOT_MINUTES);
        if (isSameDay(s, day) && isSameDay(e, day) && !overlaps(s, e)) {
          slots.push({ start: s, end: e });
        }
        cursor = addMinutes(cursor, 60);
      }
      out[toISO(day)] = slots;
    }
    return out;
  }, [events, agent, currentRange]);

// Generatore ID simile alla dashboard: "MH" + 10 caratteri base36 maiuscoli
function makeAppointmentId() {
  return (
    "MH" +
    Math.random().toString(36).slice(2, 12).toUpperCase()
  );
}

/* --------- onCreate dal tuo modale: insert su Supabase --------- */
async function handleCreateFromModal(formValues) {
  const now = new Date();
  const datainserimento = toISO(now);                  // es. "2025-11-19"
  const orainserimento = hhmm(now);                    // es. "09:42"

  // Normalizzazioni → colonne effettive del DB
  const payload = {
    id: makeAppointmentId(),                           // 🔸 ID obbligatorio (text, NOT NULL)
    data: formValues.data,
    ora: formValues.ora,
    azienda: formValues.azienda?.trim() || "",
    referente: formValues.referente?.trim() || "",
    telefono: formValues.telefono?.trim() || "",
    email: formValues.email?.trim() || "",
    piva: formValues.piva?.trim() || "",
    indirizzo: formValues.indirizzo?.trim() || "",
    citta: formValues["città"]?.trim() || "",          // "città" → citta
    provincia: formValues.provincia?.trim() || "",
    operatore: formValues.operatore?.trim() || "",
    agente: formValues.agente?.trim() || "",
    cliente: formValues.cliente?.trim() || "",
    stato: formValues.stato || "programmato",
    note: formValues.note || "",
    fatturato: !!formValues.fatturato,
    tipo_appuntamento:
      String(formValues.tipo_appuntamento || "")
        .toLowerCase()
        .includes("video")
        ? "videocall"
        : "sede",
    idContaq: formValues.idContaq?.trim() || "",       // opzionale (campo utente)
    datainserimento,                                   // facoltativi ma utili, se li usi in DB
    orainserimento,
  };

  const { error } = await supabase.from("appointments").insert(payload);
  if (error) throw error;

  // Se non usi realtime, puoi forzare un refresh:
  // await loadEvents(currentRange.start, currentRange.end, agent);

  return true; // chiude il modale se true
}



  return (
    <div className="p-4 space-y-4">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold">Calendario</h1>

        <div className="flex items-center gap-3">
          <label className="text-sm">
            Agente:&nbsp;
            <select
              value={agent}
              onChange={(e) => setAgent(e.target.value)}
              className="rounded-md border border-gray-300 px-2 py-1 text-sm"
            >
              <option value="tutti">Tutti</option>
              {agents.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </label>

          {loading ? (
            <span className="text-sm text-gray-500">Carico gli appuntamenti…</span>
          ) : (
            <span className="text-sm text-gray-500">{events.length} eventi</span>
          )}
        </div>
      </header>

      {/* Legenda colori agenti */}
      {legendAgents.length > 0 && (
        <div className="flex flex-wrap gap-3 text-xs">
          {legendAgents.map((a) => (
            <span key={a.name} className="inline-flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: a.color }} />
              {a.name}
            </span>
          ))}
        </div>
      )}

      {errorMsg && <div className="text-red-600 text-sm">Errore: {errorMsg}</div>}

      {/* Calendario + Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4">
        <div style={{ height: "78vh" }}>
          <Calendar
            culture="it"
            localizer={localizer}
            events={events}
            startAccessor="start"
            endAccessor="end"
            views={[Views.MONTH, Views.WEEK, Views.DAY, Views.AGENDA]}
            view={view}
            onView={setView}
            date={date}
            onNavigate={setDate}
            step={30}
            timeslots={2}
            popup
            eventPropGetter={eventPropGetter}
            formats={{
              eventTimeRangeFormat: ({ start, end }) => `${hhmm(start)}–${hhmm(end)}`,
              agendaTimeRangeFormat: ({ start, end }) => `${hhmm(start)}–${hhmm(end)}`,
            }}
            messages={{
              agenda: "Agenda", day: "Giorno", week: "Settimana", month: "Mese",
              today: "Oggi", previous: "Indietro", next: "Avanti",
              showMore: (total) => `+${total} altri`,
              noEventsInRange: "Nessun evento nel periodo",
            }}
          />
        </div>

        {/* Sidebar disponibilità */}
        <aside className="h-[78vh] overflow-auto rounded-lg border border-gray-200 p-3">
          <div className="mb-3">
            <h2 className="text-sm font-semibold">Disponibilità (durata 1h, distanza 1h)</h2>
            {agent === "tutti" && (
              <p className="text-xs text-gray-500 mt-1">Seleziona un agente per vedere gli slot disponibili.</p>
            )}
          </div>

          {agent !== "tutti" && (
            <div className="space-y-4">
              {Object.entries(availableSlotsByDay).map(([dayISO, slots]) => (
                <div key={dayISO} className="border-b pb-3 last:border-0">
                  <div className="text-xs font-medium text-gray-700 mb-2">
                    {format(new Date(dayISO), "EEEE d MMMM yyyy", { locale: it })}
                  </div>
                  {slots.length === 0 ? (
                    <div className="text-xs text-gray-400">Nessuno slot disponibile</div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {slots.map(({ start }) => {
                        const label = hhmm(start);
                        return (
                          <button
                            key={`${dayISO}-${label}`}
                            onClick={() => {
                              setModalInitial({
                                data: toISO(start),
                                ora: hhmm(start),
                                agente: agent,
                                tipo_appuntamento: "sede",
                                stato: "programmato",
                              });
                              setModalOpen(true);
                            }}
                            className="text-xs rounded-md border px-2 py-1 hover:bg-blue-50 active:bg-blue-100"
                            title="Crea appuntamento su questo slot"
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>

      {/* Modale: usa il TUO componente */}
      <CreateAppointmentModal
        open={modalOpen}
        setOpen={setModalOpen}
        initialValues={modalInitial}
        clientOptions={CLIENTI_CANONICI}
        onCreate={handleCreateFromModal}
      />
    </div>
  );
}
