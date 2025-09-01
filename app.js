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
  if(/(\d{1,2}):(\d{2})/.test(t)){
    time = t.match(/(\d{1,2}):(\d{2})/)[0];
  }
  if(/ב[א-ת]+/.test(t)){
    location = t.match(/ב[א-ת]+/)[0];
  }
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
