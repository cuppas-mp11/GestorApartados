import React, { useState } from 'react';
import { InventoryItem, Lot } from '../types';
import { generateId, getNextLotLabel, formatCurrency } from '../utils';

interface StockEntryFormProps {
  inventory: InventoryItem[];
  existingLotLabels: string[];
  onSubmit: (lots: Lot[]) => void;
}

interface EntryRow {
  id: string;
  code: string; // InventoryItem.id
  quantity: number;
}

export const StockEntryForm: React.FC<StockEntryFormProps> = ({ inventory, existingLotLabels, onSubmit }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [note, setNote] = useState('');
  const [rows, setRows] = useState<EntryRow[]>([{ id: generateId(), code: '', quantity: 1 }]);

  const label = getNextLotLabel(existingLotLabels);

  const addRow = () => setRows([...rows, { id: generateId(), code: '', quantity: 1 }]);
  const removeRow = (id: string) => rows.length > 1 && setRows(rows.filter((r) => r.id !== id));
  const updateRow = (id: string, updates: Partial<EntryRow>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...updates } : r)));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validRows = rows.filter((r) => r.code && r.quantity > 0);
    if (validRows.length === 0) {
      alert('Agrega al menos una prenda con cantidad válida.');
      return;
    }

    const now = new Date().toISOString();
    const newLots: Lot[] = validRows.map((r) => {
      const inv = inventory.find((i) => i.id === r.code)!;
      return {
        id: generateId(),
        code: inv.code,
        label,
        entryDate: now,
        quantityIn: r.quantity,
        quantityRemaining: r.quantity,
        note: note.trim(),
      };
    });

    onSubmit(newLots);
    setRows([{ id: generateId(), code: '', quantity: 1 }]);
    setNote('');
    setIsOpen(false);
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="w-full mb-4 bg-[color:var(--brand,#2bb297)]/10 hover:bg-[color:var(--brand,#2bb297)]/20 text-[#1a8a72] font-bold py-2 rounded-lg transition text-sm flex items-center justify-center gap-2 border border-[#2bb297]/30"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
        </svg>
        Registrar Entrega de Mercadería
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-hidden flex flex-col">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Nueva Entrega de Mercadería</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase">Lote: <span className="text-[#1a8a72]">{label}</span> (se asigna solo)</p>
          </div>
          <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto flex flex-col">
          <div className="p-5 space-y-3 flex-1 overflow-y-auto">
            {inventory.length === 0 ? (
              <div className="bg-amber-50 border border-amber-100 p-4 rounded-xl text-center">
                <p className="text-xs text-amber-700 font-bold">⚠️ Primero agrega prendas al catálogo.</p>
              </div>
            ) : (
              rows.map((row) => (
                <div key={row.id} className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex gap-2 items-center">
                  <select
                    className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-[#2bb297]"
                    value={row.code}
                    onChange={(e) => updateRow(row.id, { code: e.target.value })}
                  >
                    <option value="">-- Seleccionar Prenda --</option>
                    {inventory.map((inv) => (
                      <option key={inv.id} value={inv.id}>
                        {inv.code} - {inv.name} ({formatCurrency(inv.basePrice)})
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="1"
                    className="w-20 px-2 py-2 border border-slate-200 rounded-lg text-sm font-bold text-center"
                    value={row.quantity}
                    onChange={(e) => updateRow(row.id, { quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                  />
                  {rows.length > 1 && (
                    <button type="button" onClick={() => removeRow(row.id)} className="text-rose-400 hover:text-rose-600 p-1">✕</button>
                  )}
                </div>
              ))
            )}
            <button
              type="button"
              onClick={addRow}
              disabled={inventory.length === 0}
              className="w-full py-2 border-2 border-dashed border-slate-200 rounded-xl text-[10px] font-black text-slate-400 hover:border-[#2bb297] hover:text-[#1a8a72] transition uppercase tracking-widest"
            >
              + Agregar otra prenda a esta entrega
            </button>

            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase mb-1 ml-1 tracking-widest">Nota (opcional)</label>
              <input
                type="text"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ej. Entrega proveedor Juana"
              />
            </div>
          </div>

          <div className="p-4 border-t bg-slate-50 flex gap-2">
            <button type="button" onClick={() => setIsOpen(false)} className="flex-1 px-5 py-2 bg-slate-200 text-slate-600 rounded-lg font-bold text-sm">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={inventory.length === 0}
              className="flex-1 px-5 py-2 bg-[#2bb297] disabled:bg-slate-300 text-white rounded-lg font-bold text-sm"
            >
              Guardar Entrega
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
