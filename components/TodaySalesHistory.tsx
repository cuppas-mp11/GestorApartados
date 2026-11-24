import React, { useState } from 'react';
import { Sale, SaleStatus, PaymentMethod, UserRole } from '../types';
import { formatCurrency, getSaleTotal, getSaleItemsCount, PAYMENT_METHODS, getDailySequenceMap, isSameLocalDay } from '../utils';

interface TodaySalesHistoryProps {
  sales: Sale[];
  role: UserRole | null;
  onCancelSale: (id: string) => void;
  onEditSale: (sale: Sale) => void;
}

const QUICK_METHOD_SHORT: Record<string, string> = { cash: 'EF', card: 'TC', transfer: 'DEP' };

// Listado de ventas de hoy con filtros — vive en el Resumen (afuera de la
// ventana "Venta Nueva"), igual que antes, para que admin y vendedora lo
// tengan siempre a la vista junto a las estadísticas del día.
export const TodaySalesHistory: React.FC<TodaySalesHistoryProps> = ({ sales, role, onCancelSale, onEditSale }) => {
  const [methodFilter, setMethodFilter] = useState<'ALL' | 'DISCOUNT' | PaymentMethod>('ALL');

  // Ascendente: la primera venta del día queda arriba (#1).
  const todaySales = sales.filter((s) => isSameLocalDay(s.date)).sort((a, b) => a.correlative - b.correlative);
  const completedToday = todaySales.filter((s) => s.status === SaleStatus.COMPLETED);
  const totalToday = completedToday.reduce((acc, s) => acc + getSaleTotal(s), 0);
  const dailySeq = getDailySequenceMap(todaySales);

  const visibleSales = methodFilter === 'ALL'
    ? todaySales
    : methodFilter === 'DISCOUNT'
    ? todaySales.filter((s) => s.items.some((it) => (it.discount || 0) > 0))
    : todaySales.filter((s) => s.payments.some((p) => p.method === methodFilter));

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <p className="text-sm font-black text-slate-800 uppercase tracking-tight">Venta del día</p>
        <p className="text-lg font-black text-[#1a8a72]">Total del día: {formatCurrency(totalToday)}</p>
      </div>

      {todaySales.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          <button
            onClick={() => setMethodFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wide transition ${methodFilter === 'ALL' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
          >
            Todos
          </button>
          {PAYMENT_METHODS.map((m) => (
            <button
              key={m.value}
              onClick={() => setMethodFilter(m.value)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wide transition ${methodFilter === m.value ? 'bg-[#2bb297] text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
            >
              {m.label}
            </button>
          ))}
          <button
            onClick={() => setMethodFilter('DISCOUNT')}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wide transition ${methodFilter === 'DISCOUNT' ? 'bg-[#8c3a4b] text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
          >
            Con descuento
          </button>
        </div>
      )}

      {todaySales.length === 0 ? (
        <div className="bg-white p-8 text-center rounded-xl border border-slate-200 shadow-sm">
          <p className="text-slate-400 font-medium text-sm">Aún no hay ventas registradas hoy.</p>
        </div>
      ) : visibleSales.length === 0 ? (
        <div className="bg-white p-8 text-center rounded-xl border border-slate-200 shadow-sm">
          <p className="text-slate-400 font-medium text-sm">
            {methodFilter === 'DISCOUNT' ? 'Ninguna venta de hoy tuvo descuento.' : 'Ninguna venta de hoy usó ese método.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2.5 text-[9px] font-black text-slate-400 uppercase tracking-widest">#</th>
                  <th className="px-3 py-2.5 text-[9px] font-black text-slate-400 uppercase tracking-widest">Prenda</th>
                  <th className="px-3 py-2.5 text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">Cant.</th>
                  <th className="px-3 py-2.5 text-[9px] font-black text-slate-400 uppercase tracking-widest">Método(s)</th>
                  <th className="px-3 py-2.5 text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">Desc.</th>
                  <th className="px-3 py-2.5 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Total</th>
                  <th className="px-3 py-2.5 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleSales.map((sale) => {
                  const item = sale.items[0];
                  const cancelled = sale.status === SaleStatus.CANCELLED;
                  const total = getSaleTotal(sale);
                  return (
                    <tr key={sale.id} className={cancelled ? 'opacity-50' : ''}>
                      <td className="px-3 py-2.5 text-[10px] font-bold text-slate-400">{dailySeq.get(sale.id)}</td>
                      <td className="px-3 py-2.5">
                        <span className="text-[9px] font-black bg-slate-100 text-slate-400 px-1 rounded border border-slate-200 mr-1">{item.code}</span>
                        <span className="text-xs font-bold text-slate-700">{item.name}</span>
                        {sale.items.length > 1 && <span className="text-[9px] text-slate-400 font-bold"> +{sale.items.length - 1} más</span>}
                      </td>
                      <td className="px-3 py-2.5 text-center text-xs font-black text-slate-600">{item.quantity}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {sale.payments.map((p) => (
                            <span key={p.id} className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-600">
                              {p.method === 'balance' ? 'SALDO' : QUICK_METHOD_SHORT[p.method] || p.method} {formatCurrency(p.amount)}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {item.discount > 0 ? (
                          <span className="text-[9px] font-black text-[#8c3a4b] bg-[#8c3a4b]/10 px-1.5 py-0.5 rounded">-{formatCurrency(item.discount)}</span>
                        ) : <span className="text-[9px] text-slate-300">—</span>}
                      </td>
                      <td className={`px-3 py-2.5 text-right text-sm font-black ${cancelled ? 'text-slate-400 line-through' : 'text-[#1a8a72]'}`}>
                        {formatCurrency(total)}
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        {cancelled ? (
                          <span className="text-[9px] font-black uppercase px-2 py-1 rounded bg-[#8c3a4b]/15 text-[#6f2d3a]">Anulada</span>
                        ) : role === 'admin' ? (
                          <div className="flex gap-1 justify-end">
                            <button
                              onClick={() => onEditSale(sale)}
                              className="text-[10px] font-black text-[#2bb297] hover:text-white hover:bg-[#2bb297] border border-[#2bb297]/30 hover:border-[#2bb297] transition px-2 py-1 rounded-lg"
                            >
                              Editar
                            </button>
                            <button
                              onClick={() => onCancelSale(sale.id)}
                              className="text-[10px] font-black text-[#8c3a4b] hover:text-white hover:bg-[#8c3a4b] border border-[#8c3a4b]/30 hover:border-[#8c3a4b] transition px-2 py-1 rounded-lg"
                            >
                              Anular
                            </button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="mt-2 text-[10px] text-slate-400 font-bold uppercase tracking-wide">
        {getSaleItemsCount({ items: completedToday.flatMap((s) => s.items) } as Sale)} prenda(s) vendidas hoy en {completedToday.length} venta(s)
      </p>
    </div>
  );
};
