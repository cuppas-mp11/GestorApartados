import React from 'react';
import { Reservation } from '../types';
import { formatCurrency, formatDate, getDisplayName, getLotColorStyle } from '../utils';

interface RenewedItemsPanelProps {
  reservations: Reservation[];
  aliases: Record<string, string>;
  onLabelsDone: (resId: string) => void;
}

// Registro de las prendas de apartados vencidos que pasaron al lote más reciente:
// primero las que todavía necesitan cambio de etiqueta, y abajo todo el historial.
export const RenewedItemsPanel: React.FC<RenewedItemsPanelProps> = ({ reservations, aliases, onLabelsDone }) => {
  const renewed = reservations
    .filter((r) => r.renewal)
    .sort((a, b) => b.renewal!.at.localeCompare(a.renewal!.at));
  if (renewed.length === 0) return null;
  const pending = renewed.filter((r) => !r.renewal!.labelsDone);

  const Card = ({ r }: { r: Reservation }) => {
    const rn = r.renewal!;
    const color = getLotColorStyle(rn.toLotColor);
    return (
      <div className={`rounded-xl border px-3 py-2.5 ${rn.labelsDone ? 'border-slate-100 bg-slate-50' : 'border-[#c9a876]/50 bg-[#c9a876]/10'}`}>
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <p className="text-[12px] font-semibold text-slate-700">Apartado #{r.correlative} · {r.customerName}</p>
            <p className="text-[10px] text-slate-400">Liberado el {formatDate(rn.at)} por {getDisplayName(rn.byEmail, aliases)}</p>
          </div>
          <span className="text-[10px] font-black px-2 py-0.5 rounded-full" style={{ background: color.bg, color: color.text }}>
            Ahora: lote {rn.toLotLabel}
          </span>
        </div>
        <div className="mt-1.5 space-y-0.5">
          {rn.lines.map((l, i) => (
            <p key={i} className="text-[12px] text-slate-600">
              {l.quantity > 1 ? `${l.quantity}× ` : ''}{l.code} · {l.name}
              <span className="text-slate-400">{l.fromLotLabel ? ` · antes ${l.fromLotLabel}` : ''}{l.newPrice !== undefined ? ` · ahora ${formatCurrency(l.newPrice)}` : ''}</span>
            </p>
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="text-[10px] text-slate-400">{rn.toLotStageLabel}</p>
          {rn.labelsDone ? (
            <p className="text-[10px] font-black text-[#1a8a72]">✓ Etiqueta cambiada{rn.labelsDoneByEmail ? ` por ${getDisplayName(rn.labelsDoneByEmail, aliases)}` : ''}</p>
          ) : (
            <button onClick={() => onLabelsDone(r.id)} className="text-[10px] font-black text-white bg-[#2bb297] hover:bg-[#1a8a72] px-2.5 py-1 rounded-lg uppercase">
              Ya cambié la etiqueta
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-3">
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
        Prendas liberadas de apartados vencidos
        {pending.length > 0 && <span className="ml-2 bg-[#8c3a4b] text-white px-2 py-0.5 rounded-full normal-case tracking-normal">{pending.length} etiqueta(s) por cambiar</span>}
      </p>
      {pending.length > 0 && <div className="space-y-2">{pending.map((r) => <Card key={r.id} r={r} />)}</div>}
      {renewed.length > pending.length && (
        <details>
          <summary className="text-[10px] font-black text-[#2bb297] uppercase cursor-pointer">Historial ({renewed.length - pending.length})</summary>
          <div className="space-y-2 mt-2">{renewed.filter((r) => r.renewal!.labelsDone).map((r) => <Card key={r.id} r={r} />)}</div>
        </details>
      )}
    </div>
  );
};
