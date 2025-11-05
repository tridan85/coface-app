"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Calendar, dateFnsLocalizer, Views } from "react-big-calendar";
import {
  parse,
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfDay,
  endOfDay,
} from "date-fns";
import it from "date-fns/locale/it";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { createClient } from "@supabase/supabase-js";

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

// "2025-11-05" + "14:30" -> Date
function buildDate(dateISO, hhmm) {
  const d = dateISO instanceof Date ? dateISO : new Date(dateISO);
  if (Number.isNaN(d.getTime())) return null;
  let h = 9,
    m = 0;
  if (typeof hhmm === "string" && /^\d{1,2}:\d{2}$/.test(hhmm)) {
    const [H, M] = hhmm.split(":").map((x) => parseInt(x, 10));
    if (!Number.isNaN(H)) h = H;
    if (!Number.isNaN(M)) m = M;
  }
  const out = new Date(d);
  out.setHours(h, m, 0, 0);
  return out;
}

function endPlus1h(dt) {
  if (!dt) return null;
  const out = new Date(dt);
  out.setMinutes(out.getMinutes() + 60);
  return out;
}

// HH:mm (MOSTRA ORARIO)
function hhmm(date) {
  return format(date, "HH:mm", { locale: it });
}

// Colore deterministico per agente
function colorForAgent(name = "") {
  const palette = [
    "#60a5fa", // blue-400
    "#f472b6", // pink-400
    "#34d399", // emerald-400
    "#f59e0b", // amber-500
    "#a78bfa", // violet-400
    "#f87171", // red-400
    "#38bdf8", // sky-400
    "#fb923c", // orange-400
    "#4ade80", // green-400
    "#c084fc", // purple-400
  ];
  let h = 0;
  const s = String(name || "");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

/* ============== Pagina Calendario ============== */
export default function CalendarioPage() {
  const [events, setEvents] = useState([]);
  const [view, setView] = useState(Views.WEEK);
  const [date, setDate] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  const [agent, setAgent] = useState("tutti");
  const [agents, setAgents] = useState([]);

  // Calcola l'intervallo visibile in base a view/date
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
      // Agenda: usiamo settimana per semplicità
      start = startOfWeek(date, { weekStartsOn: 1 });
      end = endOfWeek(date, { weekStartsOn: 1 });
    }
    return { start, end };
  }, [date, view]);

  // Carica gli eventi per intervallo + agente
  const loadEvents = useCallback(
    async (start, end, currentAgent) => {
      setLoading(true);
      setErrorMsg("");

      const startISO = toISO(start);
      // end esclusivo in supabase
      const endPlus = new Date(end);
      endPlus.setDate(endPlus.getDate() + 1);
      const endISO = toISO(endPlus);

      try {
        let q = supabase
          .from("appointments")
          .select("id, data, ora, azienda, cliente, agente, stato", {
            count: "exact",
          })
          .gte("data", startISO)
          .lt("data", endISO)
          .order("data", { ascending: true })
          .order("ora", { ascending: true });

        if (currentAgent && currentAgent !== "tutti") {
          q = q.ilike("agente", currentAgent); // case-insensitive
        }

        const { data, error } = await q;
        if (error) throw error;

        // Popola la tendina agenti (prima volta)
        if (!agents.length) {
          const foundAgents = [...new Set((data || []).map((r) => (r.agente || "").trim()))]
            .filter(Boolean)
            .sort((a, b) => a.localeCompare(b, "it"));
          setAgents(foundAgents);
        }

        const mapped = (data || [])
          .map((r) => {
            const startDt = buildDate(r?.data, r?.ora);
            const endDt = endPlus1h(startDt);
            if (!startDt || !endDt) return null;

            // ======== SOLO QUESTA PARTE CAMBIA: TITOLO CON ORARIO ========
            const coreTitle =
              r?.azienda && r?.agente
                ? `${r.azienda} — ${r.agente}`
                : r?.azienda || r?.agente || "Appuntamento";
            const title = `${hhmm(startDt)} · ${coreTitle}`;
            // =============================================================

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
          })
          .filter(Boolean);

        setEvents(mapped);
      } catch (e) {
        setErrorMsg(String(e?.message || e));
        setEvents([]);
      } finally {
        setLoading(false);
      }
    },
    [agents.length]
  );

  // Ricarica quando cambiano range o agente
  useEffect(() => {
    loadEvents(currentRange.start, currentRange.end, agent);
  }, [currentRange, agent, loadEvents]);

  // Stile per stato
  const eventPropGetter = useMemo(() => {
    return (event) => {
      const stato = event?.resource?.stato?.toLowerCase?.() || "";
      let bg = event?.backgroundColor || "#2563eb";
      if (stato.includes("annull")) bg = "#dc2626";
      else if (stato.includes("svolt")) bg = "#16a34a";
      else if (stato.includes("programm")) bg = "#f59e0b";
      return {
        style: {
          backgroundColor: bg,
          color: "white",
          borderRadius: 6,
          border: 0,
        },
      };
    };
  }, []);

  // Piccola legenda con i colori degli agenti (in base agli eventi caricati)
  const legendAgents = useMemo(() => {
    const names = [...new Set(events.map((e) => e?.resource?.agente).filter(Boolean))].sort(
      (a, b) => String(a).localeCompare(String(b), "it")
    );
    return names.map((name) => ({
      name,
      color: colorForAgent(name),
    }));
  }, [events]);

  return (
    <div className="p-4 space-y-4">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold">Calendario</h1>

        <div className="flex items-center gap-3">
          {/* Select agente */}
          <label className="text-sm">
            Agente:&nbsp;
            <select
              value={agent}
              onChange={(e) => setAgent(e.target.value)}
              className="rounded-md border border-gray-300 px-2 py-1 text-sm"
            >
              <option value="tutti">Tutti</option>
              {agents.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>

          {/* Stato caricamento */}
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
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: a.color }}
              />
              {a.name}
            </span>
          ))}
        </div>
      )}

      {errorMsg && <div className="text-red-600 text-sm">Errore: {errorMsg}</div>}

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
          // Slot/durata
          step={30}       // 30 minuti
          timeslots={2}   // 2*30 = 1h per riga
          popup
          eventPropGetter={eventPropGetter}
          /* ======= SOLO QUESTA PROP AGGIUNTA: FORMATI ORARI ======= */
          formats={{
            eventTimeRangeFormat: ({ start, end }) => `${hhmm(start)}–${hhmm(end)}`,
            agendaTimeRangeFormat: ({ start, end }) => `${hhmm(start)}–${hhmm(end)}`,
          }}
          /* ======================================================= */
          messages={{
            agenda: "Agenda",
            day: "Giorno",
            week: "Settimana",
            month: "Mese",
            today: "Oggi",
            previous: "Indietro",
            next: "Avanti",
            showMore: (total) => `+${total} altri`,
            noEventsInRange: "Nessun evento nel periodo",
          }}
        />
      </div>
    </div>
  );
}
