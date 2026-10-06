import React, { useState } from 'react';
import { Expense, ExpenseCategoryItem, ExpenseFrequency, ExpenseTemplate } from '../types';
import { formatCurrency, formatDate, getLocalDateStr, getDisplayName, generateId, getExpenseCategoryLabel, getCurrentMonthStr, isTemplateConfirmedForMonth } from '../utils';

interface ExpensesPanelProps {
  expenses: Expense[];
  categories: ExpenseCategoryItem[];
  templates: ExpenseTemplate[];
  aliases: Record<string, string>;
  onAddCategory: (id: string, label: string) => void;
  onAddExpense: (categoryId: string, frequency: ExpenseFrequency, amount: number, date: string, note: string, templateId?: string) => void;
  onEditExpense: (id: string, updates: { categoryId: string; frequency: ExpenseFrequency; amount: number; date: string; note: string }) => void;
  onDeleteExpense: (id: string) => void;
  onAddTemplate: (categoryId: string, defaultAmount: number, note: string) => void;
  onToggleTemplateActive: (id: string, active: boolean) => void;
  onDeleteTemplate: (id: string) => void;
}

const NEW_CATEGORY_VALUE = '__new__';

export const ExpensesPanel: React.FC<ExpensesPanelProps> = ({
  expenses, categories, templates, aliases,
  onAddCategory, onAddExpense, onEditExpense, onDeleteExpense,
  onAddTemplate, onToggleTemplateActive, onDeleteTemplate,
}) => {
  const [categoryId, setCategoryId] = useState('');
  const [newCategoryLabel, setNewCategoryLabel] = useState('');
  const [frequency, setFrequency] = useState<ExpenseFrequency>('variable');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(getLocalDateStr());
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [templateCategoryId, setTemplateCategoryId] = useState('');
  const [templateAmount, setTemplateAmount] = useState('');
  const [templateNote, setTemplateNote] = useState('');
  const [confirmingTemplateId, setConfirmingTemplateId] = useState<string | null>(null);
  const [confirmAmount, setConfirmAmount] = useState('');
  const [confirmDate, setConfirmDate] = useState(getLocalDateStr());

  const sorted = [...expenses].sort((a, b) => b.date.localeCompare(a.date));
  const visible = showAll ? sorted : sorted.slice(0, 6);
  const currentMonth = getCurrentMonthStr();
  const activeTemplates = templates.filter((t) => t.active);

  const resolveCategory = (): string | null => {
    if (categoryId === NEW_CATEGORY_VALUE) {
      const label = newCategoryLabel.trim();
      if (!label) return null;
      const id = generateId();
      onAddCategory(id, label);
      return id;
    }
    return categoryId || null;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = parseFloat(amount);
    if (isNaN(value) || value <= 0) {
      setError('Ingresa un monto válido (mayor a 0).');
      return;
    }
    const resolvedCategoryId = resolveCategory();
    if (!resolvedCategoryId) {
      setError('Elige una categoría, o escribe el nombre de una nueva.');
      return;
    }
    if (editingId) {
      onEditExpense(editingId, { categoryId: resolvedCategoryId, frequency, amount: value, date, note: note.trim() });
    } else {
      onAddExpense(resolvedCategoryId, frequency, value, date, note.trim());
    }
    setCategoryId('');
    setNewCategoryLabel('');
    setAmount('');
    setNote('');
    setDate(getLocalDateStr());
    setError('');
    setEditingId(null);
  };

  const startEdit = (exp: Expense) => {
    setEditingId(exp.id);
    setCategoryId(exp.categoryId);
    setFrequency(exp.frequency);
    setAmount(String(exp.amount));
    setDate(exp.date);
    setNote(exp.note || '');
    setError('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setCategoryId('');
    setNewCategoryLabel('');
    setAmount('');
    setNote('');
    setError('');
  };

  const submitTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    const value = parseFloat(templateAmount);
    if (isNaN(value) || value <= 0 || !templateCategoryId) return;
    onAddTemplate(templateCategoryId, value, templateNote.trim());
    setTemplateCategoryId('');
    setTemplateAmount('');
    setTemplateNote('');
    setShowTemplateForm(false);
  };

  const startConfirm = (template: ExpenseTemplate) => {
    setConfirmingTemplateId(template.id);
    setConfirmAmount(String(template.defaultAmount));
    setConfirmDate(getLocalDateStr());
  };

  const submitConfirm = (template: ExpenseTemplate) => {
    const value = parseFloat(confirmAmount);
    if (isNaN(value) || value <= 0) return;
    onAddExpense(template.categoryId, 'fixed', value, confirmDate, template.note || '', template.id);
    setConfirmingTemplateId(null);
  };

  return (
    <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Gastos recurrentes (plantillas)</p>

      {activeTemplates.length === 0 && !showTemplateForm && (
        <p className="text-[11px] text-slate-400 font-bold mb-2">
          Aún no tienes gastos recurrentes configurados (ej. Renta, Internet) — créalos una vez y cada mes solo los confirmas.
        </p>
      )}

      <div className="space-y-1.5 mb-3">
        {activeTemplates.map((t) => {
          const confirmed = isTemplateConfirmedForMonth(t, expenses, currentMonth);
          return (
            <div key={t.id} className="bg-slate-50 rounded-lg px-3 py-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-black text-slate-700">{getExpenseCategoryLabel(t.categoryId, categories)}</p>
                  <p className="text-[10px] text-slate-400 font-bold">{formatCurrency(t.defaultAmount)}/mes{t.note ? ` · ${t.note}` : ''}</p>
                </div>
                {confirmed ? (
                  <span className="text-[10px] font-black text-[#1a8a72] uppercase">✓ Confirmado este mes</span>
                ) : confirmingTemplateId === t.id ? null : (
                  <button
                    onClick={() => startConfirm(t)}
                    className="text-[10px] font-black text-white bg-[#c9a876] hover:bg-[#8a6a3f] px-3 py-1.5 rounded-lg uppercase shrink-0"
                  >
                    Confirmar mes
                  </button>
                )}
                {!confirmed && (
                  <button
                    onClick={() => { if (confirm('¿Desactivar esta plantilla? El historial de gastos que ya generó no se borra.')) onToggleTemplateActive(t.id, false); }}
                    className="text-[#8c3a4b]/60 hover:text-[#8c3a4b] text-[10px] px-1 ml-2 shrink-0"
                  >
                    ✕
                  </button>
                )}
              </div>
              {confirmingTemplateId === t.id && (
                <div className="mt-2 pt-2 border-t border-slate-200 flex flex-wrap items-end gap-2">
                  <div>
                    <label className="block text-[8px] font-black text-slate-400 uppercase mb-0.5">Monto</label>
                    <input
                      type="number" step="0.01" min="0"
                      className="w-24 px-2 py-1 border border-slate-200 rounded text-xs font-bold"
                      value={confirmAmount}
                      onChange={(e) => setConfirmAmount(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-[8px] font-black text-slate-400 uppercase mb-0.5">Fecha</label>
                    <input
                      type="date"
                      className="px-2 py-1 border border-slate-200 rounded text-xs font-bold"
                      value={confirmDate}
                      onChange={(e) => setConfirmDate(e.target.value)}
                      max={getLocalDateStr()}
                    />
                  </div>
                  <button onClick={() => submitConfirm(t)} className="bg-[#2bb297] text-white text-[10px] font-black px-3 py-1.5 rounded-lg uppercase">Guardar</button>
                  <button onClick={() => setConfirmingTemplateId(null)} className="bg-slate-200 text-slate-600 text-[10px] font-black px-3 py-1.5 rounded-lg uppercase">Cancelar</button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showTemplateForm ? (
        <form onSubmit={submitTemplate} className="space-y-2 bg-slate-50 p-3 rounded-xl mb-4">
          <div className="grid grid-cols-2 gap-2">
            <select
              className="px-2 py-1.5 border border-slate-200 rounded-lg text-xs font-bold"
              value={templateCategoryId}
              onChange={(e) => setTemplateCategoryId(e.target.value)}
            >
              <option value="">-- Categoría --</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
            <input
              type="number" step="0.01" min="0"
              className="px-2 py-1.5 border border-slate-200 rounded-lg text-xs font-bold"
              placeholder="Monto mensual (Q)"
              value={templateAmount}
              onChange={(e) => setTemplateAmount(e.target.value)}
            />
          </div>
          <input
            type="text"
            className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs"
            placeholder="Nota (opcional)"
            value={templateNote}
            onChange={(e) => setTemplateNote(e.target.value)}
          />
          <div className="flex gap-2">
            <button type="submit" className="flex-1 bg-[#c9a876] text-white text-xs font-bold py-1.5 rounded-lg">Crear plantilla</button>
            <button type="button" onClick={() => setShowTemplateForm(false)} className="flex-1 bg-slate-200 text-slate-600 text-xs font-bold py-1.5 rounded-lg">Cancelar</button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setShowTemplateForm(true)}
          className="w-full mb-4 py-1.5 border-2 border-dashed border-slate-200 rounded-lg text-[10px] font-black text-slate-400 hover:border-[#c9a876] hover:text-[#8a6a3f] transition uppercase"
        >
          + Nueva plantilla recurrente
        </button>
      )}

      <div className="border-t border-slate-100 pt-4">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
          {editingId ? 'Editar gasto' : 'Registrar gasto suelto'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-2 mb-4">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Categoría</label>
              <select
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-bold"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                <option value="">-- Seleccionar --</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                <option value={NEW_CATEGORY_VALUE}>+ Crear categoría nueva...</option>
              </select>
              {categoryId === NEW_CATEGORY_VALUE && (
                <input
                  type="text"
                  autoFocus
                  className="w-full mt-1.5 px-3 py-2 border border-[#2bb297]/30 rounded-lg text-sm bg-[#2bb297]/5"
                  placeholder="Nombre de la categoría (ej. Sticker)"
                  value={newCategoryLabel}
                  onChange={(e) => setNewCategoryLabel(e.target.value)}
                />
              )}
            </div>
            <div>
              <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Tipo</label>
              <div className="flex gap-1 bg-slate-50 rounded-lg p-1 border border-slate-200">
                <button type="button" onClick={() => setFrequency('fixed')} className={`flex-1 py-1.5 rounded-md text-[10px] font-black uppercase transition ${frequency === 'fixed' ? 'bg-white text-[#1a8a72] shadow-sm' : 'text-slate-400'}`}>Fijo</button>
                <button type="button" onClick={() => setFrequency('variable')} className={`flex-1 py-1.5 rounded-md text-[10px] font-black uppercase transition ${frequency === 'variable' ? 'bg-white text-[#1a8a72] shadow-sm' : 'text-slate-400'}`}>Variable</button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Monto (Q)</label>
              <input type="number" step="0.01" min="0" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-bold" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Ej. 85" />
            </div>
            <div>
              <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Fecha</label>
              <input type="date" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-bold" value={date} onChange={(e) => setDate(e.target.value)} max={getLocalDateStr()} />
            </div>
          </div>

          <div>
            <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Nota (opcional)</label>
            <input type="text" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Opcional" />
          </div>

          {error && <p className="text-[10px] text-[#8c3a4b] font-bold">{error}</p>}

          <div className="flex gap-2">
            <button type="submit" className="flex-1 bg-[#2bb297] hover:bg-[#1a8a72] text-white font-bold py-2 rounded-lg text-sm transition">
              {editingId ? 'Guardar cambios' : 'Registrar gasto'}
            </button>
            {editingId && (
              <button type="button" onClick={cancelEdit} className="px-4 bg-slate-200 text-slate-600 rounded-lg text-sm font-bold">Cancelar</button>
            )}
          </div>
        </form>
      </div>

      {sorted.length === 0 ? (
        <p className="text-center text-slate-400 py-4 text-xs">Aún no hay gastos registrados.</p>
      ) : (
        <div className="border-t border-slate-100 pt-3 space-y-1.5">
          {visible.map((exp) => (
            <div key={exp.id} className="flex items-center justify-between text-[11px] px-3 py-2 bg-slate-50 rounded-lg">
              <div>
                <p className="font-black text-slate-700">
                  {getExpenseCategoryLabel(exp.categoryId, categories)}
                  <span className={`ml-2 text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${exp.frequency === 'fixed' ? 'bg-[#c9a876]/15 text-[#8a6a3f]' : 'bg-slate-200 text-slate-500'}`}>
                    {exp.frequency === 'fixed' ? 'Fijo' : 'Variable'}
                  </span>
                  {exp.templateId && <span className="ml-1 text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-[#2bb297]/10 text-[#1a8a72]">Plantilla</span>}
                </p>
                <p className="text-slate-400 font-bold">{formatDate(exp.date)}{exp.note ? ` · ${exp.note}` : ''}</p>
                <p className="text-slate-300 font-bold">{getDisplayName(exp.createdByEmail, aliases)}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-black text-[#8c3a4b]">{formatCurrency(exp.amount)}</span>
                <button onClick={() => startEdit(exp)} className="text-[#2bb297] hover:text-[#1a8a72] text-[10px] font-black uppercase px-1">Editar</button>
                <button onClick={() => { if (confirm('¿Eliminar este gasto?')) onDeleteExpense(exp.id); }} className="text-[#8c3a4b]/60 hover:text-[#8c3a4b] px-1">✕</button>
              </div>
            </div>
          ))}
          {sorted.length > 6 && (
            <button onClick={() => setShowAll(!showAll)} className="w-full text-[10px] font-black text-slate-400 hover:text-slate-600 uppercase tracking-widest pt-1">
              {showAll ? '▲ Ver menos' : `▼ Ver todos (${sorted.length})`}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
