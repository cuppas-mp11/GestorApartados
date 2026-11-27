import React, { useState } from 'react';
import { CreditTransaction, Customer, Reservation, ReservationStatus } from '../types';
import { calculateDaysPassed, formatCurrency, getTotalPaid } from '../utils';

interface AbonosApartadosCardProps {
  customers: Customer[];
  creditLedger: CreditTransaction[];
  reservations: Reservation[];
  onWriteOff: (customer: Customer, note: string) => Promise<void> | void;
}

// Cuenta "Abonos de apartados" (solo admin): dónde está el dinero que las
// clientas dejaron como abono. Mientras esté como saldo a favor NO es ingreso;
// pasa a ingreso solo si la administradora lo da de baja (clienta que no vuelve).
export const AbonosApartadosCard: React.FC<AbonosApartadosCardProps> = ({ customers, creditLedger, reservations, onWriteOff }) => {
  const [openId, setOpenId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const inActive = reservations.filter((r) => r.status === ReservationStatus.PENDING).reduce((a, r) => a + getTotalPaid(r), 0);
  const withCredit = customers.filter((c) => (c.creditBalance || 0) > 0.001);
  const creditTotal = withCredit.reduce((a, c) => a + (c.creditBalance || 0), 0);
  const writtenOff = creditLedger.filter((t) => t.type === 'WRITTEN_OFF').reduce((a, t) => a - t.amount, 0);

  const lastMove = (c: Customer): number | null => {
    const dates = creditLedger.filter((t) => t.customerId === c.id).map((t) => t.date);
    if (dates.length === 0) return null;
    return calculateDaysPassed(dates.sort().reverse()[0]);
  };

  const confirm = async (c: Customer) => {
    if (!note.trim()) return;
    setBusy(true);
    try {
      await onWriteOff(c, note.trim());
      setOpenId(null);
      setNote('');
    } finally {
      setBusy(false);
    }
  };

  const Stat = ({ label, value, tone }: { label: string; value: number; tone?: string }) => (
    <div className="bg-slate-50 rounded-xl px-3 py-2 text-center">
      <p className="text-[8px] font-black text-slate-400 uppercase">{label}</p>
      <p className={`text-base font-black mt-0.5 ${tone || 'text-slate-700'}`}>{formatCurrency(value)}</p>
    </div>
  );

  return (
    <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Abonos de apartados</p>
      <div className="grid grid-cols-3 gap-2 mb-3">
        <Stat label="En apartados activos" value={inActive} />
        <Stat label="Saldo a favor pendiente" value={creditTotal} tone="text-[#8a6a3f]" />
        <Stat label="Dado de baja (ingreso)" value={writtenOff} tone="text-[#1a8a72]" />
      </div>
      <p className="text-[9px] text-slate-400 leading-relaxed mb-3">
        El saldo a favor no es ganancia todavía: es dinero de la clienta guardado en la tienda. Se vuelve ingreso cuando ella lo usa en una compra o cuando lo das de baja aquí.
      </p>
      {withCredit.length === 0 ? (
        <p className="text-[11px] text-slate-400 font-bold">No hay saldos a favor pendientes.</p>
      ) : (
        <div className="space-y-1.5">
          {withCredit.map((c) => {
            const days = lastMove(c);
            const stale = days !== null && days >= 180;
            return (
              <div key={c.id} className={`rounded-lg px-3 py-2 ${stale ? 'bg-[#c9a876]/10 border border-[#c9a876]/30' : 'bg-slate-50'}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold text-slate-700 truncate">{c.name}</p>
                    <p className="text-[10px] text-slate-400">{days === null ? 'Sin movimientos registrados' : `Sin movimiento hace ${days} día(s)`}{stale ? ' · se puede dar de baja' : ''}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="text-[13px] font-black text-[#8a6a3f]">{formatCurrency(c.creditBalance || 0)}</p>
                    <button onClick={() => { setOpenId(openId === c.id ? null : c.id); setNote(''); }} className="text-[10px] font-black text-[#8c3a4b] uppercase">Dar de baja</button>
                  </div>
                </div>
                {openId === c.id && (
                  <div className="mt-2 flex gap-2">
                    <input
                      type="text" autoFocus value={note} onChange={(e) => setNote(e.target.value)}
                      placeholder="Motivo (ej. sin movimiento desde mayo)"
                      className="flex-1 px-2 py-1.5 border border-slate-200 rounded-lg text-xs"
                    />
                    <button onClick={() => confirm(c)} disabled={busy || !note.trim()} className="px-3 py-1.5 bg-[#8c3a4b] disabled:bg-slate-300 text-white text-[10px] font-black rounded-lg uppercase">
                      Confirmar
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
