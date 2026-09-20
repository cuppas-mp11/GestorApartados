import React, { useState } from 'react';
import { InventoryItem, Lot, Customer, Sale, SaleItem, SalePayment, PaymentMethod, SaleStatus, UserRole } from '../types';
import { generateId, formatCurrency, getStockForCode, getSaleTotal, getSaleItemsCount, paymentMethodLabel, getPaymentsTotal, amountsMatch, PAYMENT_METHODS } from '../utils';
import { CreditCustomerPicker } from './CreditCustomerPicker';

type SaleDraft = Omit<Sale, 'id' | 'correlative' | 'soldByEmail' | 'status' | 'stockAllocations'>;

interface QuickSaleFormProps {
  onAdd: (sale: SaleDraft) => Promise<void>;
  inventory: InventoryItem[];
  lots: Lot[];
  customers: Customer[];
  sales: Sale[];
  role: UserRole | null;
  onCancelSale: (id: string) => void;
  onEditSale: (sale: Sale) => void;
}

const QUICK_METHODS: { value: PaymentMethod; short: string }[] = [
  { value: 'cash', short: 'EF' },
  { value: 'card', short: 'TC' },
  { value: 'transfer', short: 'DEP' },
];

const emptyDraft = () => ({
  garmentId: '',
  code: '',
  name: '',
  pricePerUnit: 0,
  quantity: 1,
  discount: 0,
  note: '',
});

export const QuickSaleForm: React.FC<QuickSaleFormProps> = ({ onAdd, inventory, lots, customers, sales, role, onCancelSale, onEditSale }) => {
  const [draft, setDraft] = useState(emptyDraft());
  const [showBalancePicker, setShowBalancePicker] = useState(false);
  const [combinedMode, setCombinedMode] = useState(false);
  const [combinedAmounts, setCombinedAmounts] = useState<Partial<Record<PaymentMethod, string>>>({});
  const [combinedCustomer, setCombinedCustomer] = useState<Customer | null>(null);
  const [showCombinedBalancePicker, setShowCombinedBalancePicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [methodFilter, setMethodFilter] = useState<'ALL' | 'DISCOUNT' | PaymentMethod>('ALL');

  const todayStr = new Date().toISOString().split('T')[0];
  const todaySales = sales.filter((s) => s.date.startsWith(todayStr)).sort((a, b) => b.correlative - a.correlative);
  const completedToday = todaySales.filter((s) => s.status === SaleStatus.COMPLETED);
  const totalToday = completedToday.reduce((acc, s) => acc + getSaleTotal(s), 0);

  const visibleSales = methodFilter === 'ALL'
    ? todaySales
    : methodFilter === 'DISCOUNT'
    ? todaySales.filter((s) => s.items.some((it) => (it.discount || 0) > 0))
    : todaySales.filter((s) => s.payments.some((p) => p.method === methodFilter));

  const stock = draft.code ? getStockForCode(draft.code, lots) : 0;
  const subtotal = draft.pricePerUnit * draft.quantity;
  const rowTotal = Math.max(0, subtotal - (draft.discount || 0));
  const rowReady = draft.garmentId !== '' && draft.quantity > 0 && draft.quantity <= stock;

  const updateDraft = (updates: Partial<ReturnType<typeof emptyDraft>>) => setDraft((prev) => ({ ...prev, ...updates }));

  const handleGarmentChange = (garmentId: string) => {
    const inv = inventory.find((i) => i.id === garmentId);
    if (!inv) {
      setDraft(emptyDraft());
      return;
    }
    setDraft({ ...emptyDraft(), garmentId, code: inv.code, name: inv.name, pricePerUnit: inv.basePrice, quantity: 1 });
  };

  const resetPaymentUi = () => {
    setShowBalancePicker(false);
    setCombinedMode(false);
    setCombinedAmounts({});
    setCombinedCustomer(null);
    setShowCombinedBalancePicker(false);
  };

  const commitRow = async (payments: SalePayment[]) => {
    if (!rowReady) {
      setError('Selecciona una prenda y una cantidad válida (dentro del stock disponible).');
      return;
    }
    setError('');
    setSaving(true);

    const item: SaleItem = {
      id: generateId(),
      garmentId: draft.garmentId,
      name: draft.name,
      code: draft.code,
      quantity: draft.quantity,
      pricePerUnit: draft.pricePerUnit,
      discount: draft.discount || 0,
    };

    const balancePayment = payments.find((p) => p.method === 'balance');

    const saleDraft: SaleDraft = {
      date: new Date().toISOString(),
      items: [item],
      payments,
      note: draft.note.trim() || undefined,
      customerId: balancePayment?.customerId,
      customerName: balancePayment?.customerName,
      quickEntry: true,
    };

    try {
      await onAdd(saleDraft);
      setDraft(emptyDraft());
      resetPaymentUi();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar esta línea.');
    } finally {
      setSaving(false);
    }
  };

  const handleQuickMethod = (method: PaymentMethod) => {
    commitRow([{ id: generateId(), method, amount: rowTotal }]);
  };

  const handleBalanceCustomer = (customer: Customer) => {
    commitRow([{ id: generateId(), method: 'balance', amount: rowTotal, customerId: customer.id, customerName: customer.name }]);
  };

  // ---- Pago combinado ----
  const combinedActiveMethods = PAYMENT_METHODS.filter((m) => combinedAmounts[m.value] !== undefined);
  const combinedTotal = combinedActiveMethods.reduce((acc, m) => acc + (parseFloat(combinedAmounts[m.value] || '0') || 0), 0);
  const combinedComplete = amountsMatch(combinedTotal, rowTotal) && rowTotal > 0 &&
    (!combinedAmounts.balance || !!combinedCustomer);

  const toggleCombinedMethod = (method: PaymentMethod, on: boolean) => {
    setCombinedAmounts((prev) => {
      const next = { ...prev };
      if (on) {
        next[method] = '';
        if (method === 'balance') setShowCombinedBalancePicker(true);
      } else {
        delete next[method];
        if (method === 'balance') {
          setCombinedCustomer(null);
          setShowCombinedBalancePicker(false);
        }
      }
      return next;
    });
  };

  const submitCombined = () => {
    if (!combinedComplete) {
      setError('Los montos combinados deben sumar exactamente el total de la línea.');
      return;
    }
    const payments: SalePayment[] = combinedActiveMethods.map((m) => ({
      id: generateId(),
      method: m.value,
      amount: parseFloat(combinedAmounts[m.value] || '0') || 0,
      customerId: m.value === 'balance' ? combinedCustomer?.id : undefined,
      customerName: m.value === 'balance' ? combinedCustomer?.name : undefined,
    }));
    commitRow(payments);
  };

  return (
    <div className="space-y-6">
      {/* ---- Fila de captura ---- */}
      <div className="bg-white p-5 rounded-2xl border-2 border-[#2bb297]/30 shadow-sm">
        <p className="text-[10px] font-black text-[#1a8a72] uppercase tracking-widest mb-3">Registrar prenda vendida</p>
        <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_1fr] gap-3 items-end">
          <div>
            <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Prenda</label>
            <select
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm font-bold focus:ring-2 focus:ring-[#2bb297]"
              value={draft.garmentId}
              onChange={(e) => { handleGarmentChange(e.target.value); resetPaymentUi(); }}
            >
              <option value="">-- Seleccionar --</option>
              {inventory.map((inv) => {
                const invStock = getStockForCode(inv.code, lots);
                return (
                  <option key={inv.id} value={inv.id} disabled={invStock <= 0}>
                    {inv.code} - {inv.name} ({formatCurrency(inv.basePrice)}) {invStock <= 0 ? '· Sin stock' : `· Stock: ${invStock}`}
                  </option>
                );
              })}
            </select>
          </div>
          <div>
            <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Cant. <span className="text-slate-300 normal-case">(stock {stock})</span></label>
            <input
              type="number"
              min="1"
              max={Math.max(1, stock)}
              disabled={!draft.garmentId}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm font-bold text-center disabled:opacity-50"
              value={draft.quantity}
              onChange={(e) => { updateDraft({ quantity: Math.max(1, Math.min(stock, parseInt(e.target.value) || 1)) }); resetPaymentUi(); }}
            />
          </div>
          <div>
            <label className="block text-[9px] font-black text-[#8c3a4b] uppercase mb-1">Descuento (Q)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              max={subtotal}
              disabled={!draft.garmentId}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm font-bold disabled:opacity-50"
              value={draft.discount || ''}
              onChange={(e) => { updateDraft({ discount: Math.max(0, Math.min(subtotal, parseFloat(e.target.value) || 0)) }); resetPaymentUi(); }}
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Total</label>
            <div className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-black text-[#1a8a72] text-right">
              {formatCurrency(rowTotal)}
            </div>
          </div>
        </div>

        {draft.garmentId && (
          <div className="mt-3">
            <input
              type="text"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
              value={draft.note}
              onChange={(e) => updateDraft({ note: e.target.value })}
              placeholder="Nota opcional (ej. agujero pequeño, mancha leve...)"
            />
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mr-1">Método de pago →</span>
          {QUICK_METHODS.map((m) => (
            <button
              key={m.value}
              type="button"
              disabled={!rowReady || saving}
              onClick={() => handleQuickMethod(m.value)}
              className="w-12 h-12 rounded-full border-2 border-slate-200 hover:border-[#2bb297] disabled:opacity-40 disabled:hover:border-slate-200 flex items-center justify-center text-[10px] font-black text-slate-500 hover:text-[#1a8a72] hover:bg-[#2bb297]/5 transition"
              title={paymentMethodLabel(m.value)}
            >
              {m.short}
            </button>
          ))}
          <button
            type="button"
            disabled={!rowReady || saving}
            onClick={() => { setShowBalancePicker(true); setCombinedMode(false); }}
            className="px-4 py-3 rounded-xl border-2 border-[#c9a876]/50 hover:border-[#c9a876] disabled:opacity-40 bg-[#c9a876]/10 text-[10px] font-black text-[#8a6a3f] uppercase tracking-wide transition"
          >
            Saldo a favor
          </button>
          <button
            type="button"
            disabled={!rowReady || saving}
            onClick={() => { setCombinedMode(true); setShowBalancePicker(false); }}
            className="px-4 py-3 rounded-xl border-2 border-slate-700/30 hover:border-slate-700 disabled:opacity-40 bg-slate-700/5 text-[10px] font-black text-slate-700 uppercase tracking-wide transition"
          >
            Pago combinado
          </button>
          {saving && <span className="text-[10px] font-black text-slate-400 uppercase">Guardando...</span>}
        </div>

        {showBalancePicker && (
          <div className="mt-3">
            <CreditCustomerPicker
              customers={customers}
              selectedCustomerId=""
              onSelect={handleBalanceCustomer}
              onClose={() => setShowBalancePicker(false)}
            />
          </div>
        )}

        {combinedMode && (
          <div className="mt-3 p-4 bg-slate-50 border border-slate-200 rounded-xl">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">
              Marca los métodos que se combinan y su monto — deben sumar {formatCurrency(rowTotal)}
            </p>
            <div className="space-y-2">
              {PAYMENT_METHODS.map((m) => {
                const active = combinedAmounts[m.value] !== undefined;
                return (
                  <div key={m.value}>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={active}
                        onChange={(e) => toggleCombinedMethod(m.value, e.target.checked)}
                        className="w-4 h-4 accent-[#2bb297]"
                      />
                      <span className="text-xs font-bold text-slate-700 w-40">{m.label}</span>
                      {active && (
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className="w-28 px-2 py-1.5 border border-slate-200 rounded-lg text-xs font-bold text-right"
                          value={combinedAmounts[m.value]}
                          onChange={(e) => setCombinedAmounts((prev) => ({ ...prev, [m.value]: e.target.value }))}
                          placeholder="0.00"
                        />
                      )}
                    </label>
                    {m.value === 'balance' && active && showCombinedBalancePicker && (
                      <div className="mt-2 ml-6">
                        <CreditCustomerPicker
                          customers={customers}
                          selectedCustomerId={combinedCustomer?.id || ''}
                          onSelect={(c) => { setCombinedCustomer(c); setShowCombinedBalancePicker(false); }}
                          onClose={() => setShowCombinedBalancePicker(false)}
                        />
                      </div>
                    )}
                    {m.value === 'balance' && active && !showCombinedBalancePicker && (
                      <p className="ml-6 text-[10px] font-bold text-[#8a6a3f] mt-1">
                        {combinedCustomer ? (
                          <>Usando saldo de <span className="font-black">{combinedCustomer.name}</span>{' '}
                            <button type="button" onClick={() => setShowCombinedBalancePicker(true)} className="underline">cambiar</button>
                          </>
                        ) : (
                          <button type="button" onClick={() => setShowCombinedBalancePicker(true)} className="underline">Elegir clienta ↓</button>
                        )}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            <div className={`mt-3 text-[11px] font-black ${amountsMatch(combinedTotal, rowTotal) ? 'text-[#1a8a72]' : 'text-[#8c3a4b]'}`}>
              Suma actual: {formatCurrency(combinedTotal)} de {formatCurrency(rowTotal)}
              {amountsMatch(combinedTotal, rowTotal) ? ' ✓' : ''}
            </div>

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={!combinedComplete || saving}
                onClick={submitCombined}
                className="flex-1 bg-slate-700 disabled:bg-slate-300 text-white text-xs font-black py-2.5 rounded-lg uppercase tracking-wide"
              >
                Guardar línea combinada
              </button>
              <button type="button" onClick={resetPaymentUi} className="px-4 bg-slate-200 text-slate-600 text-xs font-black py-2.5 rounded-lg">
                Cancelar
              </button>
            </div>
          </div>
        )}

        {error && (
          <p className="mt-3 text-[11px] text-[#8c3a4b] font-bold bg-[#8c3a4b]/10 border border-[#8c3a4b]/20 rounded-xl px-3 py-2">⚠️ {error}</p>
        )}

        <p className="mt-3 text-[9px] text-slate-400 font-bold uppercase tracking-wide">
          EF= Efectivo &nbsp;&nbsp; TC=Tarjeta &nbsp;&nbsp; DEP=Depósito o transferencia — cada línea se guarda sola al elegir el método.
        </p>
      </div>

      {/* ---- Ventas de hoy ---- */}
      <div>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <p className="text-sm font-black text-slate-800 uppercase tracking-tight">Venta del día</p>
          <p className="text-lg font-black text-[#1a8a72]">Total del día: {formatCurrency(totalToday)}</p>
        </div>

        {todaySales.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            <button
              onClick={() => setMethodFilter('ALL')}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wide transition ${methodFilter === 'ALL' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
            >
              Todos
            </button>
            {PAYMENT_METHODS.map((m) => (
              <button
                key={m.value}
                onClick={() => setMethodFilter(m.value)}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wide transition ${methodFilter === m.value ? 'bg-[#2bb297] text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
              >
                {m.label}
              </button>
            ))}
            <button
              onClick={() => setMethodFilter('DISCOUNT')}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wide transition ${methodFilter === 'DISCOUNT' ? 'bg-[#8c3a4b] text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
            >
              Con descuento
            </button>
          </div>
        )}

        {todaySales.length === 0 ? (
          <div className="bg-white p-8 text-center rounded-xl border border-slate-200 shadow-sm">
            <p className="text-slate-400 font-medium text-sm">Aún no hay ventas registradas hoy.</p>
          </div>
        ) : visibleSales.length === 0 ? (
          <div className="bg-white p-8 text-center rounded-xl border border-slate-200 shadow-sm">
            <p className="text-slate-400 font-medium text-sm">
              {methodFilter === 'DISCOUNT' ? 'Ninguna venta de hoy tuvo descuento.' : 'Ninguna venta de hoy usó ese método.'}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2.5 text-[9px] font-black text-slate-400 uppercase tracking-widest">#</th>
                    <th className="px-3 py-2.5 text-[9px] font-black text-slate-400 uppercase tracking-widest">Prenda</th>
                    <th className="px-3 py-2.5 text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">Cant.</th>
                    <th className="px-3 py-2.5 text-[9px] font-black text-slate-400 uppercase tracking-widest">Método(s)</th>
                    <th className="px-3 py-2.5 text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">Desc.</th>
                    <th className="px-3 py-2.5 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Total</th>
                    <th className="px-3 py-2.5 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleSales.map((sale) => {
                    const item = sale.items[0];
                    const cancelled = sale.status === SaleStatus.CANCELLED;
                    const total = getSaleTotal(sale);
                    return (
                      <tr key={sale.id} className={cancelled ? 'opacity-50' : ''}>
                        <td className="px-3 py-2.5 text-[10px] font-bold text-slate-400">{sale.correlative}</td>
                        <td className="px-3 py-2.5">
                          <span className="text-[9px] font-black bg-slate-100 text-slate-400 px-1 rounded border border-slate-200 mr-1">{item.code}</span>
                          <span className="text-xs font-bold text-slate-700">{item.name}</span>
                          {sale.items.length > 1 && <span className="text-[9px] text-slate-400 font-bold"> +{sale.items.length - 1} más</span>}
                        </td>
                        <td className="px-3 py-2.5 text-center text-xs font-black text-slate-600">{item.quantity}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex flex-wrap gap-1">
                            {sale.payments.map((p) => (
                              <span key={p.id} className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-600">
                                {p.method === 'balance' ? 'SALDO' : QUICK_METHODS.find((m) => m.value === p.method)?.short || p.method} {formatCurrency(p.amount)}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {item.discount > 0 ? (
                            <span className="text-[9px] font-black text-[#8c3a4b] bg-[#8c3a4b]/10 px-1.5 py-0.5 rounded">-{formatCurrency(item.discount)}</span>
                          ) : <span className="text-[9px] text-slate-300">—</span>}
                        </td>
                        <td className={`px-3 py-2.5 text-right text-sm font-black ${cancelled ? 'text-slate-400 line-through' : 'text-[#1a8a72]'}`}>
                          {formatCurrency(total)}
                        </td>
                        <td className="px-3 py-2.5 text-right whitespace-nowrap">
                          {cancelled ? (
                            <span className="text-[9px] font-black uppercase px-2 py-1 rounded bg-[#8c3a4b]/15 text-[#6f2d3a]">Anulada</span>
                          ) : role === 'admin' ? (
                            <div className="flex gap-1 justify-end">
                              <button
                                onClick={() => onEditSale(sale)}
                                className="text-[10px] font-black text-[#2bb297] hover:text-white hover:bg-[#2bb297] border border-[#2bb297]/30 hover:border-[#2bb297] transition px-2 py-1 rounded-lg"
                              >
                                Editar
                              </button>
                              <button
                                onClick={() => onCancelSale(sale.id)}
                                className="text-[10px] font-black text-[#8c3a4b] hover:text-white hover:bg-[#8c3a4b] border border-[#8c3a4b]/30 hover:border-[#8c3a4b] transition px-2 py-1 rounded-lg"
                              >
                                Anular
                              </button>
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <p className="mt-2 text-[10px] text-slate-400 font-bold uppercase tracking-wide">
          {getSaleItemsCount({ items: completedToday.flatMap((s) => s.items) } as Sale)} prenda(s) vendidas hoy en {completedToday.length} venta(s)
        </p>
      </div>
    </div>
  );
};

