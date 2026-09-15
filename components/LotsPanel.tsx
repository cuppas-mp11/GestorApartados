import React, { useMemo, useState } from 'react';
import { InventoryItem, Lot, UserRole } from '../types';
import { getWeeksInStore, getLotAlertLevel, formatDate } from '../utils';

interface LotsPanelProps {
  inventory: InventoryItem[];
  lots: Lot[];
  role: UserRole | null;
  onDeleteLot: (id: string) => void;
}

const cardStyles = {
  green: 'bg-emerald-50 border-emerald-300 text-emerald-800',
  amber: 'bg-amber-50 border-amber-300 text-amber-800',
  red: 'bg-[#8c3a4b]/10 border-[#8c3a4b]/40 text-[#8c3a4b]',
};

const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

interface LabelGroup {
  label: string;
  entryDate: string;
  totalIn: number;
  totalRemaining: number;
  weeks: number;
}

export const LotsPanel: React.FC<LotsPanelProps> = ({ inventory, lots, role, onDeleteLot }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'TIMELINE_ASC' | 'TIMELINE_DESC' | 'MONTH' | 'YEAR'>('TIMELINE_ASC');
  const [selectedMonth, setSelectedMonth] = useState<string>(''); // "2026-09"
  const [selectedYear, setSelectedYear] = useState<string>(''); // "2026"

  const findName = (code: string) => inventory.find((i) => i.code === code)?.name || code;

  // Agrupa todos los lotes por etiqueta (ej. todos los "SEP03" juntos, sin importar el código)
  const groups: LabelGroup[] = useMemo(() => {
    const map = new Map<string, LabelGroup>();
    for (const lot of lots) {
      const existing = map.get(lot.label);
      if (existing) {
        existing.totalIn += lot.quantityIn;
        existing.totalRemaining += lot.quantityRemaining;
      } else {
        map.set(lot.label, {
          label: lot.label,
          entryDate: lot.entryDate,
          totalIn: lot.quantityIn,
          totalRemaining: lot.quantityRemaining,
          weeks: getWeeksInStore(lot.entryDate),
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => new Date(a.entryDate).getTime() - new Date(b.entryDate).getTime());
  }, [lots]);

  const availableMonths = useMemo(() => {
    const set = new Set(groups.map((g) => g.entryDate.substring(0, 7))); // "2026-09"
    return Array.from(set).sort();
  }, [groups]);

  const availableYears = useMemo(() => {
    const set = new Set(groups.map((g) => g.entryDate.substring(0, 4)));
    return Array.from(set).sort();
  }, [groups]);

  const visibleGroups = groups
    .filter((g) => {
      if (viewMode === 'MONTH' && selectedMonth) return g.entryDate.startsWith(selectedMonth);
      if (viewMode === 'YEAR' && selectedYear) return g.entryDate.startsWith(selectedYear);
      return true; // TIMELINE_ASC / TIMELINE_DESC muestran todo
    })
    .sort((a, b) => {
      const diff = new Date(a.entryDate).getTime() - new Date(b.entryDate).getTime();
      return viewMode === 'TIMELINE_DESC' ? -diff : diff;
    });

  // Lotes individuales (por código) que pertenecen a la etiqueta seleccionada, para la vista de detalle
  const detailLots = selectedLabel
    ? lots
        .filter((l) => l.label === selectedLabel)
        .map((l) => ({ ...l, weeks: getWeeksInStore(l.entryDate) }))
        .sort((a, b) => a.code.localeCompare(b.code))
    : [];

  const close = () => {
    setIsOpen(false);
    setSelectedLabel(null);
  };

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

  // ---------- VISTA DE DETALLE (un lote específico) ----------
  if (selectedLabel) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-hidden flex flex-col">
          <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
            <div>
              <button onClick={() => setSelectedLabel(null)} className="text-[10px] text-blue-500 font-black uppercase mb-1">← Volver al panorama</button>
              <h2 className="text-lg font-bold text-slate-800">Lote {selectedLabel}</h2>
            </div>
            <button onClick={close} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
          </div>

          <div className="p-5 overflow-y-auto flex-1 space-y-2">
            {detailLots.map((lot) => {
              const alert = getLotAlertLevel(lot.weeks);
              return (
                <div key={lot.id} className={`p-3 border rounded-xl flex items-center justify-between ${cardStyles[alert.level]}`}>
                  <div>
                    <span className="text-[10px] font-black bg-white/70 px-1.5 py-0.5 rounded border border-current/20">{lot.code}</span>
                    <p className="text-sm font-bold mt-1">{findName(lot.code)}</p>
                    <p className="text-[10px] font-bold uppercase mt-0.5">
                      Quedan {lot.quantityRemaining} de {lot.quantityIn} · {lot.weeks} semana{lot.weeks !== 1 ? 's' : ''} · {formatDate(lot.entryDate)}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <span className="text-[10px] font-black uppercase px-2 py-1 rounded-full bg-white/70">{alert.label}</span>
                    {role === 'admin' && (
                      <button
                        onClick={() => { if (confirm('¿Eliminar este lote?')) onDeleteLot(lot.id); }}
                        className="text-[9px] font-black underline opacity-70 hover:opacity-100"
                      >
                        Eliminar
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="p-4 border-t bg-slate-50 flex justify-end">
            <button onClick={close} className="px-5 py-2 bg-slate-800 text-white rounded-lg font-bold text-sm">Finalizar</button>
          </div>
        </div>
      </div>
    );
  }

  // ---------- VISTA GENERAL (panorama de todos los lotes) ----------
  let lastMonthKey = '';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col">
        <div className="p-5 border-b border-slate-100 bg-slate-50">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-bold text-slate-800">Rotación de Lotes</h2>
            <button onClick={close} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Ordenar por:</span>
            <button
              onClick={() => setViewMode('TIMELINE_ASC')}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase border transition ${viewMode === 'TIMELINE_ASC' ? 'bg-slate-900 text-white border-slate-900' : 'text-slate-500 border-slate-200 hover:bg-slate-100'}`}
            >
              Más antiguo
            </button>
            <button
              onClick={() => setViewMode('TIMELINE_DESC')}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase border transition ${viewMode === 'TIMELINE_DESC' ? 'bg-slate-900 text-white border-slate-900' : 'text-slate-500 border-slate-200 hover:bg-slate-100'}`}
            >
              Más nuevo
            </button>
            <button
              onClick={() => { setViewMode('MONTH'); if (!selectedMonth && availableMonths.length) setSelectedMonth(availableMonths[availableMonths.length - 1]); }}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase border transition ${viewMode === 'MONTH' ? 'bg-slate-900 text-white border-slate-900' : 'text-slate-500 border-slate-200 hover:bg-slate-100'}`}
            >
              Mes
            </button>
            <button
              onClick={() => { setViewMode('YEAR'); if (!selectedYear && availableYears.length) setSelectedYear(availableYears[availableYears.length - 1]); }}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase border transition ${viewMode === 'YEAR' ? 'bg-slate-900 text-white border-slate-900' : 'text-slate-500 border-slate-200 hover:bg-slate-100'}`}
            >
              Año
            </button>

            {viewMode === 'MONTH' && (
              <select
                className="ml-1 px-2 py-1.5 border border-slate-200 rounded-lg text-[11px] font-bold"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
              >
                {availableMonths.map((m) => (
                  <option key={m} value={m}>{MONTH_NAMES[parseInt(m.substring(5, 7)) - 1]} {m.substring(0, 4)}</option>
                ))}
              </select>
            )}
            {viewMode === 'YEAR' && (
              <select
                className="ml-1 px-2 py-1.5 border border-slate-200 rounded-lg text-[11px] font-bold"
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
              >
                {availableYears.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div className="p-5 overflow-y-auto flex-1">
          {visibleGroups.length === 0 ? (
            <p className="text-center text-slate-400 py-8 text-sm">Aún no hay lotes registrados.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {visibleGroups.map((g) => {
                const monthKey = g.entryDate.substring(0, 7);
                const showDivider = (viewMode === 'TIMELINE_ASC' || viewMode === 'TIMELINE_DESC') && monthKey !== lastMonthKey;
                lastMonthKey = monthKey;
                const alert = getLotAlertLevel(g.weeks);
                return (
                  <React.Fragment key={g.label}>
                    {showDivider && (
                      <div className="col-span-2 sm:col-span-3 text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2 first:mt-0 border-t border-slate-100 pt-2 first:border-t-0 first:pt-0">
                        {MONTH_NAMES[parseInt(monthKey.substring(5, 7)) - 1]} {monthKey.substring(0, 4)}
                      </div>
                    )}
                    <button
                      onClick={() => setSelectedLabel(g.label)}
                      className={`p-3 rounded-xl border-2 text-left hover:shadow-md transition ${cardStyles[alert.level]}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-black">{g.label}</span>
                        <span className="text-xs font-bold bg-white/70 px-2 py-0.5 rounded">{g.totalRemaining} de {g.totalIn}</span>
                      </div>
                      <p className="text-[10px] font-bold mt-2">{formatDate(g.entryDate)}</p>
                      <p className="text-[9px] font-black uppercase mt-1">{alert.label}</p>
                    </button>
                  </React.Fragment>
                );
              })}
            </div>
          )}
        </div>

        <div className="p-4 border-t bg-slate-50 flex justify-end">
          <button onClick={close} className="px-5 py-2 bg-slate-800 text-white rounded-lg font-bold text-sm">Finalizar</button>
        </div>
      </div>
    </div>
  );
};

