import React, { useState } from 'react';
import { CashPurchase, DailyClosing, Sale } from '../types';
import { formatCurrency, formatDate, formatTodayLabel, getDayClosingTotals, getCashStatus, getDisplayName, getLocalDateStr, getPreviousClosing, getCashSalesSince, getPurchasesSince, PAYMENT_METHODS } from '../utils';
import { ClosingView, EyeIcon } from './ClosingView';
import { buildDayReportPdf, dayReportFileName, downloadPdf, sharePdf } from '../reportPdf';

interface DailyClosingButtonProps {
  sales: Sale[];
  closings: DailyClosing[];
  purchases: CashPurchase[];
  aliases: Record<string, string>;
  onSend: (input: { openingCash: number; countedCash: number; sentToAdmin: number; note: string }) => Promise<DailyClosing>;
}

// Botón "Cerrar el día": la vendedora cuenta el efectivo de la caja, el sistema
// lo compara con lo que él calcula y envía el cierre a la administradora.
export const DailyClosingButton: React.FC<DailyClosingButtonProps> = ({ sales, closings, purchases, aliases, onSend }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [counted, setCounted] = useState('');
  const [opening, setOpening] = useState('');
  const [sent, setSent] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<DailyClosing | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfMsg, setPdfMsg] = useState('');
  const [viewing, setViewing] = useState<DailyClosing | null>(null);

  const today = getLocalDateStr();
  const totals = getDayClosingTotals(sales, today);
  const existing = closings.find((c) => c.date === today);
  // Caja corriente: lo que quedó en caja en el cierre anterior es el efectivo de apertura de hoy.
  const previous = getPreviousClosing(closings, today);
  const cashSales = getCashSalesSince(sales, previous, today);
  const purchasesTotal = getPurchasesSince(purchases, previous, today);
  const isFriday = new Date().getDay() === 5;

  const openingNum = previous ? previous.keptInBox : parseFloat(opening);
  const openingValid = previous ? true : opening.trim() !== '' && !isNaN(openingNum) && openingNum >= 0;
  const expectedCash = (openingValid ? openingNum : 0) + cashSales - purchasesTotal;

  const countedNum = parseFloat(counted);
  const hasCounted = counted.trim() !== '' && !isNaN(countedNum) && countedNum >= 0;
  const diff = hasCounted ? countedNum - expectedCash : 0;
  const diffOk = hasCounted && Math.abs(diff) < 0.01;

  const sentNum = sent.trim() === '' ? 0 : parseFloat(sent);
  const sentValid = !isNaN(sentNum) && sentNum >= 0 && (!hasCounted || sentNum <= countedNum + 0.001);
  const keptNum = hasCounted ? countedNum - (sentValid ? sentNum : 0) : 0;
  // Atajo: enviar todo lo que pase del efectivo con que se abrió ("fondo" de caja).
  const quickSend = hasCounted && openingValid && openingNum > 0 && countedNum > openingNum ? countedNum - openingNum : null;

  const open = () => {
    setSaved(null);
    setError('');
    setPdfMsg('');
    setCounted(existing ? String(existing.countedCash) : '');
    setOpening(existing && !previous ? String(existing.openingCash) : '');
    setSent(existing && existing.sentToAdmin > 0 ? String(existing.sentToAdmin) : '');
    setNote(existing?.note || '');
    setIsOpen(true);
  };

  const send = async () => {
    if (!openingValid) {
      setError('Escribe con cuánto efectivo abriste la caja hoy (si no había nada, pon 0).');
      return;
    }
    if (!hasCounted) {
      setError('Escribe el efectivo que contaste en caja (si no hubo efectivo, pon 0).');
      return;
    }
    if (!sentValid) {
      setError('Lo que se envía a la administradora no puede ser más de lo que contaste en caja.');
      return;
    }
    setSending(true);
    setError('');
    try {
      const result = await onSend({ openingCash: openingNum, countedCash: countedNum, sentToAdmin: sentNum, note: note.trim() });
      setSaved(result);
    } catch (err) {
      console.error(err);
      setError('No se pudo enviar el cierre. Revisa tu conexión e intenta de nuevo.');
    } finally {
      setSending(false);
    }
  };

  const getPdf = async () => {
    const closing = saved || existing || undefined;
    return buildDayReportPdf(totals.daySales, today, aliases, closing);
  };

  const handleDownload = async () => {
    setPdfBusy(true);
    try {
      downloadPdf(await getPdf(), dayReportFileName(today));
    } finally {
      setPdfBusy(false);
    }
  };

  const handleShare = async () => {
    setPdfBusy(true);
    setPdfMsg('');
    try {
      const result = await sharePdf(await getPdf(), dayReportFileName(today), `Reporte de ventas ${formatDate(today)}`);
      if (result === 'downloaded') setPdfMsg('Este aparato no permite compartir directo, así que se descargó el PDF.');
    } finally {
      setPdfBusy(false);
    }
  };

  const closedTime = existing ? new Date(existing.closedAt).toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit' }) : '';

  return (
    <>
      <button
        onClick={open}
        className={`inline-flex font-black px-6 py-4 rounded-2xl transition text-sm items-center justify-center gap-2 shadow-sm uppercase tracking-wide border-2 ${
          existing
            ? 'bg-white border-[#2bb297] text-[#1a8a72] hover:bg-[#2bb297]/5'
            : 'bg-white border-slate-300 text-slate-700 hover:border-[#2bb297] hover:text-[#1a8a72]'
        }`}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        {existing ? `Cierre enviado ${closedTime}` : 'Cerrar el día'}
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[92vh] overflow-hidden flex flex-col">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50 flex-shrink-0">
              <div>
                <h2 className="text-lg font-black text-slate-800">Cerrar el día</h2>
                <p className="text-xs font-black text-[#8a6a3f] mt-0.5">{formatTodayLabel()}</p>
              </div>
              <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
            </div>

            {saved ? (
              <div className="p-5 space-y-4 overflow-y-auto">
                <div className="bg-[#2bb297]/10 border border-[#2bb297]/30 rounded-xl p-4 text-center">
                  <p className="text-sm font-black text-[#1a8a72]">✓ Cierre enviado a la administradora</p>
                  <p className={`text-xs font-black mt-1 ${getCashStatus(saved).ok ? 'text-[#1a8a72]' : 'text-[#8c3a4b]'}`}>
                    Efectivo: {getCashStatus(saved).label}
                  </p>
                  <p className="text-[11px] font-bold text-slate-500 mt-1">
                    {saved.sentToAdmin > 0 && <>Enviado a la administradora: {formatCurrency(saved.sentToAdmin)} · </>}
                    Se queda en caja chica: <span className="font-black text-slate-700">{formatCurrency(saved.keptInBox)}</span>
                  </p>
                </div>
                <p className="text-[11px] text-slate-500 font-bold">Si quieres, también puedes llevarte el reporte en PDF:</p>
                <div className="grid grid-cols-[auto_1fr_1fr] gap-3">
                  <button onClick={() => setViewing(saved)} title="Ver cierre en pantalla" aria-label="Ver cierre" className="px-4 py-3 border-2 border-slate-300 hover:bg-slate-100 text-slate-700 rounded-xl flex items-center justify-center"><EyeIcon /></button>
                  <button onClick={handleDownload} disabled={pdfBusy} className="py-3 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-300 text-white text-xs font-black rounded-xl uppercase tracking-wide transition">
                    Descargar PDF
                  </button>
                  <button onClick={handleShare} disabled={pdfBusy} className="py-3 bg-[#2bb297] hover:bg-[#1a8a72] disabled:bg-slate-300 text-white text-xs font-black rounded-xl uppercase tracking-wide transition">
                    Compartir PDF
                  </button>
                </div>
                {pdfMsg && <p className="text-[10px] font-bold text-slate-400">{pdfMsg}</p>}
                <button onClick={() => setIsOpen(false)} className="w-full py-2.5 bg-slate-200 text-slate-600 text-xs font-black rounded-xl uppercase tracking-wide">
                  Listo
                </button>
              </div>
            ) : (
              <>
                <div className="p-5 space-y-4 overflow-y-auto">
                  {existing && (
                    <div className="bg-[#c9a876]/10 border border-[#c9a876]/30 rounded-xl px-3 py-2">
                      <p className="text-[11px] font-bold text-[#8a6a3f]">
                        Ya enviaste un cierre hoy a las {closedTime} ({getDisplayName(existing.closedByEmail, aliases)}). Si hubo más ventas después, puedes actualizarlo.
                      </p>
                    </div>
                  )}

                  <div className="bg-slate-50 rounded-xl p-4 space-y-1.5">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Lo que dice el sistema</p>
                    <div className="flex justify-between text-sm"><span className="font-bold text-slate-600">Ventas</span><span className="font-black text-slate-800">{totals.salesCount} · {totals.itemsCount} prenda(s)</span></div>
                    {PAYMENT_METHODS.map((m) => (totals.byMethod[m.value] || 0) > 0 && (
                      <div key={m.value} className="flex justify-between text-sm">
                        <span className="font-bold text-slate-500">{m.label}</span>
                        <span className="font-black text-slate-700">{formatCurrency(totals.byMethod[m.value])}</span>
                      </div>
                    ))}
                    <div className="flex justify-between text-sm border-t border-slate-200 pt-1.5 mt-1">
                      <span className="font-black text-slate-700 uppercase">Total vendido</span>
                      <span className="font-black text-[#1a8a72]">{formatCurrency(totals.totalSold)}</span>
                    </div>
                  </div>

                  <div className="border-2 border-[#2bb297]/30 rounded-xl p-4 space-y-3">
                    <p className="text-[10px] font-black text-[#1a8a72] uppercase tracking-widest">Caja chica (efectivo)</p>

                    {previous ? (
                      <div className="flex justify-between text-sm">
                        <span className="font-bold text-slate-500">Caja chica con la que abriste <span className="text-[10px] text-slate-400">(quedó el {formatDate(previous.date)})</span></span>
                        <span className="font-black text-slate-700">{formatCurrency(previous.keptInBox)}</span>
                      </div>
                    ) : (
                      <div>
                        <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">
                          Caja chica con la que abriste hoy (Q) <span className="normal-case text-slate-400">— primer cierre</span>
                        </label>
                        <input
                          type="number" step="any" min="0" inputMode="decimal"
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-black text-center"
                          value={opening}
                          onChange={(e) => setOpening(e.target.value)}
                          placeholder="0.00"
                        />
                      </div>
                    )}
                    <div className="flex justify-between text-sm">
                      <span className="font-bold text-slate-500">+ Cobrado en efectivo{previous ? ' desde el último cierre' : ' hoy'}</span>
                      <span className="font-black text-slate-700">{formatCurrency(cashSales)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="font-bold text-slate-500">− Compras pagadas de caja chica</span>
                      <span className="font-black text-[#8c3a4b]">{purchasesTotal > 0 ? `-${formatCurrency(purchasesTotal)}` : formatCurrency(0)}</span>
                    </div>
                    <div className="flex justify-between text-sm border-t border-slate-200 pt-2">
                      <span className="font-black text-slate-700 uppercase">Disponible en caja chica (sistema)</span>
                      <span className="font-black text-[#1a8a72]">{formatCurrency(expectedCash)}</span>
                    </div>

                    <div>
                      <label className="block text-[10px] font-black text-[#1a8a72] uppercase mb-1">
                        Efectivo contado en caja chica (Q) <span className="normal-case text-slate-400">— cuenta los billetes y monedas</span>
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        inputMode="decimal"
                        className="w-full px-4 py-3 border-2 border-[#2bb297]/40 rounded-xl text-lg font-black text-center focus:ring-2 focus:ring-[#2bb297]"
                        value={counted}
                        onChange={(e) => setCounted(e.target.value)}
                        placeholder="0.00"
                      />
                      {hasCounted && (
                        <p className={`mt-2 text-sm font-black text-center rounded-lg py-2 ${diffOk ? 'bg-[#2bb297]/10 text-[#1a8a72]' : 'bg-[#8c3a4b]/10 text-[#8c3a4b]'}`}>
                          {diffOk ? '✓ Cuadra' : diff > 0 ? `Sobran ${formatCurrency(diff)}` : `Faltan ${formatCurrency(Math.abs(diff))}`}
                        </p>
                      )}
                    </div>

                    <div className="border-t border-slate-200 pt-3">
                      <label className="block text-[10px] font-black text-slate-500 uppercase mb-1">
                        Efectivo que se envía a la administradora (Q) <span className="normal-case text-slate-400">— opcional</span>
                      </label>
                      {isFriday && (
                        <p className="text-[10px] font-black text-[#8a6a3f] bg-[#c9a876]/10 border border-[#c9a876]/30 rounded-lg px-2 py-1 mb-1.5">
                          Hoy es viernes: separa el efectivo que se envía a la administradora.
                        </p>
                      )}
                      <input
                        type="number" step="any" min="0" inputMode="decimal"
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-black text-center"
                        value={sent}
                        onChange={(e) => setSent(e.target.value)}
                        placeholder="0.00 (dejar vacío si hoy no se envía nada)"
                      />
                      {quickSend !== null && (
                        <button
                          type="button"
                          onClick={() => setSent(String(Math.round(quickSend * 100) / 100))}
                          className="mt-1.5 text-[10px] font-black text-[#2bb297] hover:text-[#1a8a72] uppercase"
                        >
                          Dejar {formatCurrency(openingNum)} en caja y enviar {formatCurrency(quickSend)}
                        </button>
                      )}
                      {!sentValid && hasCounted && (
                        <p className="text-[10px] font-bold text-[#8c3a4b] mt-1">No puede ser más de lo que contaste ({formatCurrency(countedNum)}).</p>
                      )}
                    </div>

                    {hasCounted && sentValid && (
                      <div className="flex justify-between text-sm bg-slate-50 rounded-lg px-3 py-2">
                        <span className="font-black text-slate-600 uppercase">Se queda en caja chica</span>
                        <span className="font-black text-slate-800">{formatCurrency(keptNum)}</span>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Nota (opcional)</label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Ej. Algo que la administradora deba saber"
                    />
                  </div>

                  {error && <p className="text-[11px] text-[#8c3a4b] font-bold bg-[#8c3a4b]/10 border border-[#8c3a4b]/20 rounded-xl px-3 py-2">⚠️ {error}</p>}
                </div>

                <div className="p-4 border-t border-slate-100 bg-slate-50 flex gap-3 flex-shrink-0">
                  <button onClick={() => setIsOpen(false)} className="flex-1 py-3 bg-slate-200 text-slate-600 text-xs font-black rounded-xl uppercase tracking-wide">Cancelar</button>
                  <button
                    onClick={send}
                    disabled={sending}
                    className="flex-[2] py-3 bg-[#2bb297] hover:bg-[#1a8a72] disabled:bg-slate-300 text-white text-sm font-black rounded-xl uppercase tracking-wide transition shadow-sm"
                  >
                    {sending ? 'Enviando...' : existing ? 'Actualizar cierre' : 'Enviar cierre'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {viewing && <ClosingView closing={viewing} aliases={aliases} onClose={() => setViewing(null)} />}
    </>
  );
};
