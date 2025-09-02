const pad = n => String(n).padStart(2,'0');
function toRFC3339Local(d){
  const offMin = -d.getTimezoneOffset();
  const sign = offMin >= 0 ? '+' : '-';
  const hh = pad(Math.floor(Math.abs(offMin)/60));
  const mm = pad(Math.abs(offMin)%60);
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${hh}:${mm}`;
}
function loadCfg(){ return {
  backend: localStorage.getItem('vtc_backend') || '',
  calendarId: localStorage.getItem('vtc_calendar_id') || 'primary',
  tz: localStorage.getItem('vtc_tz') || 'Asia/Jerusalem'
}; }
function saveCfg({backend, calendarId, tz}){
  if(backend!==undefined) localStorage.setItem('vtc_backend', backend);
  if(calendarId!==undefined) localStorage.setItem('vtc_calendar_id', calendarId);
  if(tz!==undefined) localStorage.setItem('vtc_tz', tz);
}
function parseText(t){
  const now = new Date();
  let content = t;
  let date = now.toLocaleDateString('he-IL');
  let time = "09:00";
  let location = "";
  if(/מחר/.test(t)){
    const d = new Date(now); d.setDate(d.getDate()+1);
    date = d.toLocaleDateString('he-IL');
  }
  const timeMatch = t.match(/(\d{1,2})[:.](\d{2})/);
  if(timeMatch){ time = timeMatch[0].replace('.',':'); }
  const locMatch = t.match(/\bב[א-ת][^ ,.\n]{0,40}/);
  if(locMatch){ location = locMatch[0]; }
  content = content.replace(/מחר|בשעה.*|ב[א-ת]+/g,"").trim();
  return {content,date,time,location};
}
function buildICS(ev){
  const [dd,mm,yyyy] = ev.date.split('.');
  const [hh,min] = ev.time.split(':');
  const start = new Date(yyyy,mm-1,dd,hh,min);
  const end = new Date(start.getTime()+60*60*1000);
  function fmtICS(d){return d.getFullYear()+pad(d.getMonth()+1)+pad(d.getDate())+'T'+pad(d.getHours())+pad(d.getMinutes())+'00';}
  const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
SUMMARY:${ev.content}
DTSTART:${fmtICS(start)}
DTEND:${fmtICS(end)}
LOCATION:${ev.location}
END:VEVENT
END:VCALENDAR`;
  return { ics, start, end };
}
const btnParse = document.getElementById('btnParse');
const btnRecord = document.getElementById('btnRecord');
const recIndicator = document.getElementById('recIndicator');
const interimBox = document.getElementById('interimBox');
const interimText = document.getElementById('interimText');
const btnSettings = document.getElementById('btnSettings');
const dlgSettings = document.getElementById('dlgSettings');
const fldBackend = document.getElementById('fldBackend');
const fldCalendarId = document.getElementById('fldCalendarId');
const fldTz = document.getElementById('fldTz');
const btnSaveSettings = document.getElementById('btnSaveSettings');
const srvStatus = document.getElementById('srvStatus');
(function init(){
  const cfg = loadCfg();
  fldBackend.value = cfg.backend;
  fldCalendarId.value = cfg.calendarId;
  fldTz.value = cfg.tz;
})();
btnSettings.onclick = () => dlgSettings.showModal();
btnSaveSettings.onclick = (e) => { e.preventDefault(); saveCfg({ backend: fldBackend.value.trim(), calendarId: fldCalendarId.value.trim(), tz: fldTz.value.trim() }); dlgSettings.close(); };
document.getElementById("btnParse").onclick=()=>{
  const txt=document.getElementById("txt").value;
  const ev=parseText(txt);
  document.getElementById("parsed").classList.remove("hidden");
  document.getElementById("outContent").textContent=ev.content;
  document.getElementById("outDate").textContent=ev.date;
  document.getElementById("outTime").textContent=ev.time;
  document.getElementById("outLocation").textContent=ev.location;
  document.getElementById("btnDownload").onclick=()=>{
    const { ics } = buildICS(ev);
    const blob=new Blob([ics],{type:'text/calendar'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url; a.download="event.ics"; a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  document.getElementById("btnBackendInsert").onclick = () => addViaBackend(ev);
};
async function addViaBackend(ev){
  const cfg = loadCfg();
  if(!cfg.backend){ alert("הזן כתובת שרת (⚙️)"); return; }
  const [dd,mm,yyyy] = ev.date.split('.');
  const [hh,min] = ev.time.split(':');
  const start = new Date(yyyy,mm-1,dd,hh,min);
  const end = new Date(start.getTime()+60*60*1000);
  const payload = {
    summary: ev.content || 'פגישה',
    location: ev.location || '',
    calendarId: cfg.calendarId || 'primary',
    timezone: cfg.tz || 'Asia/Jerusalem',
    start: toRFC3339Local(start),
    end: toRFC3339Local(end)
  };
  srvStatus.textContent = "שולח בקשה לשרת…";
  try {
    const resp = await fetch(cfg.backend.replace(/\/+$/,'') + "/add-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const json = await resp.json();
    if(!resp.ok){ throw new Error(json.error || "Request failed"); }
    srvStatus.innerHTML = `נוצר אירוע ✓ <a class="underline text-blue-700" target="_blank" rel="noreferrer" href="${json.htmlLink}">פתח ביומן</a>`;
  } catch (e) {
    srvStatus.textContent = "";
    alert("שגיאה מהשרת: " + e.message);
  }
}
window.SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition;
let recording = false;
(function initSR(){
  if (!window.SpeechRecognition) return;
  recognition = new SpeechRecognition();
  recognition.lang = "he-IL";
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  recognition.onstart = () => { recording = true; recIndicator.classList.remove('hidden'); interimBox.classList.remove('hidden'); interimText.textContent=""; btnRecord.textContent="⏹️ עצור"; btnRecord.setAttribute('aria-pressed','true'); };
  recognition.onend = () => { recording = false; recIndicator.classList.add('hidden'); btnRecord.textContent="🎙️ הקלט"; btnRecord.setAttribute('aria-pressed','false'); };
  recognition.onresult = (event) => {
    let live = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const res = event.results[i];
      live += res[0].transcript + " ";
      if (res.isFinal) {
        const cur = document.getElementById("txt").value.trim();
        document.getElementById("txt").value = (cur + " " + res[0].transcript).trim();
      }
    }
    interimText.textContent = live.trim();
  };
})();
btnRecord.onclick = () => { if(!recognition) return; try{ if(!recording) recognition.start(); else recognition.stop(); }catch(e){} };