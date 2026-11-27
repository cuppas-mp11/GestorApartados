import React from 'react';
import { DailyClosing, Sale, SaleStatus } from '../types';
import { formatCurrency, formatDate, getCashStatus, getDisplayName, getSaleTotal, getDailySequenceMap, isSameLocalDay, paymentMethodLabel, PAYMENT_METHODS } from '../utils';

interface ClosingViewProps {
  closing: DailyClosing;
  aliases: Record<string, string>;
  sales?: Sale[]; // para mostrar el detalle de ventas del día (lo mismo que trae el PDF)
  onClose: () => void;
}

// Vista (solo lectura) de un cierre del día, con el diseño del sistema.
// Es lo mismo que trae el PDF, pero se lee en pantalla sin descargar nada.
export const ClosingView: React.FC<ClosingViewProps> = ({ closing: c, aliases, sales, onClose }) => {
  const cash = getCashStatus(c);
  const daySales = (sales || []).filter((s) => isSameLocalDay(s.date, c.date)).sort((a, b) => a.correlative - b.correlative);
  const seq = getDailySequenceMap(daySales);
  const purchases = c.purchasesTotal || 0;
  const Row = ({ label, value, strong, fill, thick }: { label: string; value: string; strong?: boolean; fill?: string; thick?: boolean }) => (
    <div className={`flex justify-between px-3 py-2 text-sm ${fill || ''} ${thick ? 'border-b-2 border-slate-900' : 'border-b border-slate-100'}`}>
      <span className={strong ? 'font-black text-slate-800' : 'font-bold text-slate-600'}>{label}</span>
      <span className={strong ? 'font-black text-slate-900' : 'font-black text-slate-700'}>{value}</span>
    </div>
  );
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[92vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50 flex-shrink-0">
          <div>
            <h2 className="text-lg font-black text-slate-800">Cierre del día</h2>
            <p className="text-xs font-black text-[#8a6a3f] mt-0.5">{formatDate(c.date)}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto">
          <div className="bg-slate-50 rounded-xl p-4 space-y-1.5">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Ventas del día</p>
            <div className="flex justify-between text-sm"><span className="font-bold text-slate-600">Ventas</span><span className="font-black text-slate-800">{c.salesCount}</span></div>
            <div className="flex justify-between text-sm"><span className="font-bold text-slate-600">Prendas</span><span className="font-black text-slate-800">{c.itemsCount}</span></div>
            {PAYMENT_METHODS.map((m) => (c.byMethod?.[m.value] || 0) > 0 && (
              <div key={m.value} className="flex justify-between text-sm">
                <span className="font-bold text-slate-500">{m.label}</span>
                <span className="font-black text-slate-700">{formatCurrency(c.byMethod[m.value])}</span>
              </div>
            ))}
            {c.discountTotal > 0 && <div className="flex justify-between text-sm"><span className="font-bold text-slate-500">Descuentos</span><span className="font-black text-slate-700">{formatCurrency(c.discountTotal)}</span></div>}
            {c.cancelledCount > 0 && <div className="flex justify-between text-sm"><span className="font-bold text-slate-500">Anuladas</span><span className="font-black text-[#8c3a4b]">{c.cancelledCount}</span></div>}
            <div className="flex justify-between text-sm border-t border-slate-200 pt-1.5 mt-1">
              <span className="font-black text-slate-700 uppercase">Total vendido</span>
              <span className="font-black text-[#1a8a72]">{formatCurrency(c.totalSold)}</span>
            </div>
          </div>

          <div className="border-2 border-[#2bb297]/30 rounded-xl overflow-hidden">
            <p className="text-[10px] font-black text-white uppercase tracking-widest bg-[#2bb297] px-3 py-2">Cierre de caja chica (efectivo)</p>
            <Row label="Caja chica (con lo que abrió)" value={formatCurrency(c.openingCash)} />
            <Row label="+ Cobrado en efectivo" value={formatCurrency(c.cashSales)} />
            <Row label="+ Abonos de apartados (efectivo)" value={formatCurrency(c.reservationCash || 0)} />
            <Row label="− Compras pagadas de caja chica" value={purchases > 0 ? `-${formatCurrency(purchases)}` : formatCurrency(0)} thick />
            <Row label="Disponible según el sistema" value={formatCurrency(c.expectedCash)} strong thick />
            <Row label="Efectivo contado por la vendedora" value={formatCurrency(c.countedCash)} strong fill="bg-[#e8f7f2]" />
            <Row label="Enviado a la administradora" value={formatCurrency(c.sentToAdmin || 0)} thick />
            <Row label="Se queda en caja chica" value={formatCurrency(c.keptInBox)} strong fill="bg-slate-200" thick />
            <p className={`text-center text-sm font-black py-2 ${cash.ok ? 'bg-[#e8f7f2] text-[#1a8a72]' : 'bg-[#fbeff1] text-[#8c3a4b]'}`}>{cash.label}</p>
          </div>

          {sales && (
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Detalle de ventas</p>
              {daySales.length === 0 ? (
                <p className="text-xs font-bold text-slate-400">No hay ventas registradas ese día.</p>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="grid grid-cols-[2rem_1fr_auto] gap-x-2 bg-[#2bb297] text-white text-[9px] font-black uppercase px-3 py-1.5">
                    <span>#</span><span>Prendas y pago</span><span className="text-right">Total</span>
                  </div>
                  {daySales.map((s, i) => {
                    const cancelled = s.status === SaleStatus.CANCELLED;
                    return (
                      <div key={s.id} className={`grid grid-cols-[2rem_1fr_auto] gap-x-2 px-3 py-2 text-[11px] border-t border-slate-100 ${cancelled ? 'bg-[#fbeff1] text-[#8c3a4b] line-through' : i % 2 ? 'bg-slate-50' : ''}`}>
                        <span className="font-black">{seq.get(s.id)}</span>
                        <div className="min-w-0">
                          <p className="text-slate-700 break-words">{s.items.map((it) => `${it.quantity > 1 ? it.quantity + '× ' : ''}${it.code} ${it.name}`).join(', ')}</p>
                          <p className="text-[10px] text-slate-400">
                            {s.payments.map((p) => `${paymentMethodLabel(p.method)} ${formatCurrency(p.amount)}`).join(' · ')} · {getDisplayName(s.soldByEmail, aliases)}{cancelled ? ' · ANULADA' : ''}
                          </p>
                        </div>
                        <span className="font-black text-slate-800 text-right">{formatCurrency(getSaleTotal(s))}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {c.note && <p className="text-[12px] text-slate-600 font-bold bg-slate-50 rounded-xl px-3 py-2">📝 {c.note}</p>}
          <p className="text-[10px] text-slate-400 font-bold">
            Enviado por {getDisplayName(c.closedByEmail, aliases)} el {new Date(c.closedAt).toLocaleString('es-GT')}
          </p>
        </div>
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex-shrink-0">
          <button onClick={onClose} className="w-full py-2.5 bg-slate-200 text-slate-600 text-xs font-black rounded-xl uppercase tracking-wide">Cerrar</button>
        </div>
      </div>
    </div>
  );
};

export const EyeIcon: React.FC = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
  </svg>
);
