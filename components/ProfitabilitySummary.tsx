import React, { useState } from 'react';
import { downloadStyledExcel, Cell } from '../excelStyle';
import { Sale, Expense, CashPurchase, CreditTransaction, ExpenseCategoryItem, GarmentPriceEntry, FinanceSettings } from '../types';
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
  getGarmentPriceForDate,
} from '../utils';

interface ProfitabilitySummaryProps {
  sales: Sale[];
  expenses: Expense[];
  purchases: CashPurchase[];
  writeOffs: CreditTransaction[]; // saldos a favor dados de baja (pasan a ingreso)
  categories: ExpenseCategoryItem[];
  garmentPrices: GarmentPriceEntry[];
  settings: FinanceSettings;
  aliases: Record<string, string>;
}

const todayStr = () => getLocalDateStr();
const firstOfMonthStr = () => {
  const d = new Date();
  return getLocalDateStr(new Date(d.getFullYear(), d.getMonth(), 1));
};

export const ProfitabilitySummary: React.FC<ProfitabilitySummaryProps> = ({
  sales, expenses, purchases, writeOffs, categories, garmentPrices, settings, aliases,
}) => {
  const [start, setStart] = useState(firstOfMonthStr());
  const [end, setEnd] = useState(todayStr());

  const rangeSales = getSalesInRange(sales, start, end);
  const rangeExpenses = getExpensesInRange(expenses, start, end);
  const unitCostsExtra = getUnitCostsTotal(settings.unitCosts || []);

  const breakdown = calculateProfitability(rangeSales, garmentPrices, settings);
  // Las compras pagadas de caja chica también son gasto del negocio: se suman aquí para no registrarlas dos veces.
  const rangePurchases = purchases.filter((p) => p.status === 'ACTIVE' && p.date >= start && p.date <= end);
  const expensesTotal = getExpensesTotal(rangeExpenses) + rangePurchases.reduce((a, p) => a + (p.amount || 0), 0);
  // Saldos a favor que la administradora dio de baja: dinero de clientas que nunca volvieron, ahora ingreso.
  const writeOffTotal = writeOffs.filter((t) => t.type === 'WRITTEN_OFF' && getLocalDateStr(t.date) >= start && getLocalDateStr(t.date) <= end).reduce((a, t) => a - t.amount, 0);
  const finalProfit = breakdown.profitAfterCommission + writeOffTotal - expensesTotal;

  // Precio(s) por prenda usados en este rango (normalmente uno; varios si el precio cambió dentro del periodo)
  const pricesUsed = Array.from(new Set(rangeSales.map((s) => getGarmentPriceForDate(garmentPrices, s.date))));
  const garmentPriceSub =
    garmentPrices.length === 0
      ? 'Sin precio registrado'
      : pricesUsed.length <= 1
        ? `${formatCurrency(pricesUsed[0] ?? getGarmentPriceForDate(garmentPrices, end))} × ${breakdown.itemsSold} prenda(s)`
        : `Precio cambió en el periodo (${pricesUsed.map((x) => formatCurrency(x)).join(', ')}) · ${breakdown.itemsSold} prenda(s)`;

  const bySeller = calculateCommissionsBySeller(rangeSales, garmentPrices, settings);

  const exportExcel = async () => {
    const subtitle = `Del ${formatDate(start)} al ${formatDate(end)}`;
    const chain: Cell[][] = [
      ['Ingresos por ventas', breakdown.revenue],
      ['Prendas vendidas', { v: breakdown.itemsSold, type: 'int' }],
      ['Costo de la ropa (precio por prenda × prendas vendidas)', -breakdown.cogsGarment],
      ['Preparación y empaque por prenda (planchado, bolsa, etc.)', -breakdown.cogsUnitCosts],
      ['Total pagado con tarjeta', breakdown.cardTotal],
      [`Comisión de tarjeta (${settings.cardCommissionPercent}%)`, -breakdown.cardFee],
      ['Total pagado con transferencia/depósito', breakdown.transferTotal],
      [`IVA de factura (${settings.invoiceTaxPercent}%, tarjeta + transferencia)`, -breakdown.invoiceTax],
      ['GANANCIA NETA (base de comisión)', breakdown.netProfit],
      [`Comisión de vendedora (${settings.vendorCommissionPercent}%)`, -breakdown.vendorCommission],
      ['Ganancia después de comisión', breakdown.profitAfterCommission],
      ['Abonos no reclamados (saldos dados de baja)', writeOffTotal],
      ['Gastos fijos/variables del periodo', -expensesTotal],
      ['GANANCIA FINAL', finalProfit],
    ];
    const sorted: { date: string; cat: string; freq: string; amount: number; note: string }[] = [
      ...rangeExpenses.map((e) => ({ date: e.date, cat: getExpenseCategoryLabel(e.categoryId, categories), freq: e.frequency === 'fixed' ? 'Fijo' : 'Variable', amount: e.amount, note: e.note || '' })),
      ...rangePurchases.map((p) => ({ date: p.date, cat: 'Caja chica', freq: 'Compra', amount: p.amount, note: p.description + (p.note ? ` — ${p.note}` : '') })),
    ].sort((a, b) => a.date.localeCompare(b.date));

    await downloadStyledExcel(`Rentabilidad_${start}_a_${end}.xlsx`, [
      {
        name: 'Rentabilidad',
        title: 'Rentabilidad y comisión',
        subtitle,
        widths: [60, 18],
        sections: [
          {
            columns: [{ header: 'Concepto' }, { header: 'Monto', type: 'money' }],
            rows: chain,
            emphasisRows: [8, 10, 13],
          },
        ],
      },
      {
        name: 'Por vendedora',
        title: 'Comisión por vendedora',
        subtitle,
        widths: [24, 12, 16, 18, 16],
        sections: [
          {
            columns: [
              { header: 'Vendedora' },
              { header: 'Prendas', type: 'int' },
              { header: 'Ingresos', type: 'money' },
              { header: 'Ganancia neta', type: 'money' },
              { header: 'Comisión', type: 'money' },
            ],
            rows: bySeller.map((s) => [getDisplayName(s.email, aliases), s.breakdown.itemsSold, s.breakdown.revenue, s.breakdown.netProfit, s.breakdown.vendorCommission]),
            total: bySeller.length > 0
              ? ['TOTAL', bySeller.reduce((a, s) => a + s.breakdown.itemsSold, 0), bySeller.reduce((a, s) => a + s.breakdown.revenue, 0), bySeller.reduce((a, s) => a + s.breakdown.netProfit, 0), bySeller.reduce((a, s) => a + s.breakdown.vendorCommission, 0)]
              : undefined,
          },
        ],
      },
      {
        name: 'Gastos',
        title: 'Detalle de gastos del periodo',
        subtitle,
        widths: [24, 24, 12, 16, 40],
        sections: [
          {
            columns: [
              { header: 'Fecha' },
              { header: 'Categoría' },
              { header: 'Tipo', type: 'center' },
              { header: 'Monto', type: 'money' },
              { header: 'Nota' },
            ],
            rows: sorted.map((e) => [formatDate(e.date), e.cat, e.freq, e.amount, e.note]),
            total: sorted.length > 0 ? ['TOTAL', '', '', expensesTotal, ''] : undefined,
          },
        ],
      },
    ]);
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

      {garmentPrices.length === 0 && (
        <div className="bg-[#c9a876]/10 border border-[#c9a876]/30 rounded-xl px-3 py-2 mb-4">
          <p className="text-[11px] font-bold text-[#8a6a3f]">
            ⚠️ Todavía no has registrado el "Precio por prenda" (panel de la derecha). Mientras tanto, el costo de la ropa no se descuenta y la ganancia se ve más alta de lo real.
          </p>
        </div>
      )}

      {/* ---- Cadena de cálculo del negocio ---- */}
      <div className="space-y-1.5 mb-5">
        <Row label="Ingresos por ventas" value={breakdown.revenue} sub={`${rangeSales.length} venta(s) · ${breakdown.itemsSold} prenda(s)`} positive />
        <Row
          label="Costo de la ropa (lo que se pagó por ella)"
          value={-breakdown.cogsGarment}
          sub={garmentPriceSub}
        />
        <Row label="Preparación y empaque por prenda" value={-breakdown.cogsUnitCosts} sub={`${formatCurrency(unitCostsExtra)} × ${breakdown.itemsSold}`} />
        <Row label="Comisión de tarjeta" value={-breakdown.cardFee} sub={`${settings.cardCommissionPercent || 0}% de ${formatCurrency(breakdown.cardTotal)}`} />
        <Row label="IVA de factura" value={-breakdown.invoiceTax} sub={`${settings.invoiceTaxPercent || 0}% de ${formatCurrency(breakdown.cardTotal + breakdown.transferTotal)} (tarjeta + transf.)`} />
        <Row label="Ganancia neta" value={breakdown.netProfit} bold divider />
        <Row label="Comisión de vendedora" value={-breakdown.vendorCommission} sub={`${settings.vendorCommissionPercent || 0}% de la ganancia neta`} />
        <Row label="Ganancia después de comisión" value={breakdown.profitAfterCommission} bold />
        {writeOffTotal > 0 && <Row label="Abonos no reclamados" value={writeOffTotal} sub="Saldos a favor dados de baja" positive />}
        <Row label="Gastos del periodo" value={-expensesTotal} sub={`${rangeExpenses.length} registro(s)${rangePurchases.length > 0 ? ` + ${rangePurchases.length} compra(s) de caja chica` : ''}`} />
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
                    {s.breakdown.itemsSold} prenda(s) · {formatCurrency(s.breakdown.revenue)} en ventas · ganancia neta {formatCurrency(s.breakdown.netProfit)}
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
        El costo de las prendas usa el "Precio por prenda" que estaba vigente el día de cada venta, así que si cambias el precio, los reportes de fechas anteriores no se alteran. La comisión de tarjeta y el IVA se calculan sobre lo realmente cobrado por cada método. Si el periodo cierra en pérdida, la comisión de vendedora es Q0.00, nunca negativa.
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
