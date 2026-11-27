import React from 'react';
import { Reservation } from '../types';
import { getReservationAlerts } from '../utils';

interface ReservationAlertsProps {
  reservations: Reservation[];
  pendingLabels: number;
  onGoApartados: () => void;
  onGoInventario: () => void;
}

// Avisos en Inicio: apartados vencidos, por vencer y etiquetas pendientes.
export const ReservationAlerts: React.FC<ReservationAlertsProps> = ({ reservations, pendingLabels, onGoApartados, onGoInventario }) => {
  const { overdue, expiring } = getReservationAlerts(reservations, 2);
  if (overdue.length === 0 && expiring.length === 0 && pendingLabels === 0) return null;
  const when = (d: number) => (d <= 0 ? 'vence hoy' : d === 1 ? 'vence mañana' : `vence en ${d} días`);
  return (
    <div className="mb-6 space-y-2">
      <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest">Avisos</h2>
      {overdue.length > 0 && (
        <button onClick={onGoApartados} className="w-full text-left bg-[#8c3a4b]/10 border border-[#8c3a4b]/30 rounded-xl px-4 py-3">
          <p className="text-sm font-black text-[#6f2d3a]">{overdue.length} apartado(s) vencido(s) por liberar</p>
          <p className="text-[11px] text-[#6f2d3a]/80 mt-0.5">{overdue.slice(0, 4).map((r) => `#${r.correlative} ${r.customerName}`).join(' · ')}{overdue.length > 4 ? ' …' : ''}</p>
        </button>
      )}
      {expiring.length > 0 && (
        <button onClick={onGoApartados} className="w-full text-left bg-[#c9a876]/15 border border-[#c9a876]/40 rounded-xl px-4 py-3">
          <p className="text-sm font-black text-[#8a6a3f]">{expiring.length} apartado(s) por vencer</p>
          <p className="text-[11px] text-[#8a6a3f]/80 mt-0.5">{expiring.slice(0, 4).map((x) => `#${x.res.correlative} ${x.res.customerName} (${when(x.daysLeft)})`).join(' · ')}{expiring.length > 4 ? ' …' : ''}</p>
        </button>
      )}
      {pendingLabels > 0 && (
        <button onClick={onGoInventario} className="w-full text-left bg-[#2bb297]/10 border border-[#2bb297]/30 rounded-xl px-4 py-3">
          <p className="text-sm font-black text-[#1a8a72]">{pendingLabels} apartado(s) liberado(s) con etiqueta por cambiar</p>
          <p className="text-[11px] text-[#1a8a72]/80 mt-0.5">Ver en Inventario → Prendas liberadas</p>
        </button>
      )}
    </div>
  );
};
