import React, { useState } from 'react';
import { downloadStyledExcel, Cell } from '../excelStyle';
import { Sale, SaleStatus, UserRole } from '../types';
import { formatDate, formatCurrency, getSaleTotal, getSaleItemsCount, paymentMethodLabel, getDisplayName, isSameLocalDay, getLocalDateStr, isDateInRange } from '../utils';

interface SalesHistoryProps {
  sales: Sale[];
  onCancel: (id: string) => void;
  onEditSale: (sale: Sale) => void;
  role: UserRole | null;
  aliases: Record<string, string>;
}

const paymentBadgeStyles: Record<string, string> = {
  cash: 'bg-[#2bb297]/10 text-[#1a8a72]',
  transfer: 'bg-[#2bb297]/20 text-[#1a8a72]',
  card: 'bg-slate-200 text-slate-700',
  other: 'bg-slate-100 text-slate-600',
  balance: 'bg-[#c9a876]/20 text-[#8a6a3f]',
};

export const SalesHistory: React.FC<SalesHistoryProps> = ({ sales, onCancel, onEditSale, role, aliases }) => {
  const [filter, setFilter] = useState<'ALL' | 'CANCELLED'>('ALL');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');

  const today = getLocalDateStr();
  const shiftDays = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return getLocalDateStr(d);
  };
  const setRange = (s: string, e: string) => { setStart(s); setEnd(e); };
  const setToday = () => setRange(today, today);
  const setYesterday = () => setRange(shiftDays(-1), shiftDays(-1));
  const setThisWeek = () => {
    const d = new Date();
    const diffToMonday = (d.getDay() + 6) % 7; // lunes = inicio de semana
    setRange(shiftDays(-diffToMonday), today);
  };
  const setThisMonth = () => setRange(today.slice(0, 8) + '01', today);
  const clearRange = () => setRange('', '');

  // Con solo "Desde" se muestra desde esa fecha en adelante; con solo "Hasta", hasta esa fecha.
  const filtered = sales
    .filter((s) => {
      if (filter === 'CANCELLED' && s.status !== SaleStatus.CANCELLED) return false;
      const lo = start || '0000-01-01';
      const hi = end || '9999-12-31';
      return isDateInRange(s.date, lo, hi);
    })
    .sort((a, b) => b.correlative - a.correlative);

  const completed = filtered.filter((s) => s.status === SaleStatus.COMPLETED);
  const rangeTotal = completed.reduce((acc, s) => acc + getSaleTotal(s), 0);
  const rangeItems = completed.reduce((acc, s) => acc + getSaleItemsCount(s), 0);
  const rangeInvalid = !!start && !!end && end < start;
  const hasRange = !!start || !!end;
  const isActive = (s: string, e: string) => start === s && end === e;

  const exportExcel = async () => {
    const sorted = [...filtered].sort((a, b) => a.correlative - b.correlative);
    const cancelledIdx: number[] = [];
    const rows: Cell[][] = sorted.map((s, i) => {
      if (s.status === SaleStatus.CANCELLED) cancelledIdx.push(i);
      return [
        s.correlative,
        formatDate(s.date),
        getDisplayName(s.soldByEmail, aliases),
        s.items.map((it) => `${it.quantity}x ${it.code} ${it.name}`).join('\n'),
        s.payments.map((p) => `${paymentMethodLabel(p.method)} ${formatCurrency(p.amount)}`).join('\n'),
        getSaleTotal(s),
        s.status === SaleStatus.CANCELLED ? 'ANULADA' : 'COMPLETADA',
      ];
    });
    await downloadStyledExcel(`Historial_ventas_${start || 'inicio'}_a_${end || today}.xlsx`, [
      {
        name: 'Historial',
        title: 'Historial de ventas',
        subtitle: hasRange ? `Del ${start ? formatDate(start) : 'inicio'} al ${end ? formatDate(end) : 'hoy'}` : 'Todas las fechas',
        widths: [8, 22, 18, 42, 30, 14, 14],
        landscape: true,
        freezeHeader: true,
        sections: [
          {
            columns: [
              { header: '#', type: 'center' },
              { header: 'Fecha' },
              { header: 'Vendió' },
              { header: 'Prendas' },
              { header: 'Pago(s)' },
              { header: 'Total', type: 'money' },
              { header: 'Estado', type: 'center' },
            ],
            rows,
            cancelledRows: cancelledIdx,
            total: ['', 'TOTAL (sin anuladas)', '', `${rangeItems} prenda(s)`, `${completed.length} venta(s)`, rangeTotal, ''],
          },
        ],
      },
    ]);
  };

  const chip = (active: boolean) =>
    `px-3 py-1.5 rounded-lg text-[10px] font-black tracking-widest uppercase transition border ${active ? 'bg-[#2bb297] text-white border-[#2bb297]' : 'bg-white text-slate-500 border-slate-200 hover:border-[#2bb297] hover:text-[#1a8a72]'}`;

  if (sales.length === 0) {
    return (
      <div className="bg-white p-12 text-center rounded-xl border border-slate-200 shadow-sm">
        <svg className="w-16 h-16 mx-auto mb-4 opacity-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h5M5 6h14a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2z" />
        </svg>
        <p className="text-slate-500 font-medium tracking-tight">Aún no hay ventas registradas.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Desde</label>
            <input type="date" className="px-3 py-2 border border-slate-200 rounded-lg text-sm font-normal text-slate-600" value={start} max={end || today} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div>
            <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Hasta</label>
            <input type="date" className="px-3 py-2 border border-slate-200 rounded-lg text-sm font-normal text-slate-600" value={end} min={start || undefined} max={today} onChange={(e) => setEnd(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button onClick={setToday} className={chip(isActive(today, today))}>Hoy</button>
            <button onClick={setYesterday} className={chip(isActive(shiftDays(-1), shiftDays(-1)))}>Ayer</button>
            <button onClick={setThisWeek} className={chip(false)}>Esta semana</button>
            <button onClick={setThisMonth} className={chip(false)}>Este mes</button>
            {hasRange && <button onClick={clearRange} className="px-3 py-1.5 rounded-lg text-[10px] font-black tracking-widest uppercase text-slate-400 hover:text-slate-600">Quitar fechas</button>}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex p-1 bg-slate-50 rounded-xl w-fit gap-1 border border-slate-200">
            <button onClick={() => setFilter('ALL')} className={`px-4 py-2 rounded-lg text-xs font-black tracking-widest uppercase transition ${filter === 'ALL' ? 'bg-white text-[#1a8a72] shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>TODAS</button>
            <button onClick={() => setFilter('CANCELLED')} className={`px-4 py-2 rounded-lg text-xs font-black tracking-widest uppercase transition ${filter === 'CANCELLED' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>ANULADAS</button>
          </div>
          <button
            onClick={exportExcel}
            disabled={filtered.length === 0 || rangeInvalid}
            className="bg-slate-800 disabled:bg-slate-300 text-white px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-slate-700 transition"
          >
            Descargar Excel
          </button>
        </div>

        {rangeInvalid ? (
          <p className="text-[11px] font-bold text-[#8c3a4b]">La fecha "Hasta" no puede ser anterior a "Desde".</p>
        ) : (
          <p className="text-[11px] font-black text-slate-500">
            {completed.length} venta(s) · {rangeItems} prenda(s) · Total <span className="text-[#1a8a72]">{formatCurrency(rangeTotal)}</span>
            <span className="text-slate-400 font-bold"> (sin contar anuladas){filter === 'CANCELLED' ? ' — viendo solo anuladas' : ''}</span>
          </p>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">#</th>
                <th className="px-4 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Fecha</th>
                <th className="px-4 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Cliente</th>
                <th className="px-4 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Prendas</th>
                <th className="px-4 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Pago(s)</th>
                <th className="px-4 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">Total</th>
                <th className="px-4 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-400 font-bold">No hay ventas en este filtro.</td></tr>
              )}
              {filtered.map((sale) => {
                const total = getSaleTotal(sale);
                const cancelled = sale.status === SaleStatus.CANCELLED;
                return (
                  <tr key={sale.id} className={`hover:bg-slate-50 transition-colors ${cancelled ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-4 align-top">
                      <span className="text-sm font-bold text-slate-400">{sale.correlative}</span>
                    </td>
                    <td className="px-4 py-4 align-top whitespace-nowrap">
                      <span className="text-xs font-bold text-slate-700">{formatDate(sale.date)}</span>
                      {sale.quickEntry && <div className="text-[8px] text-slate-400 font-bold uppercase mt-0.5">Venta del día</div>}
                      {sale.editedAt && <div className="text-[8px] text-[#8a6a3f] font-bold uppercase mt-0.5" title={sale.editedAt}>✎ Editada por {getDisplayName(sale.editedByEmail, aliases)}</div>}
                    </td>
                    <td className="px-4 py-4 align-top whitespace-nowrap">
                      <span className="text-sm font-bold text-slate-800">{sale.customerName || 'Mostrador'}</span>
                      <div className="text-[9px] text-slate-400 font-bold mt-0.5">Vendió: {getDisplayName(sale.soldByEmail, aliases)}</div>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <ul className="text-xs space-y-1.5">
                        {sale.items.map((item) => (
                          <li key={item.id} className="text-slate-600 flex gap-2 items-center flex-wrap">
                            <span className="bg-slate-100 text-[9px] font-black text-slate-400 px-1 rounded border border-slate-200">{item.code}</span>
                            <span className="font-medium"><span className="font-black">{item.quantity}x</span> {item.name}</span>
                            {item.discount > 0 && (
                              <span className="text-[9px] font-black text-[#8c3a4b] bg-[#8c3a4b]/10 px-1.5 py-0.5 rounded">-{formatCurrency(item.discount)}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                      <p className="text-[9px] text-slate-400 font-bold mt-1">{getSaleItemsCount(sale)} prenda(s) en total</p>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <div className="flex flex-col gap-1">
                        {sale.payments.map((p) => (
                          <span key={p.id} className={`text-[10px] font-black uppercase px-2 py-1 rounded-md w-fit ${paymentBadgeStyles[p.method] || 'bg-slate-100 text-slate-600'}`}>
                            {paymentMethodLabel(p.method)} · {formatCurrency(p.amount)}
                            {p.method === 'balance' && p.customerName && <span className="normal-case"> ({p.customerName})</span>}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-4 align-top text-right">
                      <span className={`text-sm font-black ${cancelled ? 'text-slate-400 line-through' : 'text-[#1a8a72]'}`}>{formatCurrency(total)}</span>
                    </td>
                    <td className="px-4 py-4 align-top text-right">
                      {cancelled ? (
                        <div>
                          <span className="px-2 py-1 rounded text-[10px] font-black uppercase bg-[#8c3a4b]/15 text-[#6f2d3a]">ANULADA</span>
                          {sale.cancelledByEmail && (
                            <p className="text-[9px] text-slate-400 font-bold mt-1 max-w-[130px]">Por {getDisplayName(sale.cancelledByEmail, aliases)}</p>
                          )}
                        </div>
                      ) : role === 'admin' ? (
                        <div className="flex gap-1.5 justify-end">
                          <button
                            onClick={() => onEditSale(sale)}
                            className="flex items-center justify-center gap-1.5 text-[#2bb297] hover:text-white hover:bg-[#2bb297] border border-[#2bb297]/30 hover:border-[#2bb297] transition px-3 py-1.5 rounded-lg text-[11px] font-black"
                          >
                            ✎ Editar
                          </button>
                          <button
                            onClick={() => onCancel(sale.id)}
                            className="flex items-center justify-center gap-1.5 text-[#8c3a4b] hover:text-white hover:bg-[#8c3a4b] border border-[#8c3a4b]/30 hover:border-[#8c3a4b] transition px-3 py-1.5 rounded-lg text-[11px] font-black"
                          >
                            <span>↩</span> Anular
                          </button>
                        </div>
                      ) : (
                        <span className="px-2 py-1 rounded text-[10px] font-black uppercase bg-[#2bb297]/10 text-[#1a8a72]">COMPLETADA</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
