import React, { useState } from 'react';
import { DailyClosing, Sale, UserRole } from '../types';
import { formatCurrency, formatDate, getCashStatus, getDisplayName, isSameLocalDay, PAYMENT_METHODS } from '../utils';
import { buildDayReportPdf, dayReportFileName, downloadPdf } from '../reportPdf';

interface ClosingsPanelProps {
  closings: DailyClosing[];
  sales: Sale[];
  aliases: Record<string, string>;
  role: UserRole | null;
  onMarkSeen: (closing: DailyClosing) => void;
}

// Para la administradora: cierres del día enviados por la vendedora, con el
// cuadre de efectivo. Los que aún no ha revisado salen marcados como NUEVO.
export const ClosingsPanel: React.FC<ClosingsPanelProps> = ({ closings, sales, aliases, role, onMarkSeen }) => {
  const [expanded, setExpanded] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  if (role !== 'admin' || closings.length === 0) return null;

  const sorted = [...closings].sort((a, b) => b.date.localeCompare(a.date));
  const unseen = sorted.filter((c) => !c.seenAt).length;
  const latest = sorted[0];
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const sent30 = sorted.filter((c) => c.date >= cutoff.toISOString().slice(0, 10)).reduce((acc, c) => acc + (c.sentToAdmin || 0), 0);
  const visible = expanded ? sorted.slice(0, 31) : sorted.slice(0, 3);

  const pdf = async (c: DailyClosing) => {
    setBusyId(c.id);
    try {
      const daySales = sales.filter((s) => isSameLocalDay(s.date, c.date)).sort((a, b) => a.correlative - b.correlative);
      downloadPdf(await buildDayReportPdf(daySales, c.date, aliases, c), dayReportFileName(c.date));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 mb-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
          Cierres del día
          {unseen > 0 && <span className="ml-2 bg-[#8c3a4b] text-white px-2 py-0.5 rounded-full normal-case tracking-normal">{unseen} nuevo{unseen === 1 ? '' : 's'}</span>}
        </p>
        {sorted.length > 3 && (
          <button onClick={() => setExpanded(!expanded)} className="text-[10px] font-black text-[#2bb297] hover:text-[#1a8a72] uppercase">
            {expanded ? 'Ver menos' : `Ver todos (${sorted.length})`}
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-slate-50 rounded-xl px-3 py-2">
          <p className="text-[9px] font-black text-slate-400 uppercase">Caja chica (último cierre)</p>
          <p className="text-lg font-black text-slate-800">{formatCurrency(latest.keptInBox)}</p>
          <p className="text-[9px] text-slate-400 font-bold">al {formatDate(latest.date)}</p>
        </div>
        <div className="bg-slate-50 rounded-xl px-3 py-2">
          <p className="text-[9px] font-black text-slate-400 uppercase">Enviado a la admin (30 días)</p>
          <p className="text-lg font-black text-[#1a8a72]">{formatCurrency(sent30)}</p>
        </div>
      </div>

      <div className="space-y-2">
        {visible.map((c) => {
          const cash = getCashStatus(c);
          return (
            <div key={c.id} className={`rounded-xl border px-3 py-3 ${c.seenAt ? 'border-slate-100 bg-slate-50' : 'border-[#c9a876]/50 bg-[#c9a876]/10'}`}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-sm font-black text-slate-800">
                    {formatDate(c.date)}
                    {!c.seenAt && <span className="ml-2 text-[9px] font-black text-white bg-[#8c3a4b] px-1.5 py-0.5 rounded-full align-middle">NUEVO</span>}
                  </p>
                  <p className="text-[10px] text-slate-400 font-bold">
                    {getDisplayName(c.closedByEmail, aliases)} · {new Date(c.closedAt).toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit' })}
                    {c.seenAt && ` · visto por ${getDisplayName(c.seenByEmail, aliases)}`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-black text-[#1a8a72]">{formatCurrency(c.totalSold)}</p>
                  <p className="text-[10px] text-slate-400 font-bold">{c.salesCount} venta(s) · {c.itemsCount} prenda(s)</p>
                </div>
              </div>

              <div className="mt-2 flex items-center justify-between gap-3 flex-wrap">
                <div className="text-[11px] font-bold text-slate-500">
                  Efectivo: sistema {formatCurrency(c.expectedCash)} · contado {formatCurrency(c.countedCash)}{' '}
                  <span className={`font-black px-2 py-0.5 rounded-full ${cash.ok ? 'bg-[#2bb297]/15 text-[#1a8a72]' : 'bg-[#8c3a4b]/15 text-[#8c3a4b]'}`}>{cash.label}</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => pdf(c)} disabled={busyId === c.id} className="text-[10px] font-black text-slate-600 border border-slate-300 hover:bg-slate-100 px-2.5 py-1 rounded-lg uppercase">
                    PDF
                  </button>
                  {!c.seenAt && (
                    <button onClick={() => onMarkSeen(c)} className="text-[10px] font-black text-white bg-[#2bb297] hover:bg-[#1a8a72] px-2.5 py-1 rounded-lg uppercase">
                      Marcar visto
                    </button>
                  )}
                </div>
              </div>

              <p className="text-[11px] font-bold text-slate-600 mt-1.5">
                {c.sentToAdmin > 0 && <span className="text-[#8a6a3f]">Enviado a la administradora: {formatCurrency(c.sentToAdmin)} · </span>}
                Queda en caja chica: {formatCurrency(c.keptInBox)}
                <span className="text-slate-400"> (abrió con {formatCurrency(c.openingCash)} + {formatCurrency(c.cashSales)} cobrado{c.purchasesTotal > 0 ? ` − ${formatCurrency(c.purchasesTotal)} en compras` : ''})</span>
              </p>
              <p className="text-[10px] text-slate-400 font-bold mt-1">
                {PAYMENT_METHODS.filter((m) => (c.byMethod?.[m.value] || 0) > 0).map((m) => `${m.label}: ${formatCurrency(c.byMethod[m.value])}`).join(' · ')}
                {c.cancelledCount > 0 && ` · ${c.cancelledCount} anulada(s)`}
              </p>
              {c.note && <p className="text-[11px] text-slate-600 font-bold mt-1">📝 {c.note}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
};
