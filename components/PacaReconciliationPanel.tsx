import React, { useMemo, useState } from 'react';
import { InventoryItem, Paca, PacaAllocation, PacaReconciliation, Sale } from '../types';
import {
  formatCurrency, formatDate, getLocalDateStr, generateId, getDisplayName,
  getSalesInRange, getSoldQuantityForCode,
} from '../utils';

interface PacaReconciliationPanelProps {
  inventory: InventoryItem[];
  pacas: Paca[];
  sales: Sale[];
  reconciliations: PacaReconciliation[];
  aliases: Record<string, string>;
  onSave: (reconciliation: Omit<PacaReconciliation, 'id' | 'createdByEmail' | 'createdAt'>, existingId?: string) => void;
  onDelete: (id: string) => void;
}

export const PacaReconciliationPanel: React.FC<PacaReconciliationPanelProps> = ({
  inventory, pacas, sales, reconciliations, aliases, onSave, onDelete,
}) => {
  const [code, setCode] = useState('');
  const [startDate, setStartDate] = useState(getLocalDateStr());
  const [endDate, setEndDate] = useState(getLocalDateStr());
  const [rows, setRows] = useState<{ id: string; pacaId: string; quantity: string }[]>([]);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showList, setShowList] = useState(false);

  const soldQuantity = useMemo(() => {
    if (!code || !startDate || !endDate) return 0;
    const inRange = getSalesInRange(sales, startDate, endDate);
    return getSoldQuantityForCode(inRange, code);
  }, [sales, code, startDate, endDate]);

  const rowsTotal = rows.reduce((acc, r) => acc + (parseInt(r.quantity, 10) || 0), 0);
  const matchesTotal = rowsTotal === soldQuantity && soldQuantity > 0;

  const addRow = () => setRows((prev) => [...prev, { id: generateId(), pacaId: '', quantity: '' }]);
  const removeRow = (id: string) => setRows((prev) => prev.filter((r) => r.id !== id));
  const updateRow = (id: string, updates: Partial<{ pacaId: string; quantity: string }>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...updates } : r)));

  const resetForm = () => {
    setCode('');
    setRows([]);
    setEditingId(null);
    setError('');
  };

  const loadForEdit = (r: PacaReconciliation) => {
    setCode(r.code);
    setStartDate(r.startDate);
    setEndDate(r.endDate);
    setRows(r.allocations.map((a) => ({ id: generateId(), pacaId: a.pacaId, quantity: String(a.quantity) })));
    setEditingId(r.id);
    setError('');
    setShowList(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code) {
      setError('Elige a qué prenda corresponde este costeo.');
      return;
    }
    if (endDate < startDate) {
      setError('La fecha final no puede ser anterior a la inicial.');
      return;
    }
    if (soldQuantity === 0) {
      setError('No hay ventas de esta prenda en ese rango de fechas.');
      return;
    }
    const cleanRows = rows.filter((r) => r.pacaId && parseInt(r.quantity, 10) > 0);
    if (cleanRows.length === 0) {
      setError('Agrega al menos una paca con cantidad.');
      return;
    }
    const total = cleanRows.reduce((acc, r) => acc + parseInt(r.quantity, 10), 0);
    if (total !== soldQuantity) {
      setError(`Las cantidades deben sumar exactamente ${soldQuantity} (lo vendido en ese rango).`);
      return;
    }

    const allocations: PacaAllocation[] = cleanRows.map((r) => ({
      pacaId: r.pacaId,
      pacaCode: pacas.find((p) => p.id === r.pacaId)?.code || '',
      quantity: parseInt(r.quantity, 10),
    }));

    onSave({ code, startDate, endDate, totalQuantity: soldQuantity, allocations }, editingId || undefined);
    resetForm();
  };

  const sortedReconciliations = [...reconciliations].sort((a, b) => b.endDate.localeCompare(a.endDate));

  return (
    <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Costear ventas por sticker</p>
      <p className="text-[10px] text-slate-400 font-bold mb-4">
        Elige la prenda y el rango de fechas (ej. la semana que te reportó la vendedora), y reparte lo vendido entre las pacas según el sticker de color de cada etiqueta física.
      </p>

      <form onSubmit={handleSubmit} className="space-y-2 pb-4 border-b border-slate-100 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div className="sm:col-span-1">
            <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Prenda</label>
            <select
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-bold"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              disabled={!!editingId}
            >
              <option value="">-- Seleccionar --</option>
              {inventory.map((inv) => (
                <option key={inv.id} value={inv.code}>{inv.code} - {inv.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Desde</label>
            <input
              type="date"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-bold"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              max={endDate}
              disabled={!!editingId}
            />
          </div>
          <div>
            <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Hasta</label>
            <input
              type="date"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-bold"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              min={startDate}
              max={getLocalDateStr()}
              disabled={!!editingId}
            />
          </div>
        </div>

        {code && (
          <div className="bg-slate-50 rounded-lg px-3 py-2">
            <p className="text-[11px] font-bold text-slate-600">
              Vendidas en ese rango: <span className="font-black text-slate-800">{soldQuantity}</span> prenda(s)
            </p>
          </div>
        )}

        {pacas.length === 0 ? (
          <p className="text-[11px] text-slate-400 font-bold">Registra primero al menos una paca en el catálogo de arriba.</p>
        ) : (
          <div className="space-y-2">
            {rows.map((row) => (
              <div key={row.id} className="flex items-center gap-2">
                <select
                  className="flex-1 px-2 py-1.5 border border-slate-200 rounded-lg text-xs font-bold"
                  value={row.pacaId}
                  onChange={(e) => updateRow(row.id, { pacaId: e.target.value })}
                >
                  <option value="">-- Paca --</option>
                  {pacas.map((p) => (
                    <option key={p.id} value={p.id}>{p.code} ({formatCurrency(p.unitCost)}/prenda)</option>
                  ))}
                </select>
                <input
                  type="number"
                  min="1"
                  className="w-20 px-2 py-1.5 border border-slate-200 rounded-lg text-xs font-bold text-center"
                  placeholder="Cant."
                  value={row.quantity}
                  onChange={(e) => updateRow(row.id, { quantity: e.target.value })}
                />
                <button type="button" onClick={() => removeRow(row.id)} className="text-[#8c3a4b]/60 hover:text-[#8c3a4b] px-1">✕</button>
              </div>
            ))}
            <button
              type="button"
              onClick={addRow}
              className="w-full py-1.5 border-2 border-dashed border-slate-200 rounded-lg text-[10px] font-black text-slate-400 hover:border-[#2bb297] hover:text-[#1a8a72] transition uppercase"
            >
              + Agregar paca
            </button>
            {rows.length > 0 && (
              <p className={`text-[11px] font-bold ${matchesTotal ? 'text-[#1a8a72]' : 'text-[#8c3a4b]'}`}>
                Suma actual: {rowsTotal} / {soldQuantity} {matchesTotal ? '✓' : ''}
              </p>
            )}
          </div>
        )}

        {error && <p className="text-[10px] text-[#8c3a4b] font-bold">{error}</p>}

        <div className="flex gap-2">
          <button type="submit" className="flex-1 bg-[#2bb297] hover:bg-[#1a8a72] text-white font-bold py-2 rounded-lg text-sm transition">
            {editingId ? 'Guardar cambios' : 'Guardar costeo'}
          </button>
          {editingId && (
            <button type="button" onClick={resetForm} className="px-4 bg-slate-200 text-slate-600 rounded-lg text-sm font-bold">Cancelar</button>
          )}
        </div>
      </form>

      <button
        onClick={() => setShowList(!showList)}
        className="text-[10px] font-black text-slate-400 hover:text-slate-600 uppercase tracking-widest"
      >
        {showList ? '▲ Ocultar costeos guardados' : `▼ Ver costeos guardados (${reconciliations.length})`}
      </button>

      {showList && (
        <div className="mt-2 space-y-1.5 max-h-72 overflow-y-auto">
          {sortedReconciliations.length === 0 ? (
            <p className="text-center text-slate-400 py-4 text-xs">Aún no hay ningún costeo guardado.</p>
          ) : (
            sortedReconciliations.map((r) => (
              <div key={r.id} className="flex items-center justify-between text-[11px] px-3 py-2 bg-slate-50 rounded-lg">
                <div>
                  <p className="font-black text-slate-700">
                    {r.code} · {formatDate(r.startDate)} – {formatDate(r.endDate)}
                  </p>
                  <p className="text-slate-400 font-bold">
                    {r.totalQuantity} prenda(s): {r.allocations.map((a) => `${a.quantity} de ${a.pacaCode}`).join(', ')}
                  </p>
                  <p className="text-slate-300 font-bold">{getDisplayName(r.createdByEmail, aliases)}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <button onClick={() => loadForEdit(r)} className="text-[#2bb297] hover:text-[#1a8a72] font-black text-[10px] uppercase px-1">Editar</button>
                  <button
                    onClick={() => { if (confirm('¿Eliminar este costeo? Esas prendas volverán a quedar pendientes.')) onDelete(r.id); }}
                    className="text-[#8c3a4b]/60 hover:text-[#8c3a4b] px-1"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
