import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Calendar, Mic, Square, Save, Download, Trash2, Clock, MapPin, Bell, RefreshCw, Link as LinkIcon, ListChecks, PlusCircle } from "lucide-react";

const HEB_DAYS = [
  { name: "ראשון", i: 0, rrule: "SU" },
  { name: "שני", i: 1, rrule: "MO" },
  { name: "שלישי", i: 2, rrule: "TU" },
  { name: "רביעי", i: 3, rrule: "WE" },
  { name: "חמישי", i: 4, rrule: "TH" },
  { name: "שישי", i: 5, rrule: "FR" },
  { name: "שבת", i: 6, rrule: "SA" },
];

function pad(n: number) { return String(n).padStart(2, "0"); }

function formatICSDateLocal(d: Date) {
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  return `${y}${m}${day}T${hh}${mm}${ss}`;
}

function toGoogleDateRange(start: Date, end: Date) {
  const s = formatICSDateLocal(start);
  const e = formatICSDateLocal(end);
  return `${s}/${e}`;
}

function hebrewToInt(str: string) {
  const map: Record<string, number> = {
    "אחת": 1, "אחד": 1, "שתיים": 2, "שניים": 2, "שני": 2,
    "שלוש": 3, "שלושה": 3, "שלישי": 3,
    "ארבע": 4, "ארבעה": 4, "רביעי": 4,
    "חמש": 5, "חמישה": 5, "חמישי": 5,
    "שש": 6, "שישה": 6, "שישי": 6,
    "שבע": 7, "שבעה": 7, "שביעי": 7,
    "שמונה": 8, "שמיני": 8,
    "תשע": 9, "תשעה": 9, "תשיעי": 9,
    "עשר": 10, "עשרה": 10,
    "אחת-עשרה": 11, "אחת עשרה": 11,
    "שתים-עשרה": 12, "שתים עשרה": 12, "שתים-עשר": 12, "שתים עשר": 12,
  };
  if (str in map) return map[str];
  const num = parseInt(str, 10);
  return isNaN(num) ? undefined : num;
}

function nextWeekday(targetIdx: number, from = new Date()) {
  const date = new Date(from);
  const day = date.getDay();
  let diff = targetIdx - day;
  if (diff <= 0) diff += 7;
  date.setDate(date.getDate() + diff);
  return date;
}

function setTime(date: Date, h = 9, m = 0) {
  const d = new Date(date);
  d.setHours(h, m, 0, 0);
  return d;
}

function add(d: Date, value: number, unit: "minutes"|"hours"|"days"|"weeks"|"months"|"years") {
  const dt = new Date(d);
  switch (unit) {
    case "minutes": dt.setMinutes(dt.getMinutes() + value); break;
    case "hours": dt.setHours(dt.getHours() + value); break;
    case "days": dt.setDate(dt.getDate() + value); break;
    case "weeks": dt.setDate(dt.getDate() + value * 7); break;
    case "months": dt.setMonth(dt.getMonth() + value); break;
    case "years": dt.setFullYear(dt.getFullYear() + value); break;
  }
  return dt;
}

function parseTimeChunk(text: string) {
  const timeRegex = /(בשעה|שעה|ב-|ב |)(\d{1,2})([:\.](\d{2}))?\s*(בבוקר|בערב|בלילה|AM|PM)?/i;
  const m = text.match(timeRegex);
  if (!m) return null;
  let hour = parseInt(m[2], 10);
  const minute = m[4] ? parseInt(m[4], 10) : 0;
  const mer = m[5] ? m[5].toLowerCase() : "";
  if ((mer.includes("pm") || mer.includes("בערב") || mer.includes("בלילה")) && hour < 12) hour += 12;
  if (mer.includes("am") && hour === 12) hour = 0;
  return { hour, minute, raw: m[0] };
}

function parseDuration(text: string) {
  const re = /למשך\s+(\d+)\s*(דקות|דקה|שעות|שעה)/;
  const m = text.match(re);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  const unit = m[2];
  if (/שעה/.test(unit)) return n * 60;
  return n;
}

function parseReminders(text: string) {
  const results: number[] = [];
  const re = /(להזכיר\s?לי|תזכורת|ושוב|ועוד)\s*(\d+|אחת|אחד|שתיים|שלוש|שלושה|ארבע|ארבעה|חמש|חמישה|שש|שישה|שבע|שמונה|תשע|עשר)\s*(דקות|דקה|שעות|שעה|יום|ימים)\s*לפני/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const n = hebrewToInt(m[2] as string);
    const unit = m[3];
    if (n !== undefined) {
      let minutes = n;
      if (/שעה/.test(unit)) minutes = n * 60;
      if (/יום/.test(unit)) minutes = n * 60 * 24;
      results.push(minutes);
    }
  }
  return results;
}

function parseRecurrence(text: string) {
  let interval = 1;
  let freq: null | "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY" = null;
  let byday: string | null = null;

  const dayPattern = /(בכל|כל)\s*יום\s*(ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)/;
  const dayMatch = text.match(dayPattern);
  if (dayMatch) {
    freq = "WEEKLY";
    const name = dayMatch[2];
    const d = HEB_DAYS.find(x => x.name === name);
    if (d) byday = d.rrule;
  }

  const everyPattern = /כל\s*(\d+|אחת|אחד|שתיים|שלוש|שלושה|ארבע|ארבעה|חמש|חמישה|שש|שישה|שבע|שמונה|תשע|עשר|שבועיים|חודשיים)?\s*(יום|ימים|שבוע|שבועות|חודש|חודשים|שנה|שנים)?/;
  const everyMatch = text.match(everyPattern);
  if (everyMatch) {
    const rawNum = everyMatch[1];
    const unit = everyMatch[2];
    if (rawNum) {
      if (rawNum === "שבועיים") interval = 2, freq = "WEEKLY";
      else if (rawNum === "חודשיים") interval = 2, freq = "MONTHLY";
      else {
        const n = hebrewToInt(rawNum);
        if (n !== undefined) interval = n;
      }
    }
    if (!freq && unit) {
      if (/יום/.test(unit)) freq = "DAILY";
      else if (/שבוע/.test(unit)) freq = "WEEKLY";
      else if (/חודש/.test(unit)) freq = "MONTHLY";
      else if (/שנה/.test(unit)) freq = "YEARLY";
    }
  }

  if (!freq && !byday) return null;
  let r = `FREQ=${freq || "WEEKLY"}`;
  if (interval && interval !== 1) r += `;INTERVAL=${interval}`;
  if (byday) r += `;BYDAY=${byday}`;
  return r;
}

function parseLocation(text: string) {
  const zoomRe = /(זום|zoom|meet\.google|teams\.microsoft|teams|סקייפ|skype)/i;
  if (zoomRe.test(text)) {
    const urlMatch = text.match(/https?:\/\/\S+/i);
    return urlMatch ? urlMatch[0] : "Zoom/Meet/Teams";
  }
  const addrRe = /(ברח׳|ברח'|ברחוב|בשדרות|בסמטת|בכיכר|ברח\s|בכתובת|במשרד|בבית|במרפאה|במסעדת|במסעדה|בבית\sכנסת|בבית כנסת|באולם)\s+([^,\.\n]+(\s*\d+)?)?/;
  const m = text.match(addrRe);
  if (m) return m[0].replace(/^ב/, "").trim();
  const bRe = /\bב(?:-|\s)([\u0590-\u05FFA-Za-z0-9][^,\n]{1,40})/;
  const m2 = text.match(bRe);
  if (m2) return m2[1].trim();
  return "";
}

function stripKnownPhrases(text: string, parts: any) {
  let t = text;
  const removeList: string[] = [];
  if (parts.time && parts.time.raw) removeList.push(parts.time.raw);
  if (parts.durationRaw) removeList.push(parts.durationRaw);
  if (parts.recurrenceRaw) removeList.push(parts.recurrenceRaw);
  if (parts.reminderRaws) removeList.push(...parts.reminderRaws);
  if (parts.dateRaw) removeList.push(parts.dateRaw);
  if (parts.location && parts.location.length) removeList.push(parts.location);
  removeList.push("להזכיר לי", "תזכורת", "כל שבוע", "כל שבועיים", "כל חודש", "כל יום", "כל שנה");
  for (const r of removeList) {
    if (!r) continue;
    const esc = r.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    t = t.replace(new RegExp(esc, "g"), "");
  }
  return t.replace(/\s{2,}/g, " ").trim();
}

function parseHebrewDate(text: string, now = new Date()) {
  const todayRe = /\b(היום)\b/;
  if (todayRe.test(text)) return { date: new Date(now), raw: "היום" };

  const tmwRe = /\b(מחר|מחר בבוקר|מחר בערב|מחרתיים)\b/;
  const tmwM = text.match(tmwRe);
  if (tmwM) {
    if (tmwM[1].includes("מחרתיים")) {
      const d = new Date(now); d.setDate(d.getDate() + 2); return { date: d, raw: tmwM[1] };
    }
    const d = new Date(now); d.setDate(d.getDate() + 1); return { date: d, raw: tmwM[1] };
  }

  const weekdayRe = /(ביום\s+)?(ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)(\s+הבא)?/;
  const wd = text.match(weekdayRe);
  if (wd) {
    const dayName = wd[2];
    const d = HEB_DAYS.find(x => x.name === dayName);
    if (d) {
      const base = wd[3] ? add(now, 1, "weeks") : now;
      const res = nextWeekday(d.i, base);
      return { date: res, raw: wd[0] };
    }
  }

  const inRe = /בעוד\s+(\d+)\s*(יום|ימים|שבוע|שבועות|חודש|חודשים|שנה|שנים)/;
  const inM = text.match(inRe);
  if (inM) {
    const n = parseInt(inM[1], 10);
    const unit = inM[2];
    let u: "days"|"weeks"|"months"|"years" = "days";
    if (/שבוע/.test(unit)) u = "weeks";
    else if (/חודש/.test(unit)) u = "months";
    else if (/שנה/.test(unit)) u = "years";
    return { date: add(now, n, u), raw: inM[0] };
  }

  const dateSlash = /(\d{1,2})[\/.](\d{1,2})(?:[\/.](\d{2,4}))?/;
  const dm = text.match(dateSlash);
  if (dm) {
    const d = parseInt(dm[1], 10);
    const m = parseInt(dm[2], 10) - 1;
    const y = dm[3] ? (dm[3].length === 2 ? 2000 + parseInt(dm[3]) : parseInt(dm[3])) : now.getFullYear();
    return { date: new Date(y, m, d), raw: dm[0] };
  }

  const months: Record<string, number> = {
    "ינואר": 0, "פברואר": 1, "מרץ": 2, "אפריל": 3, "מאי": 4, "יוני": 5,
    "יולי": 6, "אוגוסט": 7, "ספטמבר": 8, "אוקטובר": 9, "נובמבר": 10, "דצמבר": 11,
  };
  const monthRe = new RegExp(`(\\d{1,2})?\\s*(${Object.keys(months).join("|")})(?:\\s*(\\d{4}))?`);
  const mm = text.match(monthRe);
  if (mm) {
    const day = mm[1] ? parseInt(mm[1], 10) : now.getDate();
    const mo = months[mm[2]];
    const yr = mm[3] ? parseInt(mm[3], 10) : now.getFullYear();
    return { date: new Date(yr, mo, day), raw: mm[0] };
  }

  return null;
}

function buildICS({ title, description, start, end, location, reminders = [], rrule = null, uid = undefined } : any) {
  const dtstamp = formatICSDateLocal(new Date());
  const dtstart = formatICSDateLocal(start);
  const dtend = formatICSDateLocal(end);
  const _uid = uid || `${Date.now()}@voice-to-cal.local`;

  let ics = `BEGIN:VCALENDAR\nVERSION:2.0\nCALSCALE:GREGORIAN\nMETHOD:PUBLISH\nBEGIN:VEVENT\nUID:${_uid}\nDTSTAMP:${dtstamp}\nDTSTART:${dtstart}\nDTEND:${dtend}\nSUMMARY:${escapeICS(title)}\nDESCRIPTION:${escapeICS(description || "")}\n`;
  if (location) ics += `LOCATION:${escapeICS(location)}\n`;
  if (rrule) ics += `RRULE:${rrule}\n`;
  reminders.forEach((mins: number) => {
    ics += `BEGIN:VALARM\nACTION:DISPLAY\nDESCRIPTION:Reminder\nTRIGGER:-PT${Math.max(0, mins)}M\nEND:VALARM\n`;
  });
  ics += `END:VEVENT\nEND:VCALENDAR`;
  return ics;
}

function escapeICS(s: string) {
  return (s || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/, /g, ",").replace(/;/g, "\\;");
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function buildGoogleCalendarUrl({ title, details, start, end, location } : any) {
  const base = "https://calendar.google.com/calendar/render?action=TEMPLATE";
  const params = new URLSearchParams();
  params.set("text", title || "");
  params.set("dates", toGoogleDateRange(start, end));
  if (location) params.set("location", location);
  if (details) params.set("details", details);
  return `${base}&${params.toString()}`;
}

function useSpeechRecognition({ lang = "he-IL" } = {}) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const recRef = useRef<any>(null);

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SR) {
      setSupported(true);
      const rec = new SR();
      rec.lang = lang;
      rec.interimResults = true;
      rec.continuous = true;
      rec.maxAlternatives = 1;
      recRef.current = rec;

      rec.onresult = (e: any) => {
        let t = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          t += e.results[i][0].transcript + " ";
        }
        setTranscript((prev) => (prev + " " + t).trim());
      };
      rec.onend = () => setListening(false);
      rec.onerror = () => setListening(false);
    }
  }, [lang]);

  const start = () => {
    if (!recRef.current) return;
    setTranscript("");
    setListening(true);
    try { recRef.current.start(); } catch {}
  };

  const stop = () => {
    if (!recRef.current) return;
    try { recRef.current.stop(); } catch {}
  };

  return { supported, listening, transcript, start, stop, setTranscript };
}

const defaultDurationMin = 60;

export default function App() {
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<any>(null);
  const [entries, setEntries] = useState<any[]>(() => {
    try {
      const raw = localStorage.getItem("vtc_entries");
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });

  const { supported, listening, transcript, start, stop, setTranscript } = useSpeechRecognition({ lang: "he-IL" });

  useEffect(() => {
    if (transcript) setText(transcript);
  }, [transcript]);

  useEffect(() => {
    localStorage.setItem("vtc_entries", JSON.stringify(entries));
  }, [entries]);

  function handleParse() {
    const now = new Date();
    const parts: any = { reminderRaws: [] };

    const dateRes = parseHebrewDate(text, now);
    let date = dateRes ? new Date(dateRes.date) : new Date(now);
    if (dateRes) parts.dateRaw = dateRes.raw;

    const time = parseTimeChunk(text);
    parts.time = time;
    let hour = 9, minute = 0;
    if (time) { hour = time.hour; minute = time.minute; }
    let startD = setTime(date, hour, minute);

    let durationMin = parseDuration(text) || defaultDurationMin;
    parts.durationRaw = parseDuration(text) ? text.match(/למשך\s+[^\s]+\s*(דקות|דקה|שעות|שעה)/)?.[0] : null;
    let endD = add(startD, durationMin, "minutes");

    const location = parseLocation(text);

    const reminders = parseReminders(text);
    const reminderRawRe = /(להזכיר\s?לי|תזכורת|ושוב|ועוד)\s*[^\n]+?\s*לפני/g;
    const raws = text.match(reminderRawRe) || [];
    parts.reminderRaws = raws;

    const rrule = parseRecurrence(text);
    parts.recurrenceRaw = rrule ? (text.match(/כל[^\n]{0,20}/)?.[0] || "כל ...") : null;

    const content = stripKnownPhrases(text, { ...parts, location });

    const result = {
      id: crypto && "randomUUID" in crypto ? (crypto as any).randomUUID() : String(Date.now()),
      content: content || text || "תזכורת חדשה",
      start: startD,
      end: endD,
      location: location || "",
      reminders,
      rrule: rrule || null,
      sourceText: text,
      durationMin,
    };
    setParsed(result);
  }

  function handleSave() {
    if (!parsed) return;
    setEntries(prev => [parsed, ...prev]);
    setParsed(null);
    setText("");
    setTranscript("");
  }

  function handleDelete(id: string) {
    setEntries(prev => prev.filter(e => e.id !== id));
  }

  function updateParsedField(key: string, value: any) {
    setParsed((prev: any) => ({ ...prev, [key]: value }));
  }

  const ParsedEditor = () => {
    if (!parsed) return null;
    const startISO = new Date(parsed.start);
    const endISO = new Date(parsed.end);

    const onDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const [y, m, d] = e.target.value.split("-").map(Number);
      const cur = new Date(parsed.start);
      const newStart = new Date(y, m - 1, d, cur.getHours(), cur.getMinutes());
      const delta = (new Date(parsed.end)).getTime() - (new Date(parsed.start)).getTime();
      const newEnd = new Date(newStart.getTime() + delta);
      updateParsedField("start", newStart);
      updateParsedField("end", newEnd);
    };

    const onTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const [hh, mm] = e.target.value.split(":").map(Number);
      const cur = new Date(parsed.start);
      const newStart = new Date(cur);
      newStart.setHours(hh, mm, 0, 0);
      const delta = (new Date(parsed.end)).getTime() - (new Date(parsed.start)).getTime();
      const newEnd = new Date(newStart.getTime() + delta);
      updateParsedField("start", newStart);
      updateParsedField("end", newEnd);
    };

    const onDurationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const minutes = parseInt(e.target.value || "60", 10);
      const newEnd = add(parsed.start, minutes, "minutes");
      updateParsedField("end", newEnd);
      updateParsedField("durationMin", minutes);
    };

    const addReminder = () => {
      const val = prompt("דקות לפני האירוע:");
      const mins = parseInt((val || "").trim(), 10);
      if (!isNaN(mins)) updateParsedField("reminders", [...(parsed.reminders||[]), mins]);
    };

    const removeReminder = (idx: number) => {
      const arr = [...(parsed.reminders||[])];
      arr.splice(idx, 1);
      updateParsedField("reminders", arr);
    };

    return (
      <div className="w-full max-w-3xl mx-auto bg-white/80 backdrop-blur rounded-2xl shadow p-5 space-y-4 border" dir="rtl">
        <div className="grid gap-3">
          <label className="text-sm">תוכן</label>
          <input className="border rounded-xl px-3 py-2" value={parsed.content}
                 onChange={e => updateParsedField("content", e.target.value)} placeholder="כותרת/תיאור קצר" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
          <div>
            <label className="text-sm">תאריך</label>
            <input type="date" className="border rounded-xl px-3 py-2 w-full"
                   value={`${startISO.getFullYear()}-${String(startISO.getMonth()+1).padStart(2,"0")}-${String(startISO.getDate()).padStart(2,"0")}`}
                   onChange={onDateChange} />
          </div>
          <div>
            <label className="text-sm">שעה</label>
            <input type="time" className="border rounded-xl px-3 py-2 w-full"
                   value={`${String(startISO.getHours()).padStart(2,"0")}:${String(startISO.getMinutes()).padStart(2,"0")}`}
                   onChange={onTimeChange} />
          </div>
          <div>
            <label className="text-sm">משך (דקות)</label>
            <input type="number" min={5} step={5} className="border rounded-xl px-3 py-2 w-full"
                   value={parsed.durationMin || 60}
                   onChange={onDurationChange} />
          </div>
          <div>
            <label className="text-sm">חזרתיות (RRULE)</label>
            <input className="border rounded-xl px-3 py-2 w-full" placeholder="FREQ=WEEKLY;INTERVAL=2"
                   value={parsed.rrule || ""}
                   onChange={e => updateParsedField("rrule", e.target.value || null)} />
          </div>
        </div>
        <div className="grid gap-3">
          <label className="text-sm">מקום</label>
          <input className="border rounded-xl px-3 py-2" value={parsed.location}
                 onChange={e => updateParsedField("location", e.target.value)} placeholder="כתובת / קישור" />
        </div>
        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm">תזכורות (דקות לפני)</span>
            <button onClick={addReminder} className="flex items-center gap-1 text-blue-700 hover:underline"><PlusCircle size={16}/>הוסף</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {(parsed.reminders||[]).length === 0 && <span className="text-gray-500 text-sm">אין</span>}
            {(parsed.reminders||[]).map((m: number, i: number) => (
              <span key={i} className="inline-flex items-center gap-2 bg-blue-50 border border-blue-200 text-blue-800 rounded-full px-3 py-1 text-sm">
                {m} דק׳ לפני
                <button onClick={() => removeReminder(i)} className="text-red-600">×</button>
              </span>
            ))}
          </div>
        </div>
        <div className="flex gap-2 justify-end pt-2">
          <button onClick={handleSave} className="bg-green-600 text-white rounded-xl px-4 py-2 flex items-center gap-2 shadow">
            <Save size={18}/> שמור רשומה
          </button>
        </div>
      </div>
    );
  };

  const EntryCard = ({ item }: { item: any }) => {
    const ics = useMemo(() => buildICS({
      title: item.content,
      description: item.sourceText || item.content,
      start: new Date(item.start),
      end: new Date(item.end),
      location: item.location,
      reminders: item.reminders,
      rrule: item.rrule,
      uid: item.id,
    }), [item]);

    const gUrl = useMemo(() => buildGoogleCalendarUrl({
      title: item.content,
      details: (item.sourceText || item.content),
      start: new Date(item.start),
      end: new Date(item.end),
      location: item.location,
    }), [item]);

    return (
      <div className="border rounded-2xl p-4 bg-white shadow-sm" dir="rtl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold">{item.content}</div>
            <div className="text-sm text-gray-600 flex flex-wrap gap-x-4 gap-y-1 mt-1">
              <span className="inline-flex items-center gap-1"><Clock size={14}/> {new Date(item.start).toLocaleString("he-IL")}</span>
              <span>→ {new Date(item.end).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}</span>
              {item.location && <span className="inline-flex items-center gap-1"><MapPin size={14}/> {item.location}</span>}
              {(item.reminders||[]).length>0 && <span className="inline-flex items-center gap-1"><Bell size={14}/> {item.reminders.join(", ")} דק׳ לפני</span>}
              {item.rrule && <span className="inline-flex items-center gap-1"><RefreshCw size={14}/> {item.rrule}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => downloadText(`${item.content || "event"}.ics`, ics)} className="px-3 py-2 rounded-xl border bg-gray-50 hover:bg-gray-100 flex items-center gap-1"><Download size={16}/> הורד ICS</button>
            <a href={gUrl} target="_blank" rel="noreferrer" className="px-3 py-2 rounded-xl border bg-blue-50 hover:bg-blue-100 text-blue-900 flex items-center gap-1"><LinkIcon size={16}/> הוסף לגוגל</a>
            <button onClick={() => handleDelete(item.id)} className="px-3 py-2 rounded-xl border bg-red-50 hover:bg-red-100 text-red-700 flex items-center gap-1"><Trash2 size={16}/> מחק</button>
          </div>
        </div>
        {item.sourceText && (
          <div className="mt-2 text-sm text-gray-700">
            <div className="font-medium">טקסט מקורי:</div>
            <div className="bg-gray-50 rounded-xl p-2 whitespace-pre-wrap">{item.sourceText}</div>
          </div>
        )}
      </div>
    );
  };

  const [recMedia, setRecMedia] = useState<MediaRecorder | null>(null);
  const [recording, setRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState("");

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      mr.ondataavailable = (e) => chunks.push(e.data);
      mr.onstop = () => {
        const blob = new Blob(chunks, { type: "audio/webm" });
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
      };
      mr.start();
      setRecMedia(mr);
      setRecording(true);
    } catch (e) {
      alert("אין הרשאת מיקרופון או שהדפדפן לא תומך בהקלטה.");
    }
  }
  function stopRecording() {
    if (recMedia && recMedia.state !== "inactive") recMedia.stop();
    setRecording(false);
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 to-slate-200 p-6" dir="rtl">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Calendar />
            <h1 className="text-2xl font-bold">אפליקציית הקלטה → תזכורת/יומן</h1>
          </div>
        </header>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid md:grid-cols-2 gap-6">
          <div className="bg-white/80 backdrop-blur rounded-2xl shadow p-5 space-y-4 border">
            <div className="text-sm text-gray-600">הקלטה ישירה עם זיהוי דיבור (אם נתמך בדפדפן):</div>
            <div className="flex items-center gap-2">
              {!listening ? (
                <button onClick={start} className="px-4 py-2 rounded-xl bg-emerald-600 text-white flex items-center gap-2 shadow"><Mic size={18}/> התחל זיהוי</button>
              ) : (
                <button onClick={stop} className="px-4 py-2 rounded-xl bg-red-600 text-white flex items-center gap-2 shadow"><Square size={18}/> עצור</button>
              )}
              {!supported && <span className="text-xs text-red-600">הדפדפן לא תומך ב-SpeechRecognition. הזן טקסט ידנית.</span>}
            </div>

            <div className="h-px bg-gray-200"/>

            <div className="text-sm text-gray-600">הקלטת אודיו (לשמירה מקומית):</div>
            <div className="flex items-center gap-2">
              {!recording ? (
                <button onClick={startRecording} className="px-4 py-2 rounded-xl bg-indigo-600 text-white flex items-center gap-2 shadow"><Mic size={18}/> התחל הקלטה</button>
              ) : (
                <button onClick={stopRecording} className="px-4 py-2 rounded-xl bg-red-600 text-white flex items-center gap-2 shadow"><Square size={18}/> עצור הקלטה</button>
              )}
              {audioUrl && <audio src={audioUrl} controls className="mt-2" />}
            </div>
          </div>

          <div className="bg-white/80 backdrop-blur rounded-2xl shadow p-5 space-y-3 border">
            <div className="text-sm text-gray-600">טקסט ההודעה (אפשר לדבר למעלה או להקליד כאן):</div>
            <textarea value={text} onChange={e => setText(e.target.value)} rows={8} className="w-full border rounded-2xl p-3" placeholder="לדוגמה: ביום שלישי הבא בשעה 10 פגישה עם דוד בהרצל 12, להזכיר לי שעה לפני, כל שבועיים"/>
            <div className="flex justify-between items-center">
              <button onClick={handleParse} className="px-4 py-2 rounded-xl bg-blue-600 text-white flex items-center gap-2 shadow"><ListChecks size={18}/> נתח</button>
              <div className="text-xs text-gray-500">אזור זמן: Asia/Jerusalem</div>
            </div>
          </div>
        </motion.div>

        {parsed && (
          <div className="w-full max-w-3xl mx-auto bg-white/80 backdrop-blur rounded-2xl shadow p-5 space-y-4 border" dir="rtl">
            <div className="grid gap-3">
              <label className="text-sm">תוכן</label>
              <input className="border rounded-xl px-3 py-2" value={parsed.content}
                    onChange={e => setParsed({ ...parsed, content: e.target.value })} placeholder="כותרת/תיאור קצר" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
              <div>
                <label className="text-sm">תאריך</label>
                <input type="date" className="border rounded-xl px-3 py-2 w-full"
                      value={`${new Date(parsed.start).getFullYear()}-${String(new Date(parsed.start).getMonth()+1).padStart(2,"0")}-${String(new Date(parsed.start).getDate()).padStart(2,"0")}`}
                      onChange={(e) => {
                        const [y,m,d] = e.target.value.split("-").map(Number);
                        const cur = new Date(parsed.start);
                        const newStart = new Date(y, m-1, d, cur.getHours(), cur.getMinutes());
                        const delta = new Date(parsed.end).getTime() - new Date(parsed.start).getTime();
                        const newEnd = new Date(newStart.getTime() + delta);
                        setParsed({ ...parsed, start: newStart, end: newEnd });
                      }} />
              </div>
              <div>
                <label className="text-sm">שעה</label>
                <input type="time" className="border rounded-xl px-3 py-2 w-full"
                      value={`${String(new Date(parsed.start).getHours()).padStart(2,"0")}:${String(new Date(parsed.start).getMinutes()).padStart(2,"0")}`}
                      onChange={(e) => {
                        const [hh,mm] = e.target.value.split(":").map(Number);
                        const cur = new Date(parsed.start);
                        const newStart = new Date(cur);
                        newStart.setHours(hh, mm, 0, 0);
                        const delta = new Date(parsed.end).getTime() - new Date(parsed.start).getTime();
                        const newEnd = new Date(newStart.getTime() + delta);
                        setParsed({ ...parsed, start: newStart, end: newEnd });
                      }} />
              </div>
              <div>
                <label className="text-sm">משך (דקות)</label>
                <input type="number" min={5} step={5} className="border rounded-xl px-3 py-2 w-full"
                      value={parsed.durationMin || 60}
                      onChange={(e) => {
                        const minutes = parseInt(e.target.value || "60", 10);
                        const newEnd = add(parsed.start, minutes, "minutes");
                        setParsed({ ...parsed, end: newEnd, durationMin: minutes });
                      }} />
              </div>
              <div>
                <label className="text-sm">חזרתיות (RRULE)</label>
                <input className="border rounded-xl px-3 py-2 w-full" placeholder="FREQ=WEEKLY;INTERVAL=2"
                      value={parsed.rrule || ""}
                      onChange={e => setParsed({ ...parsed, rrule: e.target.value || null })} />
              </div>
            </div>
            <div className="grid gap-3">
              <label className="text-sm">מקום</label>
              <input className="border rounded-xl px-3 py-2" value={parsed.location}
                    onChange={e => setParsed({ ...parsed, location: e.target.value })} placeholder="כתובת / קישור" />
            </div>
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <span className="text-sm">תזכורות (דקות לפני)</span>
                <button onClick={() => {
                  const val = prompt("דקות לפני האירוע:");
                  const mins = parseInt((val || "").trim(), 10);
                  if (!isNaN(mins)) setParsed({ ...parsed, reminders: [...(parsed.reminders||[]), mins] });
                }} className="flex items-center gap-1 text-blue-700 hover:underline"><PlusCircle size={16}/>הוסף</button>
              </div>
              <div className="flex flex-wrap gap-2">
                {(parsed.reminders||[]).length === 0 && <span className="text-gray-500 text-sm">אין</span>}
                {(parsed.reminders||[]).map((m: number, i: number) => (
                  <span key={i} className="inline-flex items-center gap-2 bg-blue-50 border border-blue-200 text-blue-800 rounded-full px-3 py-1 text-sm">
                    {m} דק׳ לפני
                    <button onClick={() => {
                      const arr = [...(parsed.reminders||[])]; arr.splice(i,1);
                      setParsed({ ...parsed, reminders: arr });
                    }} className="text-red-600">×</button>
                  </span>
                ))}
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button onClick={() => {
                setEntries(prev => [parsed, ...prev]);
                setParsed(null);
                setText("");
              }} className="bg-green-600 text-white rounded-xl px-4 py-2 flex items-center gap-2 shadow">
                <Save size={18}/> שמור רשומה
              </button>
            </div>
          </div>
        )}

        <section className="space-y-3">
          <h2 className="text-xl font-semibold flex items-center gap-2"><Calendar/> רשומות שנוצרו</h2>
          {entries.length === 0 && <div className="text-gray-600">עדיין אין רשומות.</div>}
          <div className="grid gap-3">
            {entries.map(e => <EntryCard key={e.id} item={e} />)}
          </div>
        </section>

        <footer className="text-xs text-gray-500 py-8">
          גרסת MVP. תומך בביטויים נפוצים בעברית: ימים (ראשון-שבת), "שלישי הבא", "היום/מחר/מחרתיים", שעות ("בשעה 9", "14:30"),
          תזכורות ("להזכיר לי 30 דקות לפני"), חזרתיות ("כל שבוע", "כל שבועיים", "כל חודש", "בכל יום שני").
          ניתן לערוך הכל ידנית לפני שמירה. ייבוא ליומן דרך קובץ ICS או קישור ל-Google Calendar.
        </footer>
      </div>
    </div>
  );
}
