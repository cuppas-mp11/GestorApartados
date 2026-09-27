import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { Sale, Expense, BaleCostEntry, FinanceSettings } from '../types';
import {
  formatCurrency,
  formatDate,
  getLocalDateStr,
  getSalesInRange,
  getExpensesInRange,
  getExpensesTotal,
  getCardTotalForSales,
  getCardCommission,
  getCurrentUnitCost,
  getSaleTotal,
  getSaleItemsCount,
} from '../utils';

interface ProfitabilitySummaryProps {
  sales: Sale[];
  expenses: Expense[];
  baleCosts: BaleCostEntry[];
  settings: FinanceSettings;
}

const todayStr = () => getLocalDateStr();
const firstOfMonthStr = () => {
  const d = new Date();
  return getLocalDateStr(new Date(d.getFullYear(), d.getMonth(), 1));
};

export const ProfitabilitySummary: React.FC<ProfitabilitySummaryProps> = ({ sales, expenses, baleCosts, settings }) => {
  const [start, setStart] = useState(firstOfMonthStr());
  const [end, setEnd] = useState(todayStr());

  const rangeSales = getSalesInRange(sales, start, end);
  const rangeExpenses = getExpensesInRange(expenses, start, end);

  const revenue = rangeSales.reduce((acc, s) => acc + getSaleTotal(s), 0);
  const itemsSold = rangeSales.reduce((acc, s) => acc + getSaleItemsCount(s), 0);
  const unitCost = getCurrentUnitCost(baleCosts);
  const cogs = itemsSold * unitCost;
  const cardTotal = getCardTotalForSales(rangeSales);
  const cardCommission = getCardCommission(cardTotal, settings.cardCommissionPercent || 0);
  const expensesTotal = getExpensesTotal(rangeExpenses);
  const netProfit = revenue - cogs - cardCommission - expensesTotal;

  const hasUnitCost = unitCost > 0;

  const exportExcel = () => {
    const rows: (string | number)[][] = [];
    rows.push(['Vestimenta GT — Rentabilidad']);
    rows.push([`Del ${formatDate(start)} al ${formatDate(end)}`]);
    rows.push([]);
    rows.push(['Concepto', 'Monto (Q)']);
    rows.push(['Ingresos por ventas', revenue]);
    rows.push(['Prendas vendidas', itemsSold]);
    rows.push(['Costo unitario vigente (Q/prenda)', unitCost]);
    rows.push(['Costo de mercadería vendida (estimado)', -cogs]);
    rows.push(['Total cobrado con tarjeta', cardTotal]);
    rows.push([`Comisión de tarjeta (${settings.cardCommissionPercent}%)`, -cardCommission]);
    rows.push(['Gastos del periodo', -expensesTotal]);
    rows.push(['GANANCIA NETA ESTIMADA', netProfit]);
    rows.push([]);
    rows.push(['Detalle de gastos del periodo']);
    rows.push(['Fecha', 'Categoría', 'Tipo', 'Monto (Q)', 'Nota']);
    rangeExpenses
      .sort((a, b) => a.date.localeCompare(b.date))
      .forEach((e) => rows.push([formatDate(e.date), e.category, e.frequency === 'fixed' ? 'Fijo' : 'Variable', e.amount, e.note || '']));

    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Rentabilidad');
    XLSX.writeFile(workbook, `Rentabilidad_${start}_a_${end}.xlsx`);
  };

  return (
    <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Resumen de rentabilidad</p>
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

      {!hasUnitCost && (
        <div className="bg-[#c9a876]/10 border border-[#c9a876]/30 rounded-xl px-3 py-2 mb-4">
          <p className="text-[11px] font-bold text-[#8a6a3f]">
            ⚠️ Aún no has registrado ningún cálculo de costo de paca — el costo de mercadería vendida se está calculando como Q0.00. Regístralo en el panel de la derecha para una ganancia real más exacta.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        <div className="p-3 rounded-xl bg-[#2bb297]/5 border border-[#2bb297]/20">
          <p className="text-[9px] font-black text-slate-400 uppercase">Ingresos</p>
          <p className="text-lg font-black text-[#1a8a72] mt-1">{formatCurrency(revenue)}</p>
          <p className="text-[9px] font-bold text-slate-400 mt-0.5">{rangeSales.length} venta(s) · {itemsSold} prenda(s)</p>
        </div>
        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
          <p className="text-[9px] font-black text-slate-400 uppercase">Costo mercadería</p>
          <p className="text-lg font-black text-slate-600 mt-1">-{formatCurrency(cogs)}</p>
          <p className="text-[9px] font-bold text-slate-400 mt-0.5">{formatCurrency(unitCost)} × {itemsSold}</p>
        </div>
        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
          <p className="text-[9px] font-black text-slate-400 uppercase">Comisión tarjeta</p>
          <p className="text-lg font-black text-slate-600 mt-1">-{formatCurrency(cardCommission)}</p>
          <p className="text-[9px] font-bold text-slate-400 mt-0.5">{formatCurrency(cardTotal)} al {settings.cardCommissionPercent || 0}%</p>
        </div>
        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
          <p className="text-[9px] font-black text-slate-400 uppercase">Gastos del periodo</p>
          <p className="text-lg font-black text-slate-600 mt-1">-{formatCurrency(expensesTotal)}</p>
          <p className="text-[9px] font-bold text-slate-400 mt-0.5">{rangeExpenses.length} registro(s)</p>
        </div>
        <div className={`p-3 rounded-xl border col-span-2 sm:col-span-1 ${netProfit >= 0 ? 'bg-[#1a8a72]/10 border-[#1a8a72]/30' : 'bg-[#8c3a4b]/10 border-[#8c3a4b]/30'}`}>
          <p className="text-[9px] font-black text-slate-400 uppercase">Ganancia neta estimada</p>
          <p className={`text-xl font-black mt-1 ${netProfit >= 0 ? 'text-[#1a8a72]' : 'text-[#8c3a4b]'}`}>{formatCurrency(netProfit)}</p>
        </div>
      </div>

      <p className="text-[9px] text-slate-400 font-bold leading-relaxed">
        El costo de mercadería es un estimado (costo unitario vigente × prendas vendidas en el rango), no un costo exacto por prenda individual — así compran la mercadería (por paca, no por prenda). Los gastos fijos deben registrarse cada mes en el panel de gastos; el sistema no los repite automáticamente.
      </p>
    </div>
  );
};
