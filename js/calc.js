// js/calc.js
import { minutesFromHHMM, fmtMin } from "./utils.js";

export function dayTypeLabel(t){
  switch(t){
    case "NORMAL": return "Normal";
    case "FOLGA": return "Folga";
    case "FALTA": return "Falta";
    case "ATESTADO": return "Atestado";
    case "FERIADO": return "Feriado";
    case "OUTRO": return "Outro";
    default: return "Normal";
  }
}

export function calcWorked(entry, emp){
  const sched = Number(entry.scheduleMin ?? emp.dailyScheduleMin ?? 480);

  if(entry.dayType === "FOLGA") return { workedMin:0, extraMin:0, bankMin:0, status:"folga", paidMin:0 };
  if(entry.dayType === "FALTA"){
    const bankMin = (emp.payType==="HORA") ? 0 : -sched;
    return { workedMin:0, extraMin:0, bankMin, status:"falta", paidMin:0 };
  }
  if(entry.dayType === "ATESTADO"){
    return { workedMin:sched, extraMin:0, bankMin:0, status:"ok", paidMin:sched };
  }

  const tin = minutesFromHHMM(entry.inHHMM);
  const tout = minutesFromHHMM(entry.outHHMM);
  if(tin===null || tout===null) return { workedMin:null, extraMin:null, bankMin:null, status:"incompleto", paidMin:0 };

  let total = tout - tin;
  if(total < 0) total += 24*60;

  let br=0;
  if(!entry.noBreak){
    const tb1 = minutesFromHHMM(entry.b1HHMM);
    const tb2 = minutesFromHHMM(entry.b2HHMM);
    if(tb1!==null && tb2!==null){
      br = tb2 - tb1;
      if(br < 0) br += 24*60;
    }
  }
  const worked = Math.max(total - br, 0);
  const extra = Math.max(worked - sched, 0);
  let bank = worked - sched;

  // ✅ REGRA: por hora não fica negativo (banco mínimo 0)
  if(emp.payType==="HORA") bank = Math.max(bank, 0);

  const status = extra>0 ? "exced" : "ok";
  return { workedMin:worked, extraMin:extra, bankMin:bank, status, paidMin:worked };
}

export function calcMonthTotals(emp, monthMap){
  const base = Number(emp.monthlyBaseMin ?? 13200); // 220h padrão
  let worked=0, faltas=0, folgas=0, incompleto=0, atestados=0;

  for(const entry of Object.values(monthMap||{})){
    const c = calcWorked(entry, emp);
    if(c.status==="folga"){ folgas++; continue; }
    if(c.status==="falta"){ faltas++; continue; }
    if(c.status==="incompleto"){ incompleto++; continue; }
    if(entry.dayType==="ATESTADO") atestados++;
    worked += c.workedMin || 0;
  }

  let bank = worked - base;
  if(emp.payType==="HORA") bank = Math.max(bank, 0);

  const overtime = Math.max(worked - base, 0);

  const valueHours = (worked/60) * (emp.hourlyRate || 0);
  const valueOvertime = (overtime/60) * (emp.hourlyRate || 0);

  let pay = 0;
  if(emp.payType==="HORA"){
    pay = valueHours; // por hora: extras já estão dentro
  }else{
    pay = (emp.monthlySalary || 0) + valueOvertime; // salário + excedente mensal
  }

  return { worked, base, overtime, bank, faltas, folgas, incompleto, atestados, pay, valueHours, valueOvertime };
}


export function statusBadge(status, dayType){
  if(dayType==="FOLGA") return `<span class="badge"><span class="dot good"></span> Folga</span>`;
  if(dayType==="FALTA") return `<span class="badge"><span class="dot bad"></span> Falta</span>`;
  if(dayType==="ATESTADO") return `<span class="badge"><span class="dot good"></span> Atest</span>`;
  if(status==="ok") return `<span class="badge"><span class="dot good"></span> OK</span>`;
  if(status==="exced") return `<span class="badge"><span class="dot warn"></span> Exced</span>`;
  if(status==="incompleto") return `<span class="badge"><span class="dot bad"></span> Falta</span>`;
  return `<span class="badge"><span class="dot"></span> —</span>`;
}

export function bankStr(min){
  if(min===null) return "—";
  return (min>=0) ? `+${fmtMin(min)}` : `-${fmtMin(Math.abs(min))}`;
}
