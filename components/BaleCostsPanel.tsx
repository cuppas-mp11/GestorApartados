import React, { useState } from 'react';
import { BaleCostEntry } from '../types';
import { formatCurrency, formatDate, getLocalDateStr, sortBaleCostsDesc, getCurrentUnitCost, getDisplayName } from '../utils';

interface BaleCostsPanelProps {
  entries: BaleCostEntry[];
  aliases: Record<string, string>;
  onAdd: (balePrice: number, quantity: number, date: string, note: string) => void;
  onDelete: (id: string) => void;
}

export const BaleCostsPanel: React.FC<BaleCostsPanelProps> = ({ entries, aliases, onAdd, onDelete }) => {
  const [balePrice, setBalePrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [date, setDate] = useState(getLocalDateStr());
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  const sorted = sortBaleCostsDesc(entries);
  const currentUnitCost = getCurrentUnitCost(entries);

  const priceNum = parseFloat(balePrice);
  const qtyNum = parseInt(quantity);
  const previewUnitCost = priceNum > 0 && qtyNum > 0 ? priceNum / qtyNum : null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isNaN(priceNum) || priceNum <= 0) {
      setError('Ingresa el precio de la paca (mayor a 0).');
      return;
    }
    if (isNaN(qtyNum) || qtyNum <= 0) {
      setError('Ingresa cuántas prendas trajo la paca (mayor a 0).');
      return;
    }
    onAdd(priceNum, qtyNum, date, note.trim());
    setBalePrice('');
    setQuantity('');
    setNote('');
    setDate(getLocalDateStr());
    setError('');
  };

  return (
    <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Costo unitario vigente</p>
      </div>
      <p className="text-3xl font-black text-[#1a8a72] mb-1">{formatCurrency(currentUnitCost)}</p>
      <p className="text-[10px] text-slate-400 font-bold mb-4">
        {sorted.length > 0
          ? `Según el último cálculo (${formatDate(sorted[0].date)}). Se usa para estimar la ganancia real.`
          : 'Aún no hay ningún cálculo — registra tu primera paca abajo.'}
      </p>

      <form onSubmit={handleSubmit} className="space-y-2 border-t border-slate-100 pt-4">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Nuevo cálculo de paca</p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Precio de paca (Q)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-bold"
              value={balePrice}
              onChange={(e) => setBalePrice(e.target.value)}
              placeholder="Ej. 1200"
            />
          </div>
          <div>
            <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Cantidad de prendas</label>
            <input
              type="number"
              min="1"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-bold"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="Ej. 150"
            />
          </div>
        </div>

        {previewUnitCost !== null && (
          <div className="bg-[#2bb297]/5 border border-[#2bb297]/20 rounded-lg px-3 py-2">
            <p className="text-[10px] font-bold text-[#1a8a72]">
              Costo unitario: <span className="font-black">{formatCurrency(previewUnitCost)}</span> por prenda
            </p>
          </div>
        )}

        <div>
          <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Fecha del cálculo</label>
          <input
            type="date"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-bold"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            max={getLocalDateStr()}
          />
        </div>

        <div>
          <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Nota (opcional)</label>
          <input
            type="text"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ej. Paca de blusas, proveedor Juana"
          />
        </div>

        {error && <p className="text-[10px] text-[#8c3a4b] font-bold">{error}</p>}

        <button type="submit" className="w-full bg-[#2bb297] hover:bg-[#1a8a72] text-white font-bold py-2 rounded-lg text-sm transition">
          Guardar cálculo
        </button>
      </form>

      {sorted.length > 0 && (
        <div className="mt-4 pt-3 border-t border-slate-100">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="text-[10px] font-black text-slate-400 hover:text-slate-600 uppercase tracking-widest"
          >
            {showHistory ? '▲ Ocultar historial' : `▼ Ver historial (${sorted.length})`}
          </button>
          {showHistory && (
            <div className="mt-2 space-y-1.5 max-h-64 overflow-y-auto">
              {sorted.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between text-[11px] px-3 py-2 bg-slate-50 rounded-lg">
                  <div>
                    <p className="font-black text-slate-700">{formatCurrency(entry.unitCost)} / prenda</p>
                    <p className="text-slate-400 font-bold">
                      {formatDate(entry.date)} · {formatCurrency(entry.balePrice)} ÷ {entry.quantity} prendas
                      {entry.note ? ` · ${entry.note}` : ''}
                    </p>
                    <p className="text-slate-300 font-bold">{getDisplayName(entry.createdByEmail, aliases)}</p>
                  </div>
                  <button
                    onClick={() => { if (confirm('¿Eliminar este cálculo del historial?')) onDelete(entry.id); }}
                    className="text-[#8c3a4b]/60 hover:text-[#8c3a4b] px-2"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
