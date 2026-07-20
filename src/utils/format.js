export const fmtDate=v=>new Intl.DateTimeFormat('de-DE',{day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(v+'T00:00:00'));
export const pace=(km,min)=>{const distance=Number(km)||0;const minutes=Number(min)||0;if(!distance||!minutes)return '–';const secondsPerKm=Math.round((minutes*60)/distance);return `${Math.floor(secondsPerKm/60)}:${String(secondsPerKm%60).padStart(2,'0')} /km`;};
export const daysUntil=v=>Math.max(0,Math.ceil((new Date(v+'T00:00:00')-new Date().setHours(0,0,0,0))/86400000));
export const hours=min=>{const totalMinutes=Math.max(0,Math.round(Number(min)||0));return `${Math.floor(totalMinutes/60)}:${String(totalMinutes%60).padStart(2,'0')} h`;};
