import React, { useState } from 'react';
import { FinanceSettings } from '../types';
import { getDisplayName, formatDate } from '../utils';

interface FinanceSettingsCardProps {
  settings: FinanceSettings;
  aliases: Record<string, string>;
  onSave: (cardCommissionPercent: number) => void;
}

export const FinanceSettingsCard: React.FC<FinanceSettingsCardProps> = ({ settings, aliases, onSave }) => {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(settings.cardCommissionPercent || 0));
  const [error, setError] = useState('');

  const startEdit = () => {
    setValue(String(settings.cardCommissionPercent || 0));
    setError('');
    setEditing(true);
  };

  const save = () => {
    const parsed = parseFloat(value);
    if (isNaN(parsed) || parsed < 0 || parsed > 100) {
      setError('Ingresa un porcentaje válido entre 0 y 100.');
      return;
    }
    onSave(parsed);
    setEditing(false);
  };

  return (
    <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Comisión de tarjeta</p>
      <p className="text-[10px] text-slate-400 font-bold mb-3">
        Este % se le resta a lo cobrado con tarjeta para calcular la ganancia real. No se muestra en ningún reporte de ventas normal.
      </p>

      {editing ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="0.01"
              min="0"
              max="100"
              autoFocus
              className="w-24 px-3 py-2 border border-[#2bb297]/30 rounded-lg text-sm font-black bg-[#2bb297]/5 text-center"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            <span className="text-sm font-black text-slate-500">%</span>
          </div>
          {error && <p className="text-[10px] text-[#8c3a4b] font-bold">{error}</p>}
          <div className="flex gap-2">
            <button onClick={save} className="flex-1 bg-[#2bb297] text-white text-xs font-bold py-1.5 rounded-lg">Guardar</button>
            <button onClick={() => setEditing(false)} className="flex-1 bg-slate-200 text-slate-600 text-xs font-bold py-1.5 rounded-lg">Cancelar</button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <p className="text-3xl font-black text-[#1a8a72]">{(settings.cardCommissionPercent || 0).toFixed(2)}%</p>
          <button onClick={startEdit} className="text-[10px] font-black text-[#2bb297] hover:text-[#1a8a72] uppercase">
            Cambiar
          </button>
        </div>
      )}

      {settings.updatedAt && (
        <p className="text-[9px] text-slate-400 font-bold mt-3 pt-2 border-t border-slate-100">
          Última actualización: {formatDate(settings.updatedAt)} · {getDisplayName(settings.updatedByEmail, aliases)}
        </p>
      )}
    </div>
  );
};
