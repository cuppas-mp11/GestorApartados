import React from 'react';
import { Sale, SaleStatus, PaymentMethod } from '../types';
import { formatCurrency, getSaleTotal, getSaleItemsCount, PAYMENT_METHODS } from '../utils';

interface SalesStatsProps {
  sales: Sale[];
}

export const SalesStats: React.FC<SalesStatsProps> = ({ sales }) => {
  const todayStr = new Date().toISOString().split('T')[0];
  const todaySales = sales.filter((s) => s.status === SaleStatus.COMPLETED && s.date.startsWith(todayStr));

  const totalToday = todaySales.reduce((acc, s) => acc + getSaleTotal(s), 0);
  const itemsToday = todaySales.reduce((acc, s) => acc + getSaleItemsCount(s), 0);

  const byMethod = (method: PaymentMethod) =>
    todaySales.filter((s) => s.paymentMethod === method).reduce((acc, s) => acc + getSaleTotal(s), 0);

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

      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap gap-4">
        {PAYMENT_METHODS.map((m) => (
          <div key={m.value} className="flex-1 min-w-[100px]">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{m.label}</p>
            <p className="text-sm font-black text-slate-700 mt-1">{formatCurrency(byMethod(m.value))}</p>
          </div>
        ))}
      </div>
    </div>
  );
};
