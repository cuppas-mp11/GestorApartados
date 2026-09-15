import React, { useState } from 'react';
import { InventoryItem, Lot, UserRole } from '../types';
import { getWeeksInStore, getLotAlertLevel, formatDate } from '../utils';

interface LotsPanelProps {
  inventory: InventoryItem[];
  lots: Lot[];
  role: UserRole | null;
  onDeleteLot: (id: string) => void;
}

const alertStyles = {
  green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  red: 'bg-[#8c3a4b]/10 text-[#8c3a4b] border-[#8c3a4b]/30',
};

export const LotsPanel: React.FC<LotsPanelProps> = ({ inventory, lots, role, onDeleteLot }) => {
  const [isOpen, setIsOpen] = useState(false);

  const findName = (code: string) => inventory.find((i) => i.code === code)?.name || code;

  const activeLots = lots
    .filter((l) => l.quantityRemaining > 0)
    .map((l) => ({ ...l, weeks: getWeeksInStore(l.entryDate) }))
    .sort((a, b) => b.weeks - a.weeks); // los más viejos primero

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="w-full mb-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium py-2 rounded-lg transition text-sm flex items-center justify-center gap-2 border border-slate-300"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Ver Rotación de Lotes
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-hidden flex flex-col">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Rotación de Lotes</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase">Ordenado del más antiguo al más nuevo</p>
          </div>
          <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>

        <div className="p-5 overflow-y-auto flex-1 space-y-2">
          {activeLots.length === 0 ? (
            <p className="text-center text-slate-400 py-8 text-sm">Aún no hay lotes registrados con existencia.</p>
          ) : (
            activeLots.map((lot) => {
              const alert = getLotAlertLevel(lot.weeks);
              return (
                <div key={lot.id} className={`p-3 border rounded-xl flex items-center justify-between ${alertStyles[alert.level]}`}>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black bg-white/70 px-1.5 py-0.5 rounded border border-current/20">{lot.label}</span>
                      <span className="text-[10px] font-black bg-white/70 px-1.5 py-0.5 rounded border border-current/20">{lot.code}</span>
                    </div>
                    <p className="text-sm font-bold mt-1">{findName(lot.code)}</p>
                    <p className="text-[10px] font-bold uppercase mt-0.5">
                      Quedan {lot.quantityRemaining} · {lot.weeks} semana{lot.weeks !== 1 ? 's' : ''} en tienda · {formatDate(lot.entryDate)}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <span className="text-[10px] font-black uppercase px-2 py-1 rounded-full bg-white/70">{alert.label}</span>
                    {role === 'admin' && (
                      <button
                        onClick={() => { if (confirm('¿Eliminar este lote? (por ejemplo, si fue un error de captura)')) onDeleteLot(lot.id); }}
                        className="text-[9px] font-black underline opacity-70 hover:opacity-100"
                      >
                        Eliminar lote
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="p-4 border-t bg-slate-50 flex justify-end">
          <button onClick={() => setIsOpen(false)} className="px-5 py-2 bg-slate-800 text-white rounded-lg font-bold text-sm">Finalizar</button>
        </div>
      </div>
    </div>
  );
};
