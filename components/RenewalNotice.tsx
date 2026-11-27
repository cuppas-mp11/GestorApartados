import React from 'react';
import { Reservation, ReservationRenewal } from '../types';
import { formatCurrency, getLotColorStyle } from '../utils';

interface RenewalNoticeProps {
  res: Reservation;
  renewal: ReservationRenewal;
  onLabelsDone: () => void;
  onClose: () => void;
}

// Aviso que sale al liberar un apartado VENCIDO: dice a qué lote se fueron las
// prendas y qué etiqueta hay que cambiarles.
export const RenewalNotice: React.FC<RenewalNoticeProps> = ({ res, renewal, onLabelsDone, onClose }) => {
  const color = getLotColorStyle(renewal.toLotColor);
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[90] backdrop-blur-sm">
      <div className="bg-white rounded-2xl border-2 border-slate-900 shadow-[6px_6px_0_rgba(15,23,42,0.35)] max-w-md w-full max-h-[92vh] overflow-hidden flex flex-col">
        <div className="p-5 border-b border-slate-100 bg-slate-50">
          <h2 className="text-lg font-black text-slate-800">Prenda liberada: cambia la etiqueta</h2>
          <p className="text-xs text-slate-500 font-bold mt-0.5">Apartado #{res.correlative} · {res.customerName}</p>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto">
          <div className="rounded-xl p-4 text-center border-2" style={{ borderColor: color.text, background: color.bg }}>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Ahora pertenece al lote</p>
            <p className="text-2xl font-black mt-1" style={{ color: color.text }}>{renewal.toLotLabel}</p>
            <p className="text-[11px] font-bold text-slate-600 mt-1">{renewal.toLotStageLabel}</p>
          </div>
          {!renewal.toLotIsFresh && (
            <p className="text-[11px] font-bold text-[#8a6a3f] bg-[#c9a876]/10 border border-[#c9a876]/30 rounded-xl px-3 py-2">
              Ojo: el lote más reciente ya no está en precio normal, así que la prenda sale con el precio de esa etapa.
            </p>
          )}
          <div className="space-y-1.5">
            {renewal.lines.map((l, i) => (
              <div key={i} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-slate-700">{l.quantity > 1 ? `${l.quantity}× ` : ''}{l.code} · {l.name}</p>
                  {l.fromLotLabel && <p className="text-[10px] text-slate-400">Antes: lote {l.fromLotLabel}</p>}
                </div>
                {l.newPrice !== undefined && <p className="text-[13px] font-black text-[#1a8a72] ml-2">{formatCurrency(l.newPrice)}</p>}
              </div>
            ))}
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Cambia la etiqueta física de cada prenda por la del lote <b>{renewal.toLotLabel}</b>. Este aviso queda guardado en Inventario → "Prendas liberadas" hasta que confirmes que ya se cambió.
          </p>
        </div>
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 bg-slate-200 text-slate-600 text-xs font-black rounded-xl uppercase tracking-wide">Lo haré después</button>
          <button onClick={() => { onLabelsDone(); onClose(); }} className="flex-1 py-3 bg-[#2bb297] hover:bg-[#1a8a72] text-white text-xs font-black rounded-xl uppercase tracking-wide">Ya cambié la etiqueta</button>
        </div>
      </div>
    </div>
  );
};
