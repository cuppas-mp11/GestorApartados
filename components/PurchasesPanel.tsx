import React, { useMemo, useState } from 'react';
import { CashPurchase, UserRole } from '../types';
import { formatCurrency, formatDate, getDisplayName, getLocalDateStr, getPettyCashSnapshot } from '../utils';
import { confirmDialog } from './ConfirmDialog';

interface PurchasesPanelProps {
  purchases: CashPurchase[];
  snapshot: ReturnType<typeof getPettyCashSnapshot>;
  role: UserRole | null;
  currentUid: string;
  aliases: Record<string, string>;
  onAdd: (input: { date: string; description: string; amount: number; note: string }) => Promise<void>;
  onVoid: (purchase: CashPurchase) => Promise<void>;
}

// Compras pagadas con dinero de la caja chica (mantenimiento del local, bolsas,
// limpieza...). Cada compra queda en el historial y resta de la caja chica en el
// cierre del día. Si se registró mal, se ANULA (no se borra).
export const PurchasesPanel: React.FC<PurchasesPanelProps> = ({ purchases, snapshot, role, currentUid, aliases, onAdd, onVoid }) => {
  const isAdmin = role === 'admin';
  const today = getLocalDateStr();
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const pastDescriptions = useMemo(
    () => Array.from(new Set(purchases.map((p) => p.description.trim()).filter(Boolean))).slice(0, 40),
    [purchases]
  );

  const save = async () => {
    const amt = parseFloat(amount);
    if (!description.trim()) return setError('Escribe qué se compró.');
    if (isNaN(amt) || amt <= 0) return setError('Escribe cuánto se gastó (mayor que 0).');
    setSaving(true);
    setError('');
    try {
      await onAdd({ date: isAdmin ? date : today, description: description.trim(), amount: amt, note: note.trim() });
      setDescription(''); setAmount(''); setNote(''); setDate(today);
    } catch (e) {
      console.error(e);
      setError('No se pudo guardar. Revisa tu conexión e intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  const canVoid = (p: CashPurchase) => p.status === 'ACTIVE' && (isAdmin || (p.createdByUid === currentUid && p.date === today));

  const voidIt = async (p: CashPurchase) => {
    const ok = await confirmDialog(`¿Anular la compra "${p.description}" por ${formatCurrency(p.amount)}? El dinero vuelve a contar en la caja chica.`, {
      title: 'Anular compra', confirmLabel: 'Sí, anular', danger: true,
    });
    if (ok) await onVoid(p);
  };

  const shown = purchases.filter((p) => (!from || p.date >= from) && (!to || p.date <= to));
  const activeTotal = shown.filter((p) => p.status === 'ACTIVE').reduce((a, p) => a + p.amount, 0);
  const days = Array.from(new Set(shown.map((p) => p.date))).sort((a, b) => b.localeCompare(a));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-5xl">
      <div className="space-y-6">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Caja chica ahora (según el sistema)</p>
          {snapshot ? (
            <>
              <p className="text-3xl font-black text-[#1a8a72]">{formatCurrency(snapshot.balance)}</p>
              <p className="text-[10px] font-bold text-slate-400 mt-1 leading-relaxed">
                Quedó {formatCurrency(snapshot.base)} en el cierre del {formatDate(snapshot.baseDate)} + {formatCurrency(snapshot.cashSince)} cobrado en efectivo − {formatCurrency(snapshot.purchasesSince)} en compras.
              </p>
            </>
          ) : (
            <p className="text-[11px] font-bold text-slate-400">Se calcula desde el primer "Cerrar el día". Mientras tanto, igual puedes ir registrando las compras.</p>
          )}
        </div>

        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-3">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Registrar una compra</p>
          <div>
            <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">¿Qué se compró?</label>
            <input
              list="compras-previas" type="text"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              placeholder="Ej. Bolsas, cloro, pago de mantenimiento"
              value={description} onChange={(e) => setDescription(e.target.value)}
            />
            <datalist id="compras-previas">{pastDescriptions.map((d) => <option key={d} value={d} />)}</datalist>
          </div>
          <div className={isAdmin ? 'grid grid-cols-2 gap-2' : ''}>
            <div>
              <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Monto gastado (Q)</label>
              <input type="number" step="any" min="0" inputMode="decimal"
                className="w-full px-3 py-2 border border-[#2bb297]/30 rounded-lg text-sm font-black text-center"
                value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            </div>
            {isAdmin && (
              <div>
                <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Fecha</label>
                <input type="date" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
            )}
          </div>
          <div>
            <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Nota (opcional)</label>
            <input type="text" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej. Factura a nombre de la tienda" />
          </div>
          {error && <p className="text-[10px] text-[#8c3a4b] font-bold">{error}</p>}
          <button onClick={save} disabled={saving} className="w-full py-3 bg-[#2bb297] hover:bg-[#1a8a72] disabled:bg-slate-300 text-white text-sm font-black rounded-xl uppercase tracking-wide transition">
            {saving ? 'Guardando...' : 'Guardar compra'}
          </button>
          <p className="text-[9px] text-slate-400 font-bold leading-relaxed">Este dinero se resta de la caja chica en el cierre del día.</p>
        </div>
      </div>

      <div className="lg:col-span-2 bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Historial de compras</p>
          <div className="flex items-end gap-2">
            <div><label className="block text-[9px] font-black text-slate-400 uppercase">Desde</label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="px-2 py-1 border border-slate-200 rounded-lg text-xs" /></div>
            <div><label className="block text-[9px] font-black text-slate-400 uppercase">Hasta</label><input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="px-2 py-1 border border-slate-200 rounded-lg text-xs" /></div>
            {(from || to) && <button onClick={() => { setFrom(''); setTo(''); }} className="text-[10px] font-black text-[#2bb297] uppercase pb-1">Quitar</button>}
          </div>
        </div>
        <div className="bg-slate-50 rounded-xl px-4 py-2 mb-4 flex justify-between text-sm">
          <span className="font-black text-slate-600 uppercase text-xs">Total gastado{from || to ? ' en el rango' : ''}</span>
          <span className="font-black text-[#8c3a4b]">{formatCurrency(activeTotal)}</span>
        </div>
        {days.length === 0 ? (
          <p className="text-sm font-bold text-slate-400 text-center py-8">Todavía no hay compras registradas.</p>
        ) : (
          <div className="space-y-4">
            {days.map((d) => {
              const list = shown.filter((p) => p.date === d);
              const dayTotal = list.filter((p) => p.status === 'ACTIVE').reduce((a, p) => a + p.amount, 0);
              return (
                <div key={d}>
                  <div className="flex justify-between border-b border-slate-200 pb-1 mb-1.5">
                    <p className="text-xs font-black text-slate-600">{formatDate(d)}</p>
                    <p className="text-xs font-black text-slate-600">{formatCurrency(dayTotal)}</p>
                  </div>
                  <div className="space-y-1.5">
                    {list.map((p) => (
                      <div key={p.id} className={`flex items-center justify-between rounded-lg px-3 py-2 ${p.status === 'VOIDED' ? 'bg-[#8c3a4b]/5' : 'bg-slate-50'}`}>
                        <div className="min-w-0">
                          <p className={`text-[12px] font-black ${p.status === 'VOIDED' ? 'line-through text-[#8c3a4b]' : 'text-slate-700'}`}>{p.description}</p>
                          <p className="text-[9px] text-slate-400 font-bold truncate">
                            {getDisplayName(p.createdByEmail, aliases)}{p.note ? ` · ${p.note}` : ''}{p.status === 'VOIDED' ? ' · ANULADA' : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 ml-2">
                          <p className={`text-sm font-black ${p.status === 'VOIDED' ? 'line-through text-[#8c3a4b]' : 'text-slate-800'}`}>{formatCurrency(p.amount)}</p>
                          {canVoid(p) && <button onClick={() => voidIt(p)} className="text-[10px] font-black text-[#8c3a4b] uppercase">Anular</button>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
