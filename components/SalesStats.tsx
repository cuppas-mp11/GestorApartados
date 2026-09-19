import React from 'react';
import { Sale, SaleStatus, PaymentMethod } from '../types';
import { formatCurrency, getSaleTotal, getSaleItemsCount, PAYMENT_METHODS, getSaleItemTotal } from '../utils';

interface SalesStatsProps {
  sales: Sale[];
}

export const SalesStats: React.FC<SalesStatsProps> = ({ sales }) => {
  const todayStr = new Date().toISOString().split('T')[0];
  const todaySales = sales.filter((s) => s.status === SaleStatus.COMPLETED && s.date.startsWith(todayStr));

  const totalToday = todaySales.reduce((acc, s) => acc + getSaleTotal(s), 0);
  const itemsToday = todaySales.reduce((acc, s) => acc + getSaleItemsCount(s), 0);

  // Suma lo pagado con cada método (una venta puede combinar varios).
  const byMethod = (method: PaymentMethod) =>
    todaySales.reduce((acc, s) => acc + s.payments.filter((p) => p.method === method).reduce((a, p) => a + p.amount, 0), 0);

  // Cuánto se vendió de cada prenda hoy (agrupado por código), para que al
  // cerrar el día se vea de un vistazo qué se movió más.
  const byGarment = (() => {
    const map = new Map<string, { code: string; name: string; quantity: number; total: number }>();
    for (const sale of todaySales) {
      for (const item of sale.items) {
        const entry = map.get(item.code) || { code: item.code, name: item.name, quantity: 0, total: 0 };
        entry.quantity += item.quantity;
        entry.total += getSaleItemTotal(item);
        map.set(item.code, entry);
      }
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  })();

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Ventas de Hoy</p>
          <p className="text-3xl font-black text-[#1a8a72] mt-2">{todaySales.length}</p>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-[#2bb297]/10 rounded-full -mr-8 -mt-8 opacity-50"></div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest relative z-10">Total Vendido Hoy</p>
          <p className="text-3xl font-black text-[#1a8a72] mt-2 relative z-10">{formatCurrency(totalToday)}</p>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Prendas Vendidas Hoy</p>
          <p className="text-3xl font-black text-[#c9a876] mt-2">{itemsToday}</p>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap gap-4 mb-4">
        {PAYMENT_METHODS.map((m) => (
          <div key={m.value} className="flex-1 min-w-[100px]">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{m.label}</p>
            <p className="text-sm font-black text-slate-700 mt-1">{formatCurrency(byMethod(m.value))}</p>
          </div>
        ))}
      </div>

      {byGarment.length > 0 && (
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Vendido hoy por prenda</p>
          <div className="flex flex-wrap gap-2">
            {byGarment.map((g) => (
              <div key={g.code} className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                <p className="text-[9px] font-black text-slate-400">{g.code} · {g.quantity}x</p>
                <p className="text-xs font-black text-[#1a8a72]">{formatCurrency(g.total)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
