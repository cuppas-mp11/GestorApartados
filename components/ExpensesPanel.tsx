import React, { useState } from 'react';
import { Expense, ExpenseCategory, ExpenseFrequency, EXPENSE_CATEGORY_LABELS } from '../types';
import { formatCurrency, formatDate, getLocalDateStr, getDisplayName } from '../utils';

interface ExpensesPanelProps {
  expenses: Expense[];
  aliases: Record<string, string>;
  onAdd: (category: ExpenseCategory, frequency: ExpenseFrequency, amount: number, date: string, note: string) => void;
  onDelete: (id: string) => void;
}

const CATEGORY_OPTIONS = Object.entries(EXPENSE_CATEGORY_LABELS) as [ExpenseCategory, string][];

export const ExpensesPanel: React.FC<ExpensesPanelProps> = ({ expenses, aliases, onAdd, onDelete }) => {
  const [category, setCategory] = useState<ExpenseCategory>('renta');
  const [frequency, setFrequency] = useState<ExpenseFrequency>('fixed');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(getLocalDateStr());
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [showAll, setShowAll] = useState(false);

  const sorted = [...expenses].sort((a, b) => b.date.localeCompare(a.date));
  const visible = showAll ? sorted : sorted.slice(0, 6);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = parseFloat(amount);
    if (isNaN(value) || value <= 0) {
      setError('Ingresa un monto válido (mayor a 0).');
      return;
    }
    if (category === 'otro' && !note.trim()) {
      setError('Para "Otro", escribe una nota que diga de qué es el gasto.');
      return;
    }
    onAdd(category, frequency, value, date, note.trim());
    setAmount('');
    setNote('');
    setDate(getLocalDateStr());
    setError('');
  };

  return (
    <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Gastos fijos y variables</p>

      <form onSubmit={handleSubmit} className="space-y-2 mb-4">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Categoría</label>
            <select
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-bold"
              value={category}
              onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
            >
              {CATEGORY_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Tipo</label>
            <div className="flex gap-1 bg-slate-50 rounded-lg p-1 border border-slate-200">
              <button
                type="button"
                onClick={() => setFrequency('fixed')}
                className={`flex-1 py-1.5 rounded-md text-[10px] font-black uppercase transition ${frequency === 'fixed' ? 'bg-white text-[#1a8a72] shadow-sm' : 'text-slate-400'}`}
              >
                Fijo
              </button>
              <button
                type="button"
                onClick={() => setFrequency('variable')}
                className={`flex-1 py-1.5 rounded-md text-[10px] font-black uppercase transition ${frequency === 'variable' ? 'bg-white text-[#1a8a72] shadow-sm' : 'text-slate-400'}`}
              >
                Variable
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Monto (Q)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-bold"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Ej. 1500"
            />
          </div>
          <div>
            <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Fecha</label>
            <input
              type="date"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-bold"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              max={getLocalDateStr()}
            />
          </div>
        </div>

        <div>
          <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">
            Nota {category === 'otro' && <span className="text-[#8c3a4b] normal-case">(obligatoria para "Otro")</span>}
          </label>
          <input
            type="text"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={category === 'otro' ? 'Ej. Reparación del datáfono' : 'Opcional'}
          />
        </div>

        {error && <p className="text-[10px] text-[#8c3a4b] font-bold">{error}</p>}

        <button type="submit" className="w-full bg-[#2bb297] hover:bg-[#1a8a72] text-white font-bold py-2 rounded-lg text-sm transition">
          Registrar gasto
        </button>
      </form>

      {sorted.length === 0 ? (
        <p className="text-center text-slate-400 py-4 text-xs">Aún no hay gastos registrados.</p>
      ) : (
        <div className="border-t border-slate-100 pt-3 space-y-1.5">
          {visible.map((exp) => (
            <div key={exp.id} className="flex items-center justify-between text-[11px] px-3 py-2 bg-slate-50 rounded-lg">
              <div>
                <p className="font-black text-slate-700">
                  {EXPENSE_CATEGORY_LABELS[exp.category]}
                  <span className={`ml-2 text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${exp.frequency === 'fixed' ? 'bg-[#c9a876]/15 text-[#8a6a3f]' : 'bg-slate-200 text-slate-500'}`}>
                    {exp.frequency === 'fixed' ? 'Fijo' : 'Variable'}
                  </span>
                </p>
                <p className="text-slate-400 font-bold">{formatDate(exp.date)}{exp.note ? ` · ${exp.note}` : ''}</p>
                <p className="text-slate-300 font-bold">{getDisplayName(exp.createdByEmail, aliases)}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-black text-[#8c3a4b]">{formatCurrency(exp.amount)}</span>
                <button
                  onClick={() => { if (confirm('¿Eliminar este gasto?')) onDelete(exp.id); }}
                  className="text-[#8c3a4b]/60 hover:text-[#8c3a4b] px-1"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
          {sorted.length > 6 && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="w-full text-[10px] font-black text-slate-400 hover:text-slate-600 uppercase tracking-widest pt-1"
            >
              {showAll ? '▲ Ver menos' : `▼ Ver todos (${sorted.length})`}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
