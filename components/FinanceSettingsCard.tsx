import React, { useState } from 'react';
import { FinanceSettings, UnitCostItem } from '../types';
import { getDisplayName, formatDate, formatCurrency, generateId, getUnitCostsTotal } from '../utils';

interface FinanceSettingsCardProps {
  settings: FinanceSettings;
  aliases: Record<string, string>;
  onSave: (updates: { cardCommissionPercent: number; invoiceTaxPercent: number; vendorCommissionPercent: number; unitCosts: UnitCostItem[] }) => void;
}

export const FinanceSettingsCard: React.FC<FinanceSettingsCardProps> = ({ settings, aliases, onSave }) => {
  const [editing, setEditing] = useState(false);
  const [cardCommission, setCardCommission] = useState(String(settings.cardCommissionPercent || 0));
  const [invoiceTax, setInvoiceTax] = useState(String(settings.invoiceTaxPercent || 0));
  const [vendorCommission, setVendorCommission] = useState(String(settings.vendorCommissionPercent || 0));
  const [unitCosts, setUnitCosts] = useState<UnitCostItem[]>(settings.unitCosts || []);
  const [error, setError] = useState('');

  const startEdit = () => {
    setCardCommission(String(settings.cardCommissionPercent || 0));
    setInvoiceTax(String(settings.invoiceTaxPercent || 0));
    setVendorCommission(String(settings.vendorCommissionPercent || 0));
    setUnitCosts(settings.unitCosts && settings.unitCosts.length > 0 ? settings.unitCosts : []);
    setError('');
    setEditing(true);
  };

  const addUnitCost = () => setUnitCosts((prev) => [...prev, { id: generateId(), label: '', amount: 0 }]);
  const removeUnitCost = (id: string) => setUnitCosts((prev) => prev.filter((u) => u.id !== id));
  const updateUnitCost = (id: string, updates: Partial<UnitCostItem>) =>
    setUnitCosts((prev) => prev.map((u) => (u.id === id ? { ...u, ...updates } : u)));

  const save = () => {
    const cc = parseFloat(cardCommission);
    const it = parseFloat(invoiceTax);
    const vc = parseFloat(vendorCommission);
    if ([cc, it, vc].some((v) => isNaN(v) || v < 0 || v > 100)) {
      setError('Los tres porcentajes deben ser números válidos entre 0 y 100.');
      return;
    }
    const cleanUnitCosts = unitCosts.filter((u) => u.label.trim());
    if (cleanUnitCosts.some((u) => isNaN(u.amount) || u.amount < 0)) {
      setError('Cada costo por prenda necesita un monto válido (0 o más).');
      return;
    }
    onSave({
      cardCommissionPercent: cc,
      invoiceTaxPercent: it,
      vendorCommissionPercent: vc,
      unitCosts: cleanUnitCosts.map((u) => ({ ...u, label: u.label.trim() })),
    });
    setEditing(false);
  };

  const currentUnitCostsTotal = getUnitCostsTotal(settings.unitCosts || []);

  if (!editing) {
    return (
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Configuración financiera</p>
          <button onClick={startEdit} className="text-[10px] font-black text-[#2bb297] hover:text-[#1a8a72] uppercase">
            Editar
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="bg-slate-50 rounded-xl p-3 text-center">
            <p className="text-[8px] font-black text-slate-400 uppercase leading-tight">Comisión tarjeta</p>
            <p className="text-lg font-black text-[#1a8a72] mt-1">{(settings.cardCommissionPercent || 0).toFixed(2)}%</p>
            <p className="text-[8px] text-slate-400 font-bold mt-0.5">solo tarjeta</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-3 text-center">
            <p className="text-[8px] font-black text-slate-400 uppercase leading-tight">IVA de factura</p>
            <p className="text-lg font-black text-[#1a8a72] mt-1">{(settings.invoiceTaxPercent || 0).toFixed(2)}%</p>
            <p className="text-[8px] text-slate-400 font-bold mt-0.5">tarjeta + transf.</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-3 text-center">
            <p className="text-[8px] font-black text-slate-400 uppercase leading-tight">Comisión vendedora</p>
            <p className="text-lg font-black text-[#c9a876] mt-1">{(settings.vendorCommissionPercent || 0).toFixed(2)}%</p>
            <p className="text-[8px] text-slate-400 font-bold mt-0.5">sobre ganancia neta</p>
          </div>
        </div>

        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Costos por prenda vendida</p>
        {(!settings.unitCosts || settings.unitCosts.length === 0) ? (
          <p className="text-[11px] text-slate-400 font-bold">Ninguno configurado todavía.</p>
        ) : (
          <div className="space-y-1">
            {settings.unitCosts.map((u) => (
              <div key={u.id} className="flex items-center justify-between text-[11px] bg-slate-50 rounded-lg px-3 py-1.5">
                <span className="font-bold text-slate-600">{u.label}</span>
                <span className="font-black text-slate-700">{formatCurrency(u.amount)} / prenda</span>
              </div>
            ))}
            <div className="flex items-center justify-between text-[11px] px-3 py-1.5">
              <span className="font-black text-slate-500 uppercase">Total por prenda</span>
              <span className="font-black text-[#1a8a72]">{formatCurrency(currentUnitCostsTotal)}</span>
            </div>
          </div>
        )}

        {settings.updatedAt && (
          <p className="text-[9px] text-slate-400 font-bold mt-3 pt-2 border-t border-slate-100">
            Última actualización: {formatDate(settings.updatedAt)} · {getDisplayName(settings.updatedByEmail, aliases)}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Editar configuración financiera</p>

      <div className="space-y-3 mb-4">
        <div>
          <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">
            Comisión de tarjeta (%) <span className="normal-case text-slate-400">— cobro del procesador (ej. Visa), solo sobre lo pagado con tarjeta</span>
          </label>
          <input
            type="number" step="0.01" min="0" max="100"
            className="w-28 px-3 py-2 border border-[#2bb297]/30 rounded-lg text-sm font-black bg-[#2bb297]/5 text-center"
            value={cardCommission}
            onChange={(e) => setCardCommission(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">
            IVA de factura (%) <span className="normal-case text-slate-400">— aplica a tarjeta Y a transferencia/depósito (ambos generan factura)</span>
          </label>
          <input
            type="number" step="0.01" min="0" max="100"
            className="w-28 px-3 py-2 border border-[#2bb297]/30 rounded-lg text-sm font-black bg-[#2bb297]/5 text-center"
            value={invoiceTax}
            onChange={(e) => setInvoiceTax(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">
            Comisión de vendedora (%) <span className="normal-case text-slate-400">— sobre la ganancia neta del periodo, puede cambiar cada mes</span>
          </label>
          <input
            type="number" step="0.01" min="0" max="100"
            className="w-28 px-3 py-2 border border-[#c9a876]/40 rounded-lg text-sm font-black bg-[#c9a876]/10 text-center"
            value={vendorCommission}
            onChange={(e) => setVendorCommission(e.target.value)}
          />
        </div>
      </div>

      <div className="border-t border-slate-100 pt-3">
        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">
          Costos por prenda vendida <span className="normal-case text-slate-400">(planchado, bolsa, plástico, etiqueta...)</span>
        </p>
        <div className="space-y-2">
          {unitCosts.map((u) => (
            <div key={u.id} className="flex items-center gap-2">
              <input
                type="text"
                className="flex-1 px-2 py-1.5 border border-slate-200 rounded-lg text-xs"
                placeholder="Ej. Planchado"
                value={u.label}
                onChange={(e) => updateUnitCost(u.id, { label: e.target.value })}
              />
              <input
                type="number" step="0.01" min="0"
                className="w-20 px-2 py-1.5 border border-slate-200 rounded-lg text-xs font-bold text-center"
                placeholder="Q"
                value={u.amount}
                onChange={(e) => updateUnitCost(u.id, { amount: parseFloat(e.target.value) || 0 })}
              />
              <button onClick={() => removeUnitCost(u.id)} className="text-[#8c3a4b]/60 hover:text-[#8c3a4b] px-1">✕</button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addUnitCost}
          className="w-full mt-2 py-1.5 border-2 border-dashed border-slate-200 rounded-lg text-[10px] font-black text-slate-400 hover:border-[#2bb297] hover:text-[#1a8a72] transition uppercase"
        >
          + Agregar costo por prenda
        </button>
      </div>

      {error && <p className="text-[10px] text-[#8c3a4b] font-bold mt-3">{error}</p>}

      <div className="flex gap-2 mt-4">
        <button onClick={save} className="flex-1 bg-[#2bb297] text-white text-xs font-bold py-2 rounded-lg">Guardar todo</button>
        <button onClick={() => setEditing(false)} className="flex-1 bg-slate-200 text-slate-600 text-xs font-bold py-2 rounded-lg">Cancelar</button>
      </div>
    </div>
  );
};
