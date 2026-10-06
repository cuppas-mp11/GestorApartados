import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { Sale, Expense, ExpenseCategoryItem, Paca, PacaReconciliation, FinanceSettings } from '../types';
import {
  formatCurrency,
  formatDate,
  getLocalDateStr,
  getSalesInRange,
  getExpensesInRange,
  getExpensesTotal,
  getUnitCostsTotal,
  calculateProfitability,
  calculateCommissionsBySeller,
  getExpenseCategoryLabel,
  getDisplayName,
} from '../utils';

interface ProfitabilitySummaryProps {
  sales: Sale[];
  expenses: Expense[];
  categories: ExpenseCategoryItem[];
  pacas: Paca[];
  reconciliations: PacaReconciliation[];
  settings: FinanceSettings;
  aliases: Record<string, string>;
}

const todayStr = () => getLocalDateStr();
const firstOfMonthStr = () => {
  const d = new Date();
  return getLocalDateStr(new Date(d.getFullYear(), d.getMonth(), 1));
};

export const ProfitabilitySummary: React.FC<ProfitabilitySummaryProps> = ({
  sales, expenses, categories, pacas, reconciliations, settings, aliases,
}) => {
  const [start, setStart] = useState(firstOfMonthStr());
  const [end, setEnd] = useState(todayStr());

  const rangeSales = getSalesInRange(sales, start, end);
  const rangeExpenses = getExpensesInRange(expenses, start, end);
  const unitCostsExtra = getUnitCostsTotal(settings.unitCosts || []);

  const breakdown = calculateProfitability(rangeSales, pacas, reconciliations, settings, start, end);
  const expensesTotal = getExpensesTotal(rangeExpenses);
  const finalProfit = breakdown.profitAfterCommission - expensesTotal;

  const bySeller = calculateCommissionsBySeller(rangeSales, pacas, reconciliations, settings, start, end);

  const exportExcel = () => {
    const rows: (string | number)[][] = [];
    rows.push(['Vestimenta GT — Rentabilidad y comisión']);
    rows.push([`Del ${formatDate(start)} al ${formatDate(end)}`]);
    rows.push([]);
    rows.push(['Concepto', 'Monto (Q)']);
    rows.push(['Ingresos por ventas', breakdown.revenue]);
    rows.push(['Prendas vendidas', breakdown.itemsSold]);
    rows.push(['Prendas ya costeadas (paca asignada)', breakdown.itemsCosted]);
    rows.push(['Prendas pendientes de costear', breakdown.itemsPending]);
    rows.push(['Costo de paca (solo lo costeado)', -breakdown.cogsPaca]);
    rows.push(['Costos por prenda (planchado, empaque, etc.)', -breakdown.cogsUnitCosts]);
    rows.push(['Total pagado con tarjeta', breakdown.cardTotal]);
    rows.push([`Comisión de tarjeta (${settings.cardCommissionPercent}%)`, -breakdown.cardFee]);
    rows.push(['Total pagado con transferencia/depósito', breakdown.transferTotal]);
    rows.push([`IVA de factura (${settings.invoiceTaxPercent}%, tarjeta + transferencia)`, -breakdown.invoiceTax]);
    rows.push(['GANANCIA NETA (base de comisión)', breakdown.netProfit]);
    rows.push([`Comisión de vendedora (${settings.vendorCommissionPercent}%)`, -breakdown.vendorCommission]);
    rows.push(['Ganancia después de comisión', breakdown.profitAfterCommission]);
    rows.push(['Gastos fijos/variables del periodo', -expensesTotal]);
    rows.push(['GANANCIA FINAL', finalProfit]);
    rows.push([]);
    rows.push(['Comisión por vendedora']);
    rows.push(['Vendedora', 'Prendas vendidas', 'Costeadas', 'Pendientes', 'Ingresos (Q)', 'Ganancia neta (Q)', 'Comisión (Q)']);
    bySeller.forEach((s) =>
      rows.push([
        getDisplayName(s.email, aliases), s.breakdown.itemsSold, s.breakdown.itemsCosted, s.breakdown.itemsPending,
        s.breakdown.revenue, s.breakdown.netProfit, s.breakdown.vendorCommission,
      ])
    );
    rows.push([]);
    rows.push(['Detalle de gastos del periodo']);
    rows.push(['Fecha', 'Categoría', 'Tipo', 'Monto (Q)', 'Nota']);
    rangeExpenses
      .sort((a, b) => a.date.localeCompare(b.date))
      .forEach((e) => rows.push([formatDate(e.date), getExpenseCategoryLabel(e.categoryId, categories), e.frequency === 'fixed' ? 'Fijo' : 'Variable', e.amount, e.note || '']));

    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Rentabilidad');
    XLSX.writeFile(workbook, `Rentabilidad_${start}_a_${end}.xlsx`);
  };

  return (
    <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Resumen de rentabilidad y comisión</p>
        <button
          onClick={exportExcel}
          className="flex items-center gap-2 bg-slate-800 text-white px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-slate-700 transition"
        >
          Descargar Excel
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-5">
        <div>
          <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Desde</label>
          <input type="date" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-bold" value={start} onChange={(e) => setStart(e.target.value)} max={end} />
        </div>
        <div>
          <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Hasta</label>
          <input type="date" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-bold" value={end} onChange={(e) => setEnd(e.target.value)} min={start} max={todayStr()} />
        </div>
      </div>

      {breakdown.itemsPending > 0 && (
        <div className="bg-[#c9a876]/10 border border-[#c9a876]/30 rounded-xl px-3 py-2 mb-4">
          <p className="text-[11px] font-bold text-[#8a6a3f]">
            ⚠️ {breakdown.itemsPending} prenda(s) vendida(s) en este rango todavía no se han costeado (no tienen paca asignada por sticker) — su costo no se está incluyendo en la ganancia, así que el número de abajo es conservador, no definitivo. Costéalas en "Costear ventas por sticker".
          </p>
        </div>
      )}

      {/* ---- Cadena de cálculo del negocio ---- */}
      <div className="space-y-1.5 mb-5">
        <Row label="Ingresos por ventas" value={breakdown.revenue} sub={`${rangeSales.length} venta(s) · ${breakdown.itemsSold} prenda(s)`} positive />
        <Row
          label="Costo de paca"
          value={-breakdown.cogsPaca}
          sub={`${breakdown.itemsCosted} de ${breakdown.itemsSold} prenda(s) costeadas${breakdown.itemsPending > 0 ? ` · ${breakdown.itemsPending} pendiente(s)` : ''}`}
        />
        <Row label="Costos por prenda" value={-breakdown.cogsUnitCosts} sub={`${formatCurrency(unitCostsExtra)} × ${breakdown.itemsSold}`} />
        <Row label="Comisión de tarjeta" value={-breakdown.cardFee} sub={`${settings.cardCommissionPercent || 0}% de ${formatCurrency(breakdown.cardTotal)}`} />
        <Row label="IVA de factura" value={-breakdown.invoiceTax} sub={`${settings.invoiceTaxPercent || 0}% de ${formatCurrency(breakdown.cardTotal + breakdown.transferTotal)} (tarjeta + transf.)`} />
        <Row label="Ganancia neta" value={breakdown.netProfit} bold divider />
        <Row label="Comisión de vendedora" value={-breakdown.vendorCommission} sub={`${settings.vendorCommissionPercent || 0}% de la ganancia neta`} />
        <Row label="Ganancia después de comisión" value={breakdown.profitAfterCommission} bold />
        <Row label="Gastos del periodo" value={-expensesTotal} sub={`${rangeExpenses.length} registro(s)`} />
        <Row label="GANANCIA FINAL" value={finalProfit} bold big divider />
      </div>

      {/* ---- Comisión por vendedora ---- */}
      <div className="border-t border-slate-100 pt-4">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Comisión por vendedora</p>
        {bySeller.length === 0 ? (
          <p className="text-center text-slate-400 py-3 text-xs">No hay ventas registradas en este rango.</p>
        ) : (
          <div className="space-y-2">
            {bySeller.map((s) => (
              <div key={s.email} className="flex items-center justify-between bg-slate-50 rounded-xl px-3 py-2.5">
                <div>
                  <p className="text-sm font-black text-slate-700">{getDisplayName(s.email, aliases)}</p>
                  <p className="text-[10px] text-slate-400 font-bold">
                    {s.breakdown.itemsSold} prenda(s){s.breakdown.itemsPending > 0 ? ` (${s.breakdown.itemsPending} sin costear)` : ''} · {formatCurrency(s.breakdown.revenue)} en ventas · ganancia neta {formatCurrency(s.breakdown.netProfit)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] font-black text-slate-400 uppercase">Comisión</p>
                  <p className="text-lg font-black text-[#c9a876]">{formatCurrency(s.breakdown.vendorCommission)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-[9px] text-slate-400 font-bold leading-relaxed mt-4 pt-3 border-t border-slate-100">
        El costo de paca solo cuenta lo que ya se costeó manualmente (por sticker) en "Costear ventas por sticker" — lo pendiente se deja fuera, no se estima, para no mezclar un número exacto con uno adivinado. Un costeo solo cuenta aquí si su rango de fechas cae completo dentro del rango que estás revisando. La comisión de tarjeta y el IVA se calculan sobre lo realmente cobrado por cada método. Si el periodo cierra en pérdida, la comisión de vendedora es Q0.00, nunca negativa.
      </p>
    </div>
  );
};

const Row: React.FC<{ label: string; value: number; sub?: string; positive?: boolean; bold?: boolean; big?: boolean; divider?: boolean }> = ({
  label, value, sub, positive, bold, big, divider,
}) => (
  <div className={`flex items-center justify-between px-3 py-2 rounded-lg ${divider ? 'bg-[#2bb297]/5 border border-[#2bb297]/20' : ''}`}>
    <div>
      <p className={`${bold ? 'font-black' : 'font-bold'} ${big ? 'text-sm' : 'text-xs'} text-slate-700`}>{label}</p>
      {sub && <p className="text-[9px] text-slate-400 font-bold">{sub}</p>}
    </div>
    <p className={`${bold ? 'font-black' : 'font-bold'} ${big ? 'text-lg' : 'text-sm'} ${value < 0 ? 'text-[#8c3a4b]' : positive || value > 0 ? 'text-[#1a8a72]' : 'text-slate-500'}`}>
      {value < 0 ? '-' : ''}{formatCurrency(Math.abs(value))}
    </p>
  </div>
);
