import React from 'react';
import { Reservation, ReservationStatus } from '../types';
import { isOverdue, formatCurrency, getBalance } from '../utils';

interface StatsProps {
  reservations: Reservation[];
}

export const Stats: React.FC<StatsProps> = ({ reservations }) => {
  const pendingReservations = reservations.filter(r => r.status === ReservationStatus.PENDING);
  const activeCount = pendingReservations.length;
  const overdueCount = pendingReservations.filter(r => isOverdue(r.date)).length;

  const totalBalancePending = pendingReservations.reduce((acc, curr) => acc + getBalance(curr), 0);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Apartados Activos</p>
        <p className="text-3xl font-black text-blue-600 mt-2">{activeCount}</p>
      </div>
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-50 rounded-full -mr-8 -mt-8 opacity-50"></div>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest relative z-10">Total por Cobrar</p>
        <p className="text-3xl font-black text-emerald-600 mt-2 relative z-10">{formatCurrency(totalBalancePending)}</p>
      </div>
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Plazos Vencidos</p>
        <p className="text-3xl font-black text-rose-600 mt-2">{overdueCount}</p>
      </div>
    </div>
  );
};
