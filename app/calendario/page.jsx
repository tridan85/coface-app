"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

/* ============== Helpers base ============== */
function toISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
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
const SLOT_MINUTES = 60;   // durata appuntamento
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

/* ====== Normalizzazione & Fuzzy-matching agenti ====== */
function toTitleCase(s = "") {
  return s
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/\b\p{L}/gu, (m) => m.toUpperCase());
}
function keyCI(s = "") {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}
function levenshtein(a = "", b = "") {
  a = a.toLowerCase(); b = b.toLowerCase();
  const dp = Array.from({ length: a.length + 1 }, (_, i) =>
    Array(b.length + 1).fill(0)
  );
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[a.length][b.length];
}
function canonicalizeAgent(input, knownAgents, fuzzyMaxDistance = 2) {
  const raw = (input || "").trim();
  if (!raw) return "";
  const k = keyCI(raw);
  const dict = new Map((knownAgents || []).map((n) => [keyCI(n), toTitleCase(n)]));
  if (dict.has(k)) return dict.get(k);

  let best = null, bestDist = Infinity;
  for (const [lk, canon] of dict.entries()) {
    const dist = levenshtein(k, lk);
    if (dist < bestDist) { bestDist = dist; best = canon; }
  }
  if (best && bestDist <= fuzzyMaxDistance) return best;

  return toTitleCase(raw);
}

/* ============== Pagina Calendario ============== */
export default function CalendarioPage() {
  const [events, setEvents] = useState([]);
  const [view, setView] = useState(Views.WEEK);
  const [date, setDate] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");

  // Lista agenti completa (da appointments, con paginazione)
  const [allAgents, setAllAgents] = useState([]);
  const allAgentsRef = useRef([]);
  useEffect(() => { allAgentsRef.current = allAgents; }, [allAgents]);

  // ✅ Lista agenti ATTIVI (da tabella master `agenti`, se esiste)
  const [activeAgents, setActiveAgents] = useState([]);
  const activeAgentsRef = useRef([]);
  useEffect(() => { activeAgentsRef.current = activeAgents; }, [activeAgents]);

  // dropdown agente
  const [agent, setAgent] = useState("tutti");

  // loading “gentile”
  const [showLoading, setShowLoading] = useState(false);
  useEffect(() => {
    if (!loading) { setShowLoading(false); return; }
    const t = setTimeout(() => setShowLoading(true), 200);
    return () => clearTimeout(t);
  }, [loading]);

  // Modale condiviso
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

  /* --------- Carica TUTTI gli agenti (paginando) --------- */
  useEffect(() => {
    (async () => {
      try {
        const PAGE = 1000;
        let from = 0;
        const seen = new Map();
        while (true) {
          const to = from + PAGE - 1;
          const { data, error } = await supabase
            .from("appointments")
            .select("agente")
            .not("agente", "is", null)
            .neq("agente", "")
            .order("agente", { ascending: true })
            .range(from, to);

          if (error) throw error;
          if (!data || data.length === 0) break;

          for (const r of data) {
            const t = toTitleCase(r.agente || "");
            if (!t) continue;
            const k = keyCI(t);
            if (!seen.has(k)) seen.set(k, t);
          }

          if (data.length < PAGE) break;
          from = to + 1;
        }
        const full = [...seen.values()].sort((a, b) => a.localeCompare(b, "it"));
        setAllAgents(full);
      } catch (e) {
        setErrorMsg(`Errore agenti: ${e?.message || e}`);
      }
    })();
  }, []);

  /* --------- Carica AGENTI ATTIVI da tabella master `agenti` (se esiste) --------- */
  useEffect(() => {
    (async () => {
      try {
        // tentativo 1: colonna `nome`
        let { data, error } = await supabase
          .from("agenti")
          .select("nome")
          .order("nome", { ascending: true });

        // tentativo 2: colonna alternativa `agente`
        if (error || !data) {
          const alt = await supabase
            .from("agenti")
            .select("agente")
            .order("agente", { ascending: true });
          data = alt.data; error = alt.error;
        }

        if (error || !data) {
          setActiveAgents([]); // fallback: nessun filtro
          return;
        }

        const seen = new Map();
        for (const r of data) {
          const raw = r?.nome ?? r?.agente ?? "";
          const canon = toTitleCase(raw || "");
          if (!canon) continue;
          const k = keyCI(canon);
          if (!seen.has(k)) seen.set(k, canon);
        }
        setActiveAgents([...seen.values()]);
      } catch {
        setActiveAgents([]); // fallback
      }
    })();
  }, []);

  /* --------- Eventi per intervallo --------- */
  const loadEvents = useCallback(async (start, end, currentAgent) => {
    setLoading(true);
    setErrorMsg("");

    const startISO = toISO(start);
    const endPlus = new Date(end); endPlus.setDate(endPlus.getDate() + 1);
    const endISO = toISO(endPlus);

    try {
      const { data, error } = await supabase
        .from("appointments")
        .select("id, data, ora, azienda, cliente, agente, operatore, stato", { count: "exact" })
        .gte("data", startISO)
        .lt("data", endISO)
        .order("data", { ascending: true })
        .order("ora", { ascending: true });

      if (error) throw error;

      // filtro agente in memoria con normalizzazione + fuzzy
      let rows = data || [];
      if (currentAgent && currentAgent !== "tutti") {
        const targetCanon = toTitleCase(currentAgent);
        rows = rows.filter((r) => {
          const canon = canonicalizeAgent(r.agente, [currentAgent, ...allAgentsRef.current]);
          return keyCI(canon) === keyCI(targetCanon);
        });
      }

      const mapped = rows
        .map((r) => {
          const startDt = buildDate(r?.data, r?.ora);
          const endDt   = endPlus1h(startDt);
          if (!startDt || !endDt) return null;

          const agentCanon = toTitleCase(r?.agente || "");
          const col = colorForAgent(agentCanon);
          const title = `${hhmm(startDt)} · ${[r?.azienda, agentCanon].filter(Boolean).join(" — ") || "Appuntamento"}`;

          return {
            id: String(r.id),
            title,
            start: startDt,
            end: endDt,
            allDay: false,
            resource: { ...r, agente: agentCanon },
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

  // Legenda agenti (filtrata sugli attivi se presenti)
  const legendAgents = useMemo(() => {
    const names = [...new Set(events.map((e) => e?.resource?.agente).filter(Boolean))];
    const base = activeAgents.length
      ? names.filter((n) => activeAgents.some((a) => keyCI(a) === keyCI(n)))
      : names;
    const sorted = base.sort((a, b) => String(a).localeCompare(String(b), "it"));
    return sorted.map((name) => ({ name, color: colorForAgent(name) }));
  }, [events, activeAgents]);

  /* --------- Disponibilità: slot per agente (no sabato/no domenica) --------- */
  const availableSlotsByDay = useMemo(() => {
    if (!agent || agent === "tutti") return {};
    const agentEvents = events.filter((e) => (e?.resource?.agente || "") === agent);

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

      const dow = day.getDay();
      if (dow === 0 || dow === 6) continue; // domenica/sabato

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
      if (slots.length) out[toISO(day)] = slots;
    }
    return out;
  }, [events, agent, currentRange]);

  // Generatore ID simile alla dashboard: "MH" + 10 caratteri base36 maiuscoli
  function makeAppointmentId() {
    return "MH" + Math.random().toString(36).slice(2, 12).toUpperCase();
  }

  /* --------- onCreate dal modale: insert su Supabase --------- */
  async function handleCreateFromModal(formValues) {
    const now = new Date();
    const datainserimento = toISO(now);
    const orainserimento = hhmm(now);

    // usa elenco ATTIVO se presente, altrimenti quello completo
    const baseList = activeAgentsRef.current.length ? activeAgentsRef.current : allAgentsRef.current;
    const agenteCanon = canonicalizeAgent(formValues.agente, baseList);

    const payload = {
      id: makeAppointmentId(), // colonna NOT NULL senza default
      data: formValues.data,
      ora: formValues.ora,
      azienda: formValues.azienda?.trim() || "",
      referente: formValues.referente?.trim() || "",
      telefono: formValues.telefono?.trim() || "",
      email: formValues.email?.trim() || "",
      piva: formValues.piva?.trim() || "",
      indirizzo: formValues.indirizzo?.trim() || "",
      citta: formValues["città"]?.trim() || "",
      provincia: formValues.provincia?.trim() || "",
      operatore: formValues.operatore?.trim() || "",
      agente: agenteCanon,
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
      idContaq: formValues.idContaq?.trim() || "",
      datainserimento,
      orainserimento,
    };

    const { error } = await supabase.from("appointments").insert(payload);
    if (error) throw error;

    return true;
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
              {(
                activeAgents.length
                  ? allAgents.filter((a) => activeAgents.some((x) => keyCI(x) === keyCI(a)))
                  : allAgents
              ).map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </label>

          {showLoading ? (
            <span className="text-sm text-gray-500">Carico gli appuntamenti…</span>
          ) : (
            <span className="text-sm text-gray-500">{events.length} eventi</span>
          )}
        </div>
      </header>

      {/* Legenda colori agenti (filtrata sugli attivi) */}
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
