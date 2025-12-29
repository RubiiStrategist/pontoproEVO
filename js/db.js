// js/db.js
import { hhmmFrom4digits } from "./utils.js";

export function createSupabaseClient(SUPABASE_URL, SUPABASE_KEY){
  if(!window.supabase) throw new Error("Supabase CDN não carregou.");
  return window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
}

export async function getSession(supabase){
  const { data } = await supabase.auth.getSession();
  return data.session || null;
}

export async function fetchEmployees(supabase){
  const { data, error } = await supabase.from("employees_v2").select("*").order("created_at",{ascending:true});
  if(error) throw error;
  return (data||[]).filter(e=>e.active!==false).map(r=>({
    id:r.id,
    name:r.name,
    role:r.role||"",
    storeId:r.store_id||"LOJA1_TAMBAU",
    payType:r.pay_type||"SALARIO",
    monthlySalary:Number(r.monthly_salary||0),
    hourlyRate:Number(r.hourly_rate||0),
    dailyScheduleMin:Number(r.daily_schedule_min||480),
    monthlyBaseMin:Number(r.monthly_base_min||13200),
  }));
}

export async function createEmployee(supabase, payload){
  const { data, error } = await supabase.from("employees_v2").insert({
    name:payload.name,
    role:payload.role,
    store_id:payload.storeId,
    pay_type:payload.payType,
    monthly_salary:payload.monthlySalary,
    hourly_rate:payload.hourlyRate,
    daily_schedule_min:payload.dailyScheduleMin,
    monthly_base_min:payload.monthlyBaseMin,
    active:true
  }).select("*").single();
  if(error) throw error;
  return data;
}

export async function updateEmployee(supabase, id, payload){
  const { error } = await supabase.from("employees_v2").update({
    name:payload.name,
    role:payload.role,
    store_id:payload.storeId,
    pay_type:payload.payType,
    monthly_salary:payload.monthlySalary,
    hourly_rate:payload.hourlyRate,
    daily_schedule_min:payload.dailyScheduleMin,
    monthly_base_min:payload.monthlyBaseMin,
  }).eq("id", id);
  if(error) throw error;
}

export async function softDeleteEmployee(supabase, id){
  const { error } = await supabase.from("employees_v2").update({ active:false }).eq("id", id);
  if(error) throw error;
}

export function entryFromRow(row, emp){
  const scheduleMin = row.schedule_min ?? emp?.dailyScheduleMin ?? 480;
  return {
    date: row.date,
    dayType: row.day_type || "NORMAL",
    in4: row.in4||"",
    b1_4: row.b1_4||"",
    b2_4: row.b2_4||"",
    out4: row.out4||"",
    noBreak: !!row.no_break,
    scheduleMin: Number(scheduleMin),
    inHHMM: hhmmFrom4digits((row.in4||"").replace(":","")),
    b1HHMM: hhmmFrom4digits((row.b1_4||"").replace(":","")),
    b2HHMM: hhmmFrom4digits((row.b2_4||"").replace(":","")),
    outHHMM: hhmmFrom4digits((row.out4||"").replace(":","")),
    obs: row.obs||""
  };
}

export async function fetchMonthEntries(supabase, emp, empId, ym){
  const start = `${ym}-01`;
  const end = `${ym}-31`;
  const { data, error } = await supabase.from("entries_v2")
    .select("*")
    .eq("employee_id", empId)
    .gte("date", start)
    .lte("date", end)
    .is("deleted_at", null);
  if(error) throw error;

  const map = {};
  for(const row of (data||[])){
    const d = Number(String(row.date).slice(8,10));
    map[d] = entryFromRow(row, emp);
  }
  return map;
}

export async function fetchRangeEntries(supabase, emp, empId, startISO, endISO){
  const { data, error } = await supabase.from("entries_v2")
    .select("*")
    .eq("employee_id", empId)
    .gte("date", startISO)
    .lte("date", endISO)
    .is("deleted_at", null);
  if(error) throw error;

  const map = {};
  for(const row of (data||[])){
    map[row.date] = entryFromRow(row, emp);
  }
  return map;
}

export async function upsertEntry(supabase, empId, dateISO, entry){
  const payload = {
    employee_id: empId,
    date: dateISO,
    day_type: entry.dayType || "NORMAL",
    in4: entry.in4 || null,
    b1_4: entry.b1_4 || null,
    b2_4: entry.b2_4 || null,
    out4: entry.out4 || null,
    no_break: !!entry.noBreak,
    schedule_min: Number(entry.scheduleMin ?? 480),
    obs: entry.obs || null,
    updated_at: new Date().toISOString()
  };
  const { error } = await supabase.from("entries_v2").upsert(payload, { onConflict: "employee_id,date" });
  if(error) throw error;
}
