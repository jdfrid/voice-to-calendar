// ----- Parse helpers -----
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
  const timeMatch = t.match(/(\d{1,2}):(\d{2})/);
  if(timeMatch){ time = timeMatch[0]; }
  const locMatch = t.match(/\bב[א-ת][^ ,.\n]{0,40}/);
  if(locMatch){ location = locMatch[0]; }
  content = content.replace(/מחר|בשעה.*|ב[א-ת]+/g,"").trim();
  return {content,date,time,location};
}

function buildICS(ev){
  const pad=n=>String(n).padStart(2,'0');
  const [dd,mm,yyyy] = ev.date.split('.');
  const [hh,min] = ev.time.split(':');
  const start = new Date(yyyy,mm-1,dd,hh,min);
  const end = new Date(start.getTime()+60*60*1000);
  function fmt(d){return d.getFullYear()+pad(d.getMonth()+1)+pad(d.getDate())+'T'+pad(d.getHours())+pad(d.getMinutes())+'00';}
  return `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
SUMMARY:${ev.content}
DTSTART:${fmt(start)}
DTEND:${fmt(end)}
LOCATION:${ev.location}
END:VEVENT
END:VCALENDAR`;
}

// ----- Parse button -----
document.getElementById("btnParse").onclick=()=>{
  const txt=document.getElementById("txt").value;
  const ev=parseText(txt);
  document.getElementById("parsed").classList.remove("hidden");
  document.getElementById("outContent").textContent=ev.content;
  document.getElementById("outDate").textContent=ev.date;
  document.getElementById("outTime").textContent=ev.time;
  document.getElementById("outLocation").textContent=ev.location;
  document.getElementById("btnDownload").onclick=()=>{
    const blob=new Blob([buildICS(ev)],{type:'text/calendar'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url; a.download="event.ics"; a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
};

// ----- Recording (SpeechRecognition) -----
const srInfo = document.getElementById('srSupport');
const interimBox = document.getElementById('interimBox');
const interimText = document.getElementById('interimText');
window.SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition;
let recording = false;
const btnRecord = document.getElementById('btnRecord');
const btnParse = document.getElementById('btnParse');
const recIndicator = document.getElementById('recIndicator');

(function initSR(){
  if (!window.SpeechRecognition) {
    srInfo.textContent = "הדפדפן לא תומך בזיהוי דיבור. מומלץ Chrome עדכני ובחיבור HTTPS.";
    btnRecord.disabled = true;
    btnRecord.classList.add('opacity-60','cursor-not-allowed');
    return;
  }
  recognition = new SpeechRecognition();
  recognition.lang = "he-IL";
  recognition.interimResults = true;  // תמלול בזמן אמת
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    recording = true;
    recIndicator.classList.remove('hidden');
    interimBox.classList.remove('hidden');
    interimText.textContent = "";
    btnRecord.textContent = "⏹️ עצור";
    btnRecord.setAttribute('aria-pressed','true');
    btnRecord.classList.add('pressed');
    btnRecord.classList.remove('bg-red-600');
    btnRecord.classList.add('bg-gray-700');
    btnParse.disabled = true;
    btnParse.classList.add('opacity-60','cursor-not-allowed');
  };

  recognition.onend = () => {
    recording = false;
    recIndicator.classList.add('hidden');
    btnRecord.textContent = "🎙️ הקלט";
    btnRecord.setAttribute('aria-pressed','false');
    btnRecord.classList.remove('pressed');
    btnRecord.classList.remove('bg-gray-700');
    btnRecord.classList.add('bg-red-600');
    btnParse.disabled = false;
    btnParse.classList.remove('opacity-60','cursor-not-allowed');
    // לא מסתירים את interimBox כדי שהטקסט האחרון יישאר – אפשר להסתיר אם רוצים
  };

  recognition.onresult = (event) => {
    let live = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const res = event.results[i];
      live += res[0].transcript + " ";
      if (res.isFinal) {
        // כשהמנוע מסמן תוצאה סופית – נכניס לטקסט הראשי
        const current = document.getElementById("txt").value.trim();
        const combined = (current + " " + res[0].transcript).trim();
        document.getElementById("txt").value = combined;
      }
    }
    interimText.textContent = live.trim();
  };

  recognition.onerror = (event) => {
    alert("שגיאה בהקלטה: " + event.error);
  };
})();

btnRecord.onclick = () => {
  if (!recognition) return;
  try {
    if (!recording) { recognition.start(); }
    else { recognition.stop(); }
  } catch (e) {}
};
