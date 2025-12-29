// js/ui.js
import { $, pad2, ymFromDate, mondayOf, addDays, nowISODate, fmtMin, fmtBRL, minTo4, schedule4ToMin, hhmmFrom4digits, escapeHTML, slug, parseMoneyBr } from "./utils.js";
import { dayTypeLabel, calcWorked, calcMonthTotals, statusBadge, bankStr } from "./calc.js";
import { fetchEmployees, createEmployee, updateEmployee, softDeleteEmployee, fetchMonthEntries, fetchRangeEntries, upsertEntry } from "./db.js";
import { buildReport } from "./report.js";

export function createUI({ supabase }){
  const app = $("#app");
  const page = $("#page");
  const employeeSelect = $("#employeeSelect");
  const kpis = $("#kpis");
  const toastEl = $("#toast");
  const loginModal = $("#loginModal");
  const loginEmail = $("#loginEmail");
  const loginPass = $("#loginPass");
  const loginStatus = $("#loginStatus");
  const monthPick = $("#monthPick");
  const weekPick = $("#weekPick");
  const printArea = $("#printArea");

  const state = {
    session:null,
    theme:"dark",
    employees:[],
    selectedEmpId:null,
    month:"",
    weekMonday:"",
    stores:[
      {id:"LOJA1_TAMBAU", name:"Loja 1 — Tambaú"},
      {id:"LOJA2_PALMEIRAS", name:"Loja 2 — Palmeiras"},
    ],
    monthCache:{ key:"", mapByDay:{} },
    weekCache:{ key:"", mapByDate:{} },
  };

  function themeApply(theme){ app.setAttribute("data-theme", theme); state.theme=theme; }
  function toggleTheme(){ themeApply(state.theme==="dark" ? "light" : "dark"); }

  function showToast(msg){
    toastEl.textContent = msg;
    toastEl.style.display = "block";
    clearTimeout(showToast._t);
    showToast._t = setTimeout(()=>toastEl.style.display="none", 1700);
  }

  async function doLogin(){
    loginStatus.textContent="Entrando…";
    try{
      const email=(loginEmail.value||"").trim();
      const password=loginPass.value||"";
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if(error) throw error;
      loginStatus.textContent="Logado ✅";
      showToast("Bem-vindo!");
      await boot();
    }catch(err){
      loginStatus.textContent="Erro ❌";
      showToast(err?.message || "Erro no login.");
    }
  }

  async function doLogout(){
    await supabase.auth.signOut();
    state.session=null;
    loginModal.style.display="flex";
    showToast("Saiu.");
  }

  async function loadEmployees(){
    state.employees = await fetchEmployees(supabase);
  }

  function defaultEntry(dateISO, emp){
    return {
      date: dateISO,
      dayType: "NORMAL",
      in4:"", b1_4:"", b2_4:"", out4:"",
      noBreak:false,
      scheduleMin: emp.dailyScheduleMin ?? 480,
      inHHMM:"", b1HHMM:"", b2HHMM:"", outHHMM:"",
      obs:""
    };
  }

  async function ensureMonthCache(){
    const empId = state.selectedEmpId;
    const ym = state.month;
    const key = `${empId}|${ym}`;
    if(state.monthCache.key === key) return state.monthCache.mapByDay;
    const emp = state.employees.find(e=>e.id===empId);
    const map = await fetchMonthEntries(supabase, emp, empId, ym);
    state.monthCache = { key, mapByDay: map };
    return map;
  }
  async function ensureWeekCache(){
    const empId = state.selectedEmpId;
    const mon = state.weekMonday;
    const sun = addDays(mon, 6);
    const key = `${empId}|${mon}|${sun}`;
    if(state.weekCache.key === key) return state.weekCache.mapByDate;
    const emp = state.employees.find(e=>e.id===empId);
    const map = await fetchRangeEntries(supabase, emp, empId, mon, sun);
    state.weekCache = { key, mapByDate: map };
    return map;
  }

  function renderEmployeeSelect(){
    employeeSelect.innerHTML="";
    state.employees.forEach(e=>{
      const storeName = state.stores.find(s=>s.id===e.storeId)?.name || e.storeId;
      const opt=document.createElement("option");
      opt.value=e.id;
      opt.textContent = `${e.name} • ${storeName}`;
      employeeSelect.appendChild(opt);
    });

    const persisted = localStorage.getItem("PONTOPRO_SELECTED_EMP_V2");
    const firstId = state.employees[0]?.id;
    const target = persisted && state.employees.some(e=>e.id===persisted) ? persisted : firstId;
    if(target){
      state.selectedEmpId = target;
      employeeSelect.value = target;
    }

    employeeSelect.onchange = async ()=>{
      state.selectedEmpId = employeeSelect.value;
      localStorage.setItem("PONTOPRO_SELECTED_EMP_V2", state.selectedEmpId);
      state.monthCache={key:"",mapByDay:{}};
      state.weekCache={key:"",mapByDate:{}};
      await refreshKPIs();
      currentPageRenderer?.();
    };
  }

  async function refreshKPIs(){
    const empId = state.selectedEmpId;
    if(!empId) return;
    const emp = state.employees.find(e=>e.id===empId);
    const monthMap = await ensureMonthCache();
    const t = calcMonthTotals(emp, monthMap);

    kpis.innerHTML = `
      <div class="kpi"><div class="t">Horas (mês)</div><div class="v">${fmtMin(t.worked)}</div></div>
      <div class="kpi"><div class="t">Base mensal</div><div class="v">${fmtMin(t.base)}</div></div>
      <div class="kpi"><div class="t">Excedente</div><div class="v">${fmtMin(t.overtime)}</div></div>
      <div class="kpi"><div class="t">Valor exced.</div><div class="v">${fmtBRL(t.valueOvertime)}</div></div>
      <div class="kpi"><div class="t">Prévia</div><div class="v">${fmtBRL(t.pay)}</div></div>
    `;
  }

  let currentPageRenderer=null;

  async function renderMes(){
    currentPageRenderer = renderMes;

    const empId = state.selectedEmpId;
    if(!empId){ page.innerHTML = `<h2>📅 Mês</h2><p class="sub">Crie um funcionário.</p>`; return; }
    const emp = state.employees.find(e=>e.id===empId);

    const ym = state.month;
    const monthMap = await ensureMonthCache();
    const totals = calcMonthTotals(emp, monthMap);

    page.innerHTML = `
      <h2>📅 Mês — ${ym}</h2>
      <p class="sub">Enter vai pra direita • ↑/↓ muda de dia mantendo a coluna • aceita <span class="mono">0000</span> ou <span class="mono">00:00</span></p>

      <div class="row">
        <span class="tag"><b>Trabalhadas:</b> <span class="mono">${fmtMin(totals.worked)}</span></span>
        <span class="tag"><b>Base:</b> <span class="mono">${fmtMin(totals.base)}</span></span>
        <span class="tag"><b>Excedente:</b> <span class="mono">${fmtMin(totals.overtime)}</span></span>
        <span class="tag"><b>Valor horas:</b> <span class="mono">${fmtBRL(totals.valueHours)}</span></span>
        <span class="tag"><b>Valor exced.:</b> <span class="mono">${fmtBRL(totals.valueOvertime)}</span></span>
        <span class="tag"><b>Prévia:</b> <span class="mono">${fmtBRL(totals.pay)}</span></span>
      </div>

      <div class="sep"></div>

      <table>
        <thead>
          <tr>
            <th>Dia</th><th>Tipo</th><th>Entrada</th><th>Int Ini</th><th>Int Fim</th><th>Saída</th>
            <th>Jornada</th><th>Sem int.</th><th>Trab.</th><th>Extra</th><th>Banco</th><th>Status</th><th>Ações</th>
          </tr>
        </thead>
        <tbody id="monthBody"></tbody>
      </table>
    `;

    const body = $("#monthBody");

    function focusSameCol(tr, currentEl, dir){
      const k = currentEl.getAttribute("data-k");
      const target = (dir==="up") ? tr.previousElementSibling : tr.nextElementSibling;
      if(!target) return;
      const el = target.querySelector(`[data-k="${k}"]`) || target.querySelector("input,select,textarea");
      if(el) el.focus();
    }

    function normalizeTimeInput(val){
      let v = String(val||"").trim().replace(/[^\d:]/g,"").slice(0,5);
      if(v.includes(":")){
        const parts=v.split(":");
        const a=(parts[0]||"").replace(/[^\d]/g,"").slice(0,2);
        const b=(parts[1]||"").replace(/[^\d]/g,"").slice(0,2);
        v = a + ":" + b;
        v = v.replace(":","");
      }else{
        v = v.replace(/[^\d]/g,"").slice(0,4);
      }
      return v;
    }

    function readRow(tr, base){
      const g = (k)=> tr.querySelector(`[data-k="${k}"]`)?.value || "";
      const in4 = normalizeTimeInput(g("in4"));
      const b1 = normalizeTimeInput(g("b1_4"));
      const b2 = normalizeTimeInput(g("b2_4"));
      const out4 = normalizeTimeInput(g("out4"));
      const sched4 = String(g("sched4")||"").replace(/[^\d]/g,"").slice(0,4);
      const dayType = tr.querySelector(`[data-k="dayType"]`)?.value || "NORMAL";
      const noBreak = tr.querySelector(`[data-k="noBreak"]`)?.checked || false;

      const scheduleMin = (schedule4ToMin(sched4) ?? (base.scheduleMin ?? emp.dailyScheduleMin ?? 480));

      return {
        ...base,
        dayType,
        in4, b1_4:b1, b2_4:b2, out4,
        noBreak,
        inHHMM: hhmmFrom4digits(in4),
        b1HHMM: hhmmFrom4digits(b1),
        b2HHMM: hhmmFrom4digits(b2),
        outHHMM: hhmmFrom4digits(out4),
        scheduleMin
      };
    }

    async function saveAndPaint(tr, day, base){
      const dateISO = `${ym}-${pad2(day)}`;
      const updated = readRow(tr, base);

      await upsertEntry(supabase, empId, dateISO, updated);
      monthMap[day] = updated;
      state.monthCache.mapByDay = monthMap;

      const c = calcWorked(updated, emp);
      tr.querySelector('[data-out="worked"]').textContent = fmtMin(c.workedMin);
      tr.querySelector('[data-out="extra"]').textContent = fmtMin(c.extraMin);
      tr.querySelector('[data-out="bank"]').textContent = bankStr(c.bankMin);
      tr.querySelector('[data-out="status"]').innerHTML = statusBadge(c.status, updated.dayType);

      await refreshKPIs();
      return updated;
    }

    for(let d=1; d<=31; d++){
      const dateISO = `${ym}-${pad2(d)}`;
      const base = monthMap[d] || defaultEntry(dateISO, emp);
      const c = calcWorked(base, emp);

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="mono">${pad2(d)}</td>
        <td>
          <select class="tSel" data-k="dayType">
            ${["NORMAL","FOLGA","FALTA","ATESTADO","FERIADO","OUTRO"].map(t=>{
              const sel = (base.dayType===t) ? "selected" : "";
              return `<option value="${t}" ${sel}>${dayTypeLabel(t)}</option>`;
            }).join("")}
          </select>
        </td>

        <td><input class="tIn" data-k="in4" value="${base.in4||""}" placeholder="0700" maxlength="5"></td>
        <td><input class="tIn small" data-k="b1_4" value="${base.b1_4||""}" placeholder="1100" maxlength="5"></td>
        <td><input class="tIn small" data-k="b2_4" value="${base.b2_4||""}" placeholder="1300" maxlength="5"></td>
        <td><input class="tIn" data-k="out4" value="${base.out4||""}" placeholder="1900" maxlength="5"></td>

        <td><input class="tIn" data-k="sched4" value="${minTo4(base.scheduleMin ?? emp.dailyScheduleMin)}" placeholder="0800" maxlength="4"></td>

        <td style="text-align:center"><input type="checkbox" data-k="noBreak" ${base.noBreak ? "checked":""} /></td>

        <td class="mono" data-out="worked">${fmtMin(c.workedMin)}</td>
        <td class="mono" data-out="extra">${fmtMin(c.extraMin)}</td>
        <td class="mono" data-out="bank">${bankStr(c.bankMin)}</td>
        <td data-out="status">${statusBadge(c.status, base.dayType)}</td>

        <td>
          <button class="btn tBtn" data-act="obs">📝 Obs</button>
          <button class="btn tBtn" data-act="anexo">📎</button>
        </td>
      `;

      const inputs = Array.from(tr.querySelectorAll('input[data-k], select[data-k]'));

      tr.querySelectorAll('input[data-k="in4"],input[data-k="b1_4"],input[data-k="b2_4"],input[data-k="out4"]').forEach(inp=>{
        inp.addEventListener("input", ()=>{
          inp.value = inp.value.replace(/[^\d:]/g,"").slice(0,5);
          if(inp.value.includes(":")){
            const parts = inp.value.split(":");
            const a = (parts[0]||"").replace(/[^\d]/g,"").slice(0,2);
            const b = (parts[1]||"").replace(/[^\d]/g,"").slice(0,2);
            inp.value = a + ":" + b;
          }else{
            inp.value = inp.value.replace(/[^\d]/g,"").slice(0,4);
          }
        });
      });
      tr.querySelector('input[data-k="sched4"]').addEventListener("input", (ev)=>{
        ev.target.value = ev.target.value.replace(/[^\d]/g,"").slice(0,4);
      });

      async function goSave(currentEl){
        try{
          const updated = await saveAndPaint(tr, d, base);
          Object.assign(base, updated);
        }catch(err){
          showToast(err?.message || "Erro ao salvar.");
        }
      }

      inputs.forEach((el)=>{
        el.addEventListener("keydown", async (ev)=>{
          if(ev.key==="Enter"){
            ev.preventDefault();
            await goSave(el);
            const idx = inputs.indexOf(el);
            if(idx < inputs.length-1) inputs[idx+1].focus();
            else{
              const next = tr.nextElementSibling;
              if(next){
                const first = next.querySelector('[data-k="dayType"]') || next.querySelector('input[data-k="in4"]');
                if(first) first.focus();
              }
            }
          }
          if(ev.key==="ArrowDown"){
            ev.preventDefault();
            await goSave(el);
            focusSameCol(tr, el, "down");
          }
          if(ev.key==="ArrowUp"){
            ev.preventDefault();
            await goSave(el);
            focusSameCol(tr, el, "up");
          }
        });
        el.addEventListener("blur", async ()=>{ await goSave(el); });
      });

      tr.querySelector('[data-act="obs"]').onclick = async ()=>{
        const current = monthMap[d] || base;
        const obs = prompt(`Obs do dia ${pad2(d)}:`, current.obs || "");
        if(obs===null) return;
        current.obs = obs;
        try{
          await upsertEntry(supabase, empId, dateISO, current);
          monthMap[d] = current;
          state.monthCache.mapByDay = monthMap;
          showToast("Obs salva.");
        }catch(err){
          showToast(err?.message || "Erro ao salvar obs.");
        }
      };
      tr.querySelector('[data-act="anexo"]').onclick = ()=> showToast("Anexo entra na próxima versão (Storage).");

      body.appendChild(tr);
    }
  }

  async function renderSemana(){
    currentPageRenderer = renderSemana;

    const empId = state.selectedEmpId;
    if(!empId){ page.innerHTML = `<h2>🗓️ Semana</h2><p class="sub">Crie um funcionário.</p>`; return; }
    const emp = state.employees.find(e=>e.id===empId);

    const mon = state.weekMonday;
    const sun = addDays(mon, 6);
    const map = await ensureWeekCache();

    let worked=0, bank=0, faltas=0, atest=0, folgas=0, incomplete=0;
    let pay=0;
    for(let i=0;i<7;i++){
      const dateISO = addDays(mon, i);
      const entry = map[dateISO] || defaultEntry(dateISO, emp);
      const c = calcWorked(entry, emp);
      if(c.status==="folga"){ folgas++; continue; }
      if(c.status==="falta"){ faltas++; bank += c.bankMin; continue; }
      if(c.status==="incompleto"){ incomplete++; continue; }
      if(entry.dayType==="ATESTADO") atest++;
      worked += c.workedMin || 0;
      bank += c.bankMin || 0;
      if(emp.payType==="HORA") pay += (c.paidMin||0)/60 * emp.hourlyRate;
    }

    page.innerHTML = `
      <h2>🗓️ Semana (Seg → Dom)</h2>
      <p class="sub">Período: <span class="mono">${mon}</span> até <span class="mono">${sun}</span></p>

      <div class="row">
        <span class="tag"><b>Trabalhadas:</b> <span class="mono">${fmtMin(worked)}</span></span>
        <span class="tag"><b>Banco:</b> <span class="mono">${bankStr(bank)}</span></span>
        <span class="tag"><b>Faltas:</b> <span class="mono">${faltas}</span></span>
        <span class="tag"><b>Atestados:</b> <span class="mono">${atest}</span></span>
        <span class="tag"><b>Incompletos:</b> <span class="mono">${incomplete}</span></span>
        ${emp.payType==="HORA" ? `<span class="tag"><b>Prévia (semana):</b> <span class="mono">${fmtBRL(pay)}</span></span>` : ``}
      </div>

      <div class="sep"></div>

      <table>
        <thead>
          <tr>
            <th>Data</th><th>Tipo</th><th>Entrada</th><th>Int Ini</th><th>Int Fim</th><th>Saída</th><th>Sem int.</th><th>Trab.</th><th>Banco</th><th>Status</th>
          </tr>
        </thead>
        <tbody id="weekBody"></tbody>
      </table>
    `;

    const body=$("#weekBody");

    async function saveOne(dateISO, updated){
      await upsertEntry(supabase, empId, dateISO, updated);
      map[dateISO] = updated;
      state.weekCache.mapByDate = map;
      showToast("Salvo.");
      await refreshKPIs();
    }

    for(let i=0;i<7;i++){
      const dateISO = addDays(mon, i);
      const base = map[dateISO] || defaultEntry(dateISO, emp);
      const c = calcWorked(base, emp);

      const tr=document.createElement("tr");
      tr.innerHTML = `
        <td class="mono">${dateISO}</td>
        <td>
          <select class="tSel" data-k="dayType">
            ${["NORMAL","FOLGA","FALTA","ATESTADO","FERIADO","OUTRO"].map(t=>{
              const sel = (base.dayType===t) ? "selected" : "";
              return `<option value="${t}" ${sel}>${dayTypeLabel(t)}</option>`;
            }).join("")}
          </select>
        </td>
        <td><input class="tIn" data-k="in4" value="${base.in4||""}" placeholder="0700" maxlength="5"></td>
        <td><input class="tIn small" data-k="b1_4" value="${base.b1_4||""}" placeholder="1100" maxlength="5"></td>
        <td><input class="tIn small" data-k="b2_4" value="${base.b2_4||""}" placeholder="1300" maxlength="5"></td>
        <td><input class="tIn" data-k="out4" value="${base.out4||""}" placeholder="1900" maxlength="5"></td>
        <td style="text-align:center"><input type="checkbox" data-k="noBreak" ${base.noBreak?"checked":""} /></td>
        <td class="mono" data-out="worked">${fmtMin(c.workedMin)}</td>
        <td class="mono" data-out="bank">${bankStr(c.bankMin)}</td>
        <td data-out="status">${statusBadge(c.status, base.dayType)}</td>
      `;

      tr.querySelectorAll('input[data-k="in4"],input[data-k="b1_4"],input[data-k="b2_4"],input[data-k="out4"]').forEach(inp=>{
        inp.addEventListener("input", ()=>{
          inp.value = inp.value.replace(/[^\d:]/g,"").slice(0,5);
          if(inp.value.includes(":")){
            const parts = inp.value.split(":");
            const a = (parts[0]||"").replace(/[^\d]/g,"").slice(0,2);
            const b = (parts[1]||"").replace(/[^\d]/g,"").slice(0,2);
            inp.value = a + ":" + b;
          }else{
            inp.value = inp.value.replace(/[^\d]/g,"").slice(0,4);
          }
        });
      });

      const get = (k)=> tr.querySelector(`[data-k="${k}"]`)?.value || "";
      const getBool = (k)=> tr.querySelector(`[data-k="${k}"]`)?.checked || false;

      const normalize = (v)=> String(v||"").trim().replace(/[^\d:]/g,"").slice(0,5).replace(":","").replace(/[^\d]/g,"").slice(0,4);

      const saveFn = async ()=>{
        const updated = {
          ...base,
          dayType: get("dayType") || "NORMAL",
          in4: normalize(get("in4")),
          b1_4: normalize(get("b1_4")),
          b2_4: normalize(get("b2_4")),
          out4: normalize(get("out4")),
          noBreak: getBool("noBreak"),
        };

        updated.inHHMM = hhmmFrom4digits(updated.in4);
        updated.b1HHMM = hhmmFrom4digits(updated.b1_4);
        updated.b2HHMM = hhmmFrom4digits(updated.b2_4);
        updated.outHHMM = hhmmFrom4digits(updated.out4);

        await saveOne(dateISO, updated);
        const cc = calcWorked(updated, emp);
        tr.querySelector('[data-out="worked"]').textContent = fmtMin(cc.workedMin);
        tr.querySelector('[data-out="bank"]').textContent = bankStr(cc.bankMin);
        tr.querySelector('[data-out="status"]').innerHTML = statusBadge(cc.status, updated.dayType);
      };

      tr.querySelectorAll("input,select").forEach(el=>{
        el.addEventListener("change", saveFn);
        el.addEventListener("blur", saveFn);
      });

      body.appendChild(tr);
    }
  }

  function askEmployeeForm(initial){
    const name = prompt("Nome do funcionário:", initial?.name || "");
    if(!name) return null;

    const role = prompt("Cargo (opcional):", initial?.role || "") || "";

    const storeText = prompt("Loja (digite 1 ou 2):\n1 = Tambaú\n2 = Palmeiras",
      (initial?.storeId==="LOJA2_PALMEIRAS") ? "2" : "1");
    const storeId = (String(storeText||"1").trim()==="2") ? "LOJA2_PALMEIRAS" : "LOJA1_TAMBAU";

    const payText = prompt("Pagamento (digite 1 ou 2):\n1 = Salário fixo\n2 = Por hora",
      (initial?.payType==="HORA") ? "2" : "1");
    const payType = (String(payText||"1").trim()==="2") ? "HORA" : "SALARIO";

    const dailySched4 = prompt("Jornada diária (0000) — ex: 0800", minTo4(initial?.dailyScheduleMin ?? 480));
    const dailyScheduleMin = schedule4ToMin(dailySched4) ?? 480;

    const monthlyBaseH = prompt("Base mensal (horas) — padrão 220", String((initial?.monthlyBaseMin ?? 13200)/60));
    const monthlyBaseMin = Math.max(Number(monthlyBaseH || 220) * 60, 0);

    const hourlyRate = parseMoneyBr(prompt("Valor por hora (R$) — pode ser 0 (aceita 15,50)", String(initial?.hourlyRate ?? 0)));

    let monthlySalary = initial?.monthlySalary ?? 0;
    if(payType==="SALARIO"){
      monthlySalary = parseMoneyBr(prompt("Salário mensal (R$) — pode ser 0 (aceita 2500,00)", String(initial?.monthlySalary ?? 0)));
    }else{
      monthlySalary = 0;
    }
    return { name:name.trim(), role:role.trim(), storeId, payType, monthlySalary, hourlyRate, dailyScheduleMin, monthlyBaseMin };
  }

  async function openEmployeeCreate(){
    const payload = askEmployeeForm(null);
    if(!payload) return;
    try{
      await createEmployee(supabase, payload);
      showToast("Criado.");
      await loadEmployees();
      renderEmployeeSelect();
      await renderFuncionarios();
    }catch(err){
      showToast(err?.message || "Erro ao criar.");
    }
  }

  async function openEmployeeEdit(id){
    const emp = state.employees.find(e=>e.id===id);
    if(!emp) return;
    const payload = askEmployeeForm(emp);
    if(!payload) return;
    try{
      await updateEmployee(supabase, id, payload);
      showToast("Atualizado.");
      await loadEmployees();
      renderEmployeeSelect();
      state.monthCache={key:"", mapByDay:{}};
      state.weekCache={key:"", mapByDate:{}};
      await renderFuncionarios();
      await refreshKPIs();
    }catch(err){
      showToast(err?.message || "Erro ao atualizar.");
    }
  }

  async function renderFuncionarios(){
    currentPageRenderer = renderFuncionarios;
    await loadEmployees();

    page.innerHTML = `
      <h2>👥 Funcionários</h2>
      <p class="sub">Loja, tipo de pagamento (salário/por hora), valor/hora, salário e jornada diária.</p>
      <div class="row"><button class="btn primary" id="fAdd">➕ Novo funcionário</button></div>
      <div class="sep"></div>

      <table>
        <thead><tr>
          <th>Nome</th><th>Loja</th><th>Pagamento</th><th>Jornada</th><th>Base mensal</th><th>R$/h</th><th>Salário</th><th>Ações</th>
        </tr></thead>
        <tbody>
          ${state.employees.map(e=>{
            const storeName = state.stores.find(s=>s.id===e.storeId)?.name || e.storeId;
            const payLabel = (e.payType==="HORA") ? "Por hora" : "Salário";
            return `
              <tr>
                <td><b>${escapeHTML(e.name)}</b><div style="font-size:12px;opacity:.75">${escapeHTML(e.role||"")}</div></td>
                <td>${escapeHTML(storeName)}</td>
                <td>${payLabel}</td>
                <td class="mono">${fmtMin(e.dailyScheduleMin)}</td>
                <td class="mono">${fmtMin(e.monthlyBaseMin ?? 13200)}</td>
                <td class="mono">${fmtBRL(e.hourlyRate)}</td>
                <td class="mono">${fmtBRL(e.monthlySalary)}</td>
                <td>
                  <button class="btn" data-act="sel" data-id="${e.id}">✅ Selecionar</button>
                  <button class="btn" data-act="edit" data-id="${e.id}">✏️ Editar</button>
                  <button class="btn danger" data-act="del" data-id="${e.id}">🗑️ Desativar</button>
                </td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    `;

    $("#fAdd").onclick = ()=> openEmployeeCreate();

    page.querySelectorAll("button[data-act]").forEach(btn=>{
      btn.onclick = async ()=>{
        const act=btn.getAttribute("data-act");
        const id=btn.getAttribute("data-id");

        if(act==="sel"){
          state.selectedEmpId=id;
          localStorage.setItem("PONTOPRO_SELECTED_EMP_V2", id);
          renderEmployeeSelect();
          state.monthCache={key:"", mapByDay:{}};
          state.weekCache={key:"", mapByDate:{}};
          await refreshKPIs();
          showToast("Selecionado.");
          await renderMes();
        }
        if(act==="edit") await openEmployeeEdit(id);
        if(act==="del"){
          if(!confirm("Desativar funcionário? (não apaga histórico)")) return;
          try{
            await softDeleteEmployee(supabase, id);
            showToast("Desativado.");
            await loadEmployees();
            renderEmployeeSelect();
            await renderFuncionarios();
          }catch(err){
            showToast(err?.message || "Erro ao desativar.");
          }
        }
      };
    });

    await refreshKPIs();
  }

  async function renderRelatorio(){
    currentPageRenderer = renderRelatorio;
    const empId = state.selectedEmpId;
    if(!empId){ page.innerHTML = `<h2>🧾 Relatório</h2><p class="sub">Selecione um funcionário.</p>`; return; }
    const emp = state.employees.find(e=>e.id===empId);

    page.innerHTML = `
      <h2>🧾 Relatório timbrado</h2>
      <p class="sub">Gera uma folha oficial (impressão) com dias, totais e assinatura.</p>

      <div class="row">
        <div class="field" style="flex:1 1 220px;">
          <label>Mês</label>
          <input id="repMonth" type="month" value="${state.month}">
        </div>
        <div class="field" style="flex:1 1 220px;">
          <label>Loja</label>
          <input value="${escapeHTML(state.stores.find(s=>s.id===emp.storeId)?.name || emp.storeId)}" disabled>
        </div>
      </div>

      <div class="row" style="margin-top:10px;">
        <button class="btn primary" id="btnBuildReport">🧾 Gerar relatório</button>
        <button class="btn good" id="btnPrint">🖨️ Imprimir</button>
      </div>
      <div class="sep"></div>
      <p class="sub">Você pode imprimir ou salvar como PDF.</p>
    `;

    $("#btnBuildReport").onclick = async ()=>{
      const ym = $("#repMonth").value || state.month;
      const storeName = state.stores.find(s=>s.id===emp.storeId)?.name || emp.storeId;
      try{
        await buildReport({ supabase, printArea, emp, empId, ym, storeName });
        showToast("Relatório gerado. Clique em Imprimir.");
      }catch(err){
        showToast(err?.message || "Erro ao gerar relatório.");
      }
    };

    $("#btnPrint").onclick = ()=>{
      if(printArea.style.display==="none"){ showToast("Gere o relatório primeiro."); return; }
      window.print();
    };
  }

  function downloadBlob(blob, filename){
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;a.download=filename;
    document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 6000);
  }

  async function exportJSON(){
    try{
      const empId = state.selectedEmpId;
      if(!empId){ showToast("Selecione um funcionário."); return; }
      const emp = state.employees.find(e=>e.id===empId);
      const ym = state.month;
      const map = await fetchMonthEntries(supabase, emp, empId, ym);
      const payload = { exportedAt: new Date().toISOString(), employee: emp, month: ym, entriesByDay: map };
      const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
      downloadBlob(blob, `pontopro_${slug(emp.name)}_${ym}.json`);
      showToast("JSON exportado.");
    }catch(err){ showToast(err?.message || "Erro exportando JSON."); }
  }

  async function exportCSV(){
    try{
      const empId = state.selectedEmpId;
      if(!empId){ showToast("Selecione um funcionário."); return; }
      const emp = state.employees.find(e=>e.id===empId);
      const ym = state.month;
      const map = await fetchMonthEntries(supabase, emp, empId, ym);

      const rows=[["Funcionario","Mes","Dia","Tipo","Entrada","IntIni","IntFim","Saida","SemIntervalo","Jornada","Trabalhadas","Banco","Obs"]];
      for(let d=1; d<=31; d++){
        const e = map[d] || defaultEntry(`${ym}-${pad2(d)}`, emp);
        const c = calcWorked(e, emp);
        rows.push([
          emp.name, ym, pad2(d), dayTypeLabel(e.dayType),
          hhmmFrom4digits((e.in4||"").replace(":",""))||"",
          e.noBreak ? "" : (hhmmFrom4digits((e.b1_4||"").replace(":",""))||""),
          e.noBreak ? "" : (hhmmFrom4digits((e.b2_4||"").replace(":",""))||""),
          hhmmFrom4digits((e.out4||"").replace(":",""))||"",
          e.noBreak ? "SIM":"NAO",
          fmtMin(e.scheduleMin),
          c.workedMin===null ? "" : fmtMin(c.workedMin),
          c.bankMin===null ? "" : bankStr(c.bankMin),
          (e.obs||"").replaceAll("\n"," ")
        ]);
      }
      const csv = rows.map(r=>r.map(v=>{
        const s=String(v??"");
        if(/[",;\n]/.test(s)) return `"${s.replaceAll('"','""')}"`;
        return s;
      }).join(";")).join("\n");

      const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});
      downloadBlob(blob, `pontopro_${slug(emp.name)}_${ym}.csv`);
      showToast("CSV exportado.");
    }catch(err){ showToast(err?.message || "Erro exportando CSV."); }
  }

  // ====== Public API for app.js ======
  async function boot(){
    const { data } = await supabase.auth.getSession();
    state.session = data.session || null;

    if(!state.session){
      loginModal.style.display="flex";
      loginStatus.textContent="Aguardando login…";
      return;
    }
    loginModal.style.display="none";
    themeApply("dark");

    const today = nowISODate();
    state.month = ymFromDate(today);
    state.weekMonday = mondayOf(today);

    monthPick.value = state.month;
    weekPick.value = state.weekMonday;

    monthPick.onchange = async ()=>{
      state.month = monthPick.value || state.month;
      state.monthCache = { key:"", mapByDay:{} };
      await refreshKPIs();
      currentPageRenderer?.();
    };
    weekPick.onchange = async ()=>{
      const raw = weekPick.value || state.weekMonday;
      state.weekMonday = mondayOf(raw);
      weekPick.value = state.weekMonday;
      state.weekCache = { key:"", mapByDate:{} };
      currentPageRenderer?.();
    };

    try{
      await loadEmployees();
      if(state.employees.length===0){
        await createEmployee(supabase, { name:"Funcionário 1", role:"", storeId:"LOJA1_TAMBAU", payType:"SALARIO", monthlySalary:0, hourlyRate:0, dailyScheduleMin:480, monthlyBaseMin:13200 });
        await loadEmployees();
      }
      renderEmployeeSelect();
      state.selectedEmpId = employeeSelect.value;

      state.monthCache = { key:"", mapByDay:{} };
      state.weekCache = { key:"", mapByDate:{} };

      await refreshKPIs();
      await renderMes();
    }catch(err){
      showToast("Erro no banco: " + (err?.message || "verifique tabelas V2"));
      page.innerHTML = `
        <h2>Banco não configurado (V2)</h2>
        <p class="sub">Crie as tabelas <span class="mono">employees_v2</span> e <span class="mono">entries_v2</span> no Supabase.</p>
        <div class="sep"></div>
        <pre class="mono" style="white-space:pre-wrap;opacity:.9">${escapeHTML(getSchemaSQL())}</pre>
      `;
    }
  }

  // schema helper
  function getSchemaSQL(){
return `-- ===== PontoPro V2 (empresa) =====
-- Cole e rode no Supabase → SQL Editor

create table if not exists public.employees_v2 (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text,
  store_id text not null default 'LOJA1_TAMBAU',
  pay_type text not null default 'SALARIO',
  monthly_salary numeric not null default 0,
  hourly_rate numeric not null default 0,
  daily_schedule_min int not null default 480,
  monthly_base_min int not null default 13200,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.entries_v2 (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees_v2(id) on delete cascade,
  date date not null,
  day_type text not null default 'NORMAL',
  in4 text,
  b1_4 text,
  b2_4 text,
  out4 text,
  no_break boolean not null default false,
  schedule_min int not null default 480,
  obs text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists entries_v2_employee_date_unique
on public.entries_v2(employee_id, date);

alter table public.employees_v2 enable row level security;
alter table public.entries_v2 enable row level security;

create policy if not exists "employees_v2_auth_all"
on public.employees_v2 for all to authenticated
using (true) with check (true);

create policy if not exists "entries_v2_auth_all"
on public.entries_v2 for all to authenticated
using (true) with check (true);
`; }

  // events
  $("#btnPageMes").onclick = ()=> renderMes();
  $("#btnPageSemana").onclick = ()=> renderSemana();
  $("#btnPageFuncionarios").onclick = ()=> renderFuncionarios();
  $("#btnPageRelatorio").onclick = ()=> renderRelatorio();
  $("#btnTheme").onclick = ()=> toggleTheme();
  $("#btnNewEmployee").onclick = ()=> openEmployeeCreate();
  $("#btnExportCSV").onclick = ()=> exportCSV();
  $("#btnExportJSON").onclick = ()=> exportJSON();
  $("#btnLogout").onclick = ()=> doLogout();
  $("#btnLogin").onclick = ()=> doLogin();

  supabase.auth.onAuthStateChange(async (_event, session)=>{
    state.session=session;
    if(!session) loginModal.style.display="flex";
    else loginModal.style.display="none";
  });

  return { boot, showToast };
}