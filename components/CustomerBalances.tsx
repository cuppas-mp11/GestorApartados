import React from 'react';
import { Reservation, ReservationStatus } from '../types';
import { formatCurrency, getBalance } from '../utils';

interface CustomerBalancesProps {
  reservations: Reservation[];
}

export const CustomerBalances: React.FC<CustomerBalancesProps> = ({ reservations }) => {
  const pendingReservations = reservations.filter(r => r.status === ReservationStatus.PENDING);

  const customerBalances = pendingReservations.reduce((acc, curr) => {
    const balance = getBalance(curr);

    if (!acc[curr.customerName]) {
      acc[curr.customerName] = {
        name: curr.customerName,
        code: curr.customerCode,
        totalBalance: 0,
        count: 0
      };
    }

    acc[curr.customerName].totalBalance += balance;
    acc[curr.customerName].count += 1;

    return acc;
  }, {} as Record<string, { name: string; code: string; totalBalance: number; count: number }>);

  const sortedCustomers = Object.values(customerBalances).sort((a, b) => b.totalBalance - a.totalBalance);

  if (sortedCustomers.length === 0) return null;

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 h-fit">
      <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight mb-4">Saldos por Cliente</h2>
      <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
        {sortedCustomers.map((customer) => (
          <div key={customer.name} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-100 rounded-xl">
            <div className="flex flex-col">
              <span className="text-[8px] font-black bg-blue-100 text-blue-600 px-1 rounded w-fit mb-1">{customer.code}</span>
              <p className="text-sm font-black text-slate-800 truncate max-w-[120px]">{customer.name}</p>
              <p className="text-[10px] text-slate-400 font-bold uppercase">{customer.count} apartado(s)</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-black text-emerald-600">{formatCurrency(customer.totalBalance)}</p>
              <p className="text-[10px] text-slate-400 font-bold uppercase">Saldo Total</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
