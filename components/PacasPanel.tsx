import React, { useState } from 'react';
import { Paca } from '../types';
import { formatCurrency, formatDate, getLocalDateStr, sortPacasByLatestPurchase, getLatestPurchaseDate, getDisplayName } from '../utils';

interface PacasPanelProps {
  pacas: Paca[];
  aliases: Record<string, string>;
  onRegisterPurchase: (balePrice: number, quantity: number, date: string, note: string) => void;
}

export const PacasPanel: React.FC<PacasPanelProps> = ({ pacas, aliases, onRegisterPurchase }) => {
  const [balePrice, setBalePrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [date, setDate] = useState(getLocalDateStr());
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const sorted = sortPacasByLatestPurchase(pacas);

  const priceNum = parseFloat(balePrice);
  const qtyNum = parseInt(quantity, 10);
  const previewUnitCost = priceNum > 0 && qtyNum > 0 ? priceNum / qtyNum : null;
  const matchingExisting = pacas.find((p) => Math.abs(p.balePrice - priceNum) < 0.01 && p.quantity === qtyNum);

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
    onRegisterPurchase(priceNum, qtyNum, date, note.trim());
    setBalePrice('');
    setQuantity('');
    setNote('');
    setDate(getLocalDateStr());
    setError('');
  };

  return (
    <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Catálogo de pacas</p>
      <p className="text-[10px] text-slate-400 font-bold mb-4">
        Cada compra con el mismo precio y la misma cantidad se agrupa en el mismo código — no se duplica, solo se le suma otra fecha a su historial.
      </p>

      <form onSubmit={handleSubmit} className="space-y-2 pb-4 border-b border-slate-100 mb-4">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Registrar compra de paca</p>
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
              placeholder="Ej. 2500"
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
              placeholder="Ej. 250"
            />
          </div>
        </div>

        {previewUnitCost !== null && (
          <div className={`rounded-lg px-3 py-2 border ${matchingExisting ? 'bg-[#c9a876]/10 border-[#c9a876]/30' : 'bg-[#2bb297]/5 border-[#2bb297]/20'}`}>
            <p className={`text-[10px] font-bold ${matchingExisting ? 'text-[#8a6a3f]' : 'text-[#1a8a72]'}`}>
              Costo unitario: <span className="font-black">{formatCurrency(previewUnitCost)}</span> por prenda
            </p>
            {matchingExisting && (
              <p className="text-[9px] font-bold text-[#8a6a3f] mt-0.5">
                Coincide con <span className="font-black">{matchingExisting.code}</span> — se agregará esta fecha a su historial, no se creará un código nuevo.
              </p>
            )}
          </div>
        )}

        <div>
          <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Fecha de la compra</label>
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
            placeholder="Ej. Blusas, proveedor Juana — sticker rojo"
          />
        </div>

        {error && <p className="text-[10px] text-[#8c3a4b] font-bold">{error}</p>}

        <button type="submit" className="w-full bg-[#2bb297] hover:bg-[#1a8a72] text-white font-bold py-2 rounded-lg text-sm transition">
          {matchingExisting ? `Agregar a ${matchingExisting.code}` : 'Registrar nueva paca'}
        </button>
      </form>

      {sorted.length === 0 ? (
        <p className="text-center text-slate-400 py-4 text-xs">Aún no hay pacas registradas.</p>
      ) : (
        <div className="space-y-1.5 max-h-80 overflow-y-auto">
          {sorted.map((p) => {
            const latest = getLatestPurchaseDate(p);
            const isExpanded = expandedId === p.id;
            return (
              <div key={p.id} className="bg-slate-50 rounded-lg px-3 py-2">
                <button
                  onClick={() => setExpandedId(isExpanded ? null : p.id)}
                  className="w-full flex items-center justify-between text-left"
                >
                  <div>
                    <p className="text-xs font-black text-slate-700">
                      {p.code} <span className="text-slate-400 font-bold">· {formatCurrency(p.unitCost)}/prenda</span>
                    </p>
                    <p className="text-[10px] text-slate-400 font-bold">
                      {formatCurrency(p.balePrice)} ÷ {p.quantity} prendas{p.note ? ` · ${p.note}` : ''}
                      {latest ? ` · última compra ${formatDate(latest)}` : ''}
                    </p>
                  </div>
                  <span className="text-[9px] font-black text-slate-400 uppercase shrink-0 ml-2">
                    {p.purchases.length} compra(s) {isExpanded ? '▲' : '▼'}
                  </span>
                </button>
                {isExpanded && (
                  <ul className="mt-2 pt-2 border-t border-slate-200 space-y-1">
                    {[...p.purchases].sort((a, b) => b.date.localeCompare(a.date)).map((pur) => (
                      <li key={pur.id} className="flex items-center justify-between text-[10px] text-slate-500 font-bold">
                        <span>{formatDate(pur.date)}</span>
                        <span className="text-slate-400">{getDisplayName(pur.createdByEmail, aliases)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
