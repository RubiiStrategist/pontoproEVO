// js/utils.js
export const $ = (s)=>document.querySelector(s);

export const pad2 = (n)=> String(n).padStart(2,"0");

export function nowISODate(){
  const d=new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
}
export function ymFromDate(dateStr){ return dateStr.slice(0,7); }

export function parseMoneyBr(v){
  if(v==null) return 0;
  const s = String(v).trim().replace(/\./g,"").replace(",",".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}
export function fmtBRL(n){
  try{ return n.toLocaleString("pt-BR",{style:"currency",currency:"BRL"}); }
  catch{ return "R$ " + (Math.round(n*100)/100).toFixed(2).replace(".",","); }
}

export function minutesFromHHMM(v){
  if(!v) return null;
  const [h,m]=v.split(":").map(Number);
  if(Number.isNaN(h)||Number.isNaN(m)) return null;
  return h*60 + m;
}
export function hhmmFrom4digits(s){
  if(!s) return "";
  const cleaned=String(s).trim();
  if(cleaned==="") return "";
  if(!/^\d{4}$/.test(cleaned)) return "";
  const h=Number(cleaned.slice(0,2));
  const m=Number(cleaned.slice(2,4));
  if(h>23||m>59) return "";
  return `${pad2(h)}:${pad2(m)}`;
}
export function schedule4ToMin(v){
  if(!v) return null;
  const clean=String(v).replace(/[^\d]/g,"").slice(0,4);
  if(!/^\d{4}$/.test(clean)) return null;
  const h=Number(clean.slice(0,2));
  const m=Number(clean.slice(2,4));
  if(m>59) return null;
  return h*60+m;
}
export function minTo4(min){
  min=Number(min ?? 480);
  const h=Math.floor(min/60), m=min%60;
  return `${pad2(h)}${pad2(m)}`;
}
export function fmtMin(min){
  if(min===null||min===undefined) return "—";
  const h=Math.floor(min/60), m=min%60;
  return `${h}:${pad2(m)}`;
}
export function escapeHTML(s){
  return String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
}

export function mondayOf(dateISO){
  const d = new Date(dateISO+"T00:00:00");
  const day = d.getDay();
  const diff = (day===0 ? -6 : 1-day);
  d.setDate(d.getDate()+diff);
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
}
export function addDays(dateISO, days){
  const d=new Date(dateISO+"T00:00:00");
  d.setDate(d.getDate()+days);
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
}
export function slug(s){
  return String(s||"").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu,"")
    .replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,60) || "funcionario";
}
