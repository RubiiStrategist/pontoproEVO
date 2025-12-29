// js/report.js
import { pad2, escapeHTML, fmtMin, fmtBRL, hhmmFrom4digits } from "./utils.js";
import { dayTypeLabel, bankStr, calcMonthTotals, calcWorked } from "./calc.js";
import { fetchMonthEntries } from "./db.js";

export async function buildReport({ supabase, printArea, emp, empId, ym, storeName }){
  const map = await fetchMonthEntries(supabase, emp, empId, ym);
  const totals = calcMonthTotals(emp, map);

  const rows = [];
  for(let d=1; d<=31; d++){
    const entry = map[d] || {
      date:`${ym}-${pad2(d)}`, dayType:"NORMAL",
      in4:"", b1_4:"", b2_4:"", out4:"", noBreak:false,
      scheduleMin: emp.dailyScheduleMin ?? 480,
      inHHMM:"", b1HHMM:"", b2HHMM:"", outHHMM:"",
      obs:""
    };
    const c = calcWorked(entry, emp);

    rows.push(`
      <tr>
        <td class="mono">${pad2(d)}</td>
        <td>${escapeHTML(dayTypeLabel(entry.dayType))}</td>
        <td class="mono">${escapeHTML(hhmmFrom4digits((entry.in4||"").replace(":","")))}</td>
        <td class="mono">${entry.noBreak ? "—" : escapeHTML(hhmmFrom4digits((entry.b1_4||"").replace(":","")))}</td>
        <td class="mono">${entry.noBreak ? "—" : escapeHTML(hhmmFrom4digits((entry.b2_4||"").replace(":","")))}</td>
        <td class="mono">${escapeHTML(hhmmFrom4digits((entry.out4||"").replace(":","")))}</td>
        <td class="mono">${fmtMin(entry.scheduleMin)}</td>
        <td class="mono">${fmtMin(c.workedMin)}</td>
        <td class="mono">${bankStr(c.bankMin)}</td>
        <td>${escapeHTML(entry.obs||"")}</td>
      </tr>
    `);
  }

  printArea.innerHTML = `
    <div class="print-card" style="padding:18px">
      <div class="print-header">
        <div style="display:flex;gap:12px;align-items:center">
          <div class="print-logo">BJ</div>
          <div>
            <div style="font-weight:900;font-size:18px;letter-spacing:.3px">Casa de Carnes Bom Jesus</div>
            <div style="opacity:.8;font-size:12px">Folha de Ponto — ${escapeHTML(storeName)}</div>
          </div>
        </div>
        <div style="text-align:right">
          <div style="font-weight:800">Período: ${escapeHTML(ym)}</div>
          <div style="opacity:.8;font-size:12px">Gerado em: ${new Date().toLocaleString("pt-BR")}</div>
        </div>
      </div>

      <div style="display:flex;gap:12px;flex-wrap:wrap;margin:10px 0 14px 0">
        <div style="flex:1;min-width:220px">
          <div style="opacity:.8;font-size:12px">Funcionário</div>
          <div style="font-weight:900;font-size:16px">${escapeHTML(emp.name)}</div>
          <div style="opacity:.8;font-size:12px">${escapeHTML(emp.role||"")}</div>
        </div>
        <div style="min-width:240px">
          <div style="opacity:.8;font-size:12px">Pagamento</div>
          <div style="font-weight:800">${emp.payType==="HORA" ? "Por hora" : "Salário fixo"}</div>
          <div style="opacity:.8;font-size:12px">Jornada diária: <span class="mono">${fmtMin(emp.dailyScheduleMin)}</span></div>
        </div>
        <div style="min-width:240px">
          <div style="opacity:.8;font-size:12px">Totais</div>
          <div>Trabalhadas: <span class="mono">${fmtMin(totals.worked)}</span></div>
          <div>Base mensal: <span class="mono">${fmtMin(totals.base)}</span></div>
          <div>Excedente: <span class="mono">${fmtMin(totals.overtime)}</span></div>
          <div>Valor exced.: <span class="mono">${fmtBRL(totals.valueOvertime)}</span></div>
          <div>Prévia: <span class="mono">${fmtBRL(totals.pay)}</span></div>
        </div>
      </div>

      <table class="print-table" style="width:100%;border-collapse:collapse;font-size:12px">
        <thead>
          <tr>
            <th>Dia</th><th>Tipo</th><th>Entrada</th><th>Int Ini</th><th>Int Fim</th><th>Saída</th><th>Jornada</th><th>Trab</th><th>Banco</th><th>Obs</th>
          </tr>
        </thead>
        <tbody>${rows.join("")}</tbody>
      </table>

      <div style="display:flex;gap:18px;margin-top:26px">
        <div style="flex:1"><div style="border-top:1px solid #111;padding-top:6px">Assinatura do funcionário</div></div>
        <div style="flex:1"><div style="border-top:1px solid #111;padding-top:6px">Assinatura do responsável</div></div>
      </div>
    </div>
  `;

  printArea.style.display = "block";
}
