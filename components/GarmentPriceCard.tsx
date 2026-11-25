import React, { useState } from 'react';
import { GarmentPriceEntry } from '../types';
import {
  formatCurrency,
  formatDate,
  getDisplayName,
  getLocalDateStr,
  getCurrentGarmentPriceEntry,
} from '../utils';

interface GarmentPriceCardProps {
  entries: GarmentPriceEntry[];
  aliases: Record<string, string>;
  onAdd: (price: number, effectiveDate: string, note: string) => Promise<void> | void;
}

// Precio por prenda: un solo valor general para todas las prendas, que se usa
// como costo en el Resumen de rentabilidad. Cada cambio queda como una entrada
// nueva en el historial (precio + fecha) — nunca se sobrescribe ni se borra.
export const GarmentPriceCard: React.FC<GarmentPriceCardProps> = ({ entries, aliases, onAdd }) => {
  const [editing, setEditing] = useState(false);
  const [price, setPrice] = useState('');
  const [date, setDate] = useState(getLocalDateStr());
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const current = getCurrentGarmentPriceEntry(entries);
  const history = [...entries].sort(
    (a, b) => b.effectiveDate.localeCompare(a.effectiveDate) || b.createdAt.localeCompare(a.createdAt)
  );

  const startEdit = () => {
    setPrice(current ? String(current.price) : '');
    setDate(getLocalDateStr());
    setNote('');
    setError('');
    setEditing(true);
  };

  const save = async () => {
    const p = parseFloat(price);
    if (isNaN(p) || p <= 0) {
      setError('Escribe un precio válido, mayor que 0.');
      return;
    }
    if (!date) {
      setError('Elige desde qué fecha rige este precio.');
      return;
    }
    if (current && Math.abs(current.price - p) < 0.005 && date >= current.effectiveDate) {
      setError('Ese es el mismo precio que ya está vigente. No hace falta registrarlo otra vez.');
      return;
    }
    setSaving(true);
    try {
      await onAdd(p, date, note.trim());
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Precio por prenda</p>
        {!editing && (
          <button onClick={startEdit} className="text-[10px] font-black text-[#2bb297] hover:text-[#1a8a72] uppercase">
            {current ? 'Cambiar precio' : 'Registrar precio'}
          </button>
        )}
      </div>

      {current ? (
        <div className="bg-[#2bb297]/5 border border-[#2bb297]/20 rounded-xl p-3 text-center mb-3">
          <p className="text-[8px] font-black text-slate-400 uppercase">Precio vigente</p>
          <p className="text-2xl font-black text-[#1a8a72] mt-1">{formatCurrency(current.price)}</p>
          <p className="text-[9px] text-slate-400 font-bold mt-0.5">por prenda · desde {formatDate(current.effectiveDate)}</p>
        </div>
      ) : (
        <div className="bg-[#c9a876]/10 border border-[#c9a876]/30 rounded-xl px-3 py-2 mb-3">
          <p className="text-[11px] font-bold text-[#8a6a3f]">
            ⚠️ Todavía no hay precio por prenda. Sin él, el Resumen de rentabilidad no descuenta el costo de la ropa.
          </p>
        </div>
      )}

      {editing && (
        <div className="space-y-3 mb-3 border border-slate-100 rounded-xl p-3 bg-slate-50">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Precio por prenda (Q)</label>
              <input
                type="number" step="0.01" min="0"
                className="w-full px-3 py-2 border border-[#2bb297]/30 rounded-lg text-sm font-black bg-white text-center"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Rige desde</label>
              <input
                type="date"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-bold bg-white"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Nota (opcional)</label>
            <input
              type="text"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white"
              placeholder="Ej. Subió el precio de las pacas"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <p className="text-[9px] text-slate-400 font-bold leading-relaxed">
            Las ventas de antes de esa fecha siguen usando el precio anterior. El cambio queda guardado en el historial.
          </p>
          {error && <p className="text-[10px] text-[#8c3a4b] font-bold">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={saving}
              className="flex-1 bg-[#2bb297] disabled:bg-slate-300 text-white text-xs font-bold py-2 rounded-lg"
            >
              {saving ? 'Guardando...' : 'Guardar precio'}
            </button>
            <button onClick={() => setEditing(false)} className="flex-1 bg-slate-200 text-slate-600 text-xs font-bold py-2 rounded-lg">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div>
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Historial de precios</p>
          <div className="space-y-1.5">
            {history.map((e) => (
              <div key={e.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
                <div className="min-w-0">
                  <p className="text-[11px] font-black text-slate-700">Desde {formatDate(e.effectiveDate)}</p>
                  <p className="text-[9px] text-slate-400 font-bold truncate">
                    {getDisplayName(e.createdByEmail, aliases)}{e.note ? ` · ${e.note}` : ''}
                  </p>
                </div>
                <p className="text-sm font-black text-[#1a8a72] ml-2">{formatCurrency(e.price)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
