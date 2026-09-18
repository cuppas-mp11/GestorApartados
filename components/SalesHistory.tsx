import React, { useState } from 'react';
import { Sale, SaleStatus, UserRole } from '../types';
import { formatDate, formatCurrency, getSaleTotal, getSaleItemsCount, paymentMethodLabel } from '../utils';

interface SalesHistoryProps {
  sales: Sale[];
  onCancel: (id: string) => void;
  role: UserRole | null;
}

const paymentBadgeStyles: Record<string, string> = {
  cash: 'bg-[#2bb297]/10 text-[#1a8a72]',
  transfer: 'bg-[#2bb297]/10 text-[#1a8a72]',
  card: 'bg-violet-100 text-violet-800',
  other: 'bg-slate-100 text-slate-600',
};

export const SalesHistory: React.FC<SalesHistoryProps> = ({ sales, onCancel, role }) => {
  const [filter, setFilter] = useState<'ALL' | 'TODAY' | 'CANCELLED'>('ALL');

  const todayStr = new Date().toISOString().split('T')[0];

  const filtered = sales.filter((s) => {
    if (filter === 'TODAY') return s.date.startsWith(todayStr);
    if (filter === 'CANCELLED') return s.status === SaleStatus.CANCELLED;
    return true;
  });

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
      <div className="mb-4 flex p-1 bg-slate-50 rounded-xl w-fit gap-1 border border-slate-200">
        <button onClick={() => setFilter('ALL')} className={`px-4 py-2 rounded-lg text-xs font-black tracking-widest uppercase transition ${filter === 'ALL' ? 'bg-white text-[#1a8a72] shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>TODAS</button>
        <button onClick={() => setFilter('TODAY')} className={`px-4 py-2 rounded-lg text-xs font-black tracking-widest uppercase transition ${filter === 'TODAY' ? 'bg-white text-[#1a8a72] shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>HOY</button>
        <button onClick={() => setFilter('CANCELLED')} className={`px-4 py-2 rounded-lg text-xs font-black tracking-widest uppercase transition ${filter === 'CANCELLED' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>ANULADAS</button>
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
                <th className="px-4 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Pago</th>
                <th className="px-4 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">Total</th>
                <th className="px-4 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
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
                    </td>
                    <td className="px-4 py-4 align-top whitespace-nowrap">
                      <span className="text-sm font-bold text-slate-800">{sale.customerName || 'Mostrador'}</span>
                      <div className="text-[9px] text-slate-400 font-bold mt-0.5">Vendió: {sale.soldByEmail}</div>
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
                      <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-md ${paymentBadgeStyles[sale.paymentMethod] || 'bg-slate-100 text-slate-600'}`}>
                        {paymentMethodLabel(sale.paymentMethod)}
                      </span>
                    </td>
                    <td className="px-4 py-4 align-top text-right">
                      <span className={`text-sm font-black ${cancelled ? 'text-slate-400 line-through' : 'text-[#1a8a72]'}`}>{formatCurrency(total)}</span>
                    </td>
                    <td className="px-4 py-4 align-top text-right">
                      {cancelled ? (
                        <div>
                          <span className="px-2 py-1 rounded text-[10px] font-black uppercase bg-[#8c3a4b]/15 text-[#6f2d3a]">ANULADA</span>
                          {sale.cancelledByEmail && (
                            <p className="text-[9px] text-slate-400 font-bold mt-1 max-w-[130px]">Por {sale.cancelledByEmail}</p>
                          )}
                        </div>
                      ) : role === 'admin' ? (
                        <button
                          onClick={() => onCancel(sale.id)}
                          className="flex items-center justify-center gap-1.5 text-[#8c3a4b] hover:text-white hover:bg-[#8c3a4b] border border-[#8c3a4b]/30 hover:border-[#8c3a4b] transition px-3 py-1.5 rounded-lg text-[11px] font-black ml-auto"
                        >
                          <span>↩</span> Anular
                        </button>
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
