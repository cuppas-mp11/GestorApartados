import React, { useState, useEffect } from 'react';
import { InventoryItem, Lot, Customer, Sale, SaleItem, SalePayment, PaymentMethod } from '../types';
import { generateId, formatCurrency, getStockForCode, PAYMENT_METHODS, getSaleItemTotal, getPaymentsTotal, amountsMatch } from '../utils';
import { CreditCustomerPicker } from './CreditCustomerPicker';

type SaleDraft = Omit<Sale, 'id' | 'correlative' | 'soldByEmail' | 'status' | 'stockAllocations'>;

interface SaleFormProps {
  onAdd: (sale: SaleDraft) => Promise<void>;
  inventory: InventoryItem[];
  lots: Lot[];
  nextCorrelative: number;
  customers: Customer[];
}

export const SaleForm: React.FC<SaleFormProps> = ({ onAdd, inventory, lots, nextCorrelative, customers }) => {
  const [items, setItems] = useState<SaleItem[]>([
    { id: generateId(), garmentId: '', name: '', code: '', quantity: 1, pricePerUnit: 0, discount: 0 }
  ]);
  const [payments, setPayments] = useState<SalePayment[]>([{ id: generateId(), method: 'cash', amount: 0 }]);
  const [pickerForPaymentId, setPickerForPaymentId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const total = items.reduce((acc, it) => acc + getSaleItemTotal(it), 0);
  const paymentsTotal = getPaymentsTotal(payments);
  const remaining = total - paymentsTotal;
  const isInventoryEmpty = inventory.length === 0;
  const hasBalancePayment = payments.some((p) => p.method === 'balance');

  // Cuando solo hay una línea de pago, la mantenemos sincronizada con el total
  // (para el caso simple: elige método y ya). En cuanto agregan una segunda,
  // dejamos de tocar los montos automáticamente.
  useEffect(() => {
    if (payments.length === 1 && payments[0].method !== 'balance') {
      setPayments([{ ...payments[0], amount: total }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total]);

  const availableStock = (code: string, exceptItemId: string) => {
    const totalStock = getStockForCode(code, lots);
    const usedElsewhere = items.filter((i) => i.id !== exceptItemId && i.code === code).reduce((acc, i) => acc + i.quantity, 0);
    return Math.max(0, totalStock - usedElsewhere);
  };

  const addItemRow = () => setItems([...items, { id: generateId(), garmentId: '', name: '', code: '', quantity: 1, pricePerUnit: 0, discount: 0 }]);
  const removeItemRow = (id: string) => { if (items.length > 1) setItems(items.filter((i) => i.id !== id)); };

  const updateItem = (id: string, updates: Partial<SaleItem>) => {
    setItems((prev) => prev.map((item) => {
      if (item.id !== id) return item;
      const updated = { ...item, ...updates };
      if ('garmentId' in updates) {
        const inv = inventory.find((i) => i.id === updates.garmentId);
        if (inv) {
          updated.name = inv.name;
          updated.code = inv.code;
          updated.pricePerUnit = inv.basePrice;
          const stock = availableStock(inv.code, item.id);
          updated.quantity = Math.max(1, Math.min(updated.quantity || 1, Math.max(1, stock)));
          updated.discount = 0;
        } else {
          updated.name = '';
          updated.code = '';
          updated.pricePerUnit = 0;
        }
      }
      return updated;
    }));
  };

  const addPaymentRow = () => {
    const remainingNow = Math.max(0, total - paymentsTotal);
    setPayments([...payments, { id: generateId(), method: 'cash', amount: remainingNow }]);
  };

  const removePaymentRow = (id: string) => {
    if (payments.length > 1) setPayments(payments.filter((p) => p.id !== id));
    if (pickerForPaymentId === id) setPickerForPaymentId(null);
  };

  const updatePayment = (id: string, updates: Partial<SalePayment>) => {
    setPayments((prev) => prev.map((p) => (p.id === id ? { ...p, ...updates } : p)));
  };

  const handleMethodChange = (paymentId: string, method: PaymentMethod) => {
    if (method === 'balance') {
      updatePayment(paymentId, { method, customerId: undefined, customerName: undefined });
      setPickerForPaymentId(paymentId);
    } else {
      updatePayment(paymentId, { method, customerId: undefined, customerName: undefined });
      setPickerForPaymentId(null);
    }
  };

  const handlePickCustomerForPayment = (paymentId: string, customer: Customer) => {
    updatePayment(paymentId, { customerId: customer.id, customerName: customer.name });
    setPickerForPaymentId(null);
    if (!customerName.trim()) setCustomerName(customer.name);
  };

  const resetForm = () => {
    setItems([{ id: generateId(), garmentId: '', name: '', code: '', quantity: 1, pricePerUnit: 0, discount: 0 }]);
    setPayments([{ id: generateId(), method: 'cash', amount: 0 }]);
    setPickerForPaymentId(null);
    setCustomerName('');
    setNote('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');

    const validItems = items.filter((i) => i.garmentId !== '');
    if (validItems.length === 0) {
      setSubmitError('Agrega al menos una prenda.');
      return;
    }
    for (const item of validItems) {
      if (item.quantity > getStockForCode(item.code, lots)) {
        setSubmitError(`No hay suficiente stock de "${item.name}". Revisa la cantidad.`);
        return;
      }
      if (item.discount < 0 || item.discount > item.pricePerUnit * item.quantity) {
        setSubmitError(`El descuento de "${item.name}" no puede ser mayor al subtotal de esa línea.`);
        return;
      }
    }
    for (const p of payments) {
      if (p.method === 'balance' && !p.customerId) {
        setSubmitError('Elige de qué clienta se descuenta el pago con "Saldo".');
        return;
      }
      if (p.amount <= 0) {
        setSubmitError('Cada línea de pago debe tener un monto mayor a 0.');
        return;
      }
    }
    if (!amountsMatch(paymentsTotal, total)) {
      setSubmitError(`Los pagos (${formatCurrency(paymentsTotal)}) no cuadran con el total (${formatCurrency(total)}).`);
      return;
    }

    const balancePayment = payments.find((p) => p.method === 'balance');

    const draft: SaleDraft = {
      date: new Date().toISOString(),
      items: validItems,
      payments,
      customerName: customerName.trim() || undefined,
      customerId: balancePayment?.customerId,
      note: note.trim() || undefined,
    };

    setSubmitting(true);
    try {
      await onAdd(draft);
      resetForm();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'No se pudo registrar la venta.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 h-fit">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">Nueva Venta</h2>
        <span className="bg-[#2bb297] text-white px-3 py-1 rounded-full font-black text-xs shadow-sm">#{nextCorrelative}</span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-[10px] font-black text-slate-400 uppercase mb-1 ml-1 tracking-widest">
            Cliente <span className="normal-case text-slate-300">(opcional, venta de mostrador)</span>
          </label>
          <input
            type="text"
            list="sale-customer-names"
            disabled={hasBalancePayment}
            className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#2bb297] bg-slate-50 transition disabled:opacity-60"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="Ej. Cliente de mostrador"
          />
          <datalist id="sale-customer-names">
            {customers.map((c) => <option key={c.id} value={c.name} />)}
          </datalist>
        </div>

        <div className="border-t border-slate-100 pt-5">
          <label className="block text-[10px] font-black text-slate-400 uppercase ml-1 tracking-widest mb-3">Prendas Vendidas</label>

          <div className="space-y-4">
            {isInventoryEmpty ? (
              <div className="bg-[#c9a876]/10 border border-[#c9a876]/25 p-4 rounded-xl text-center">
                <p className="text-xs text-[#8a6a3f] font-bold tracking-tight">⚠️ Primero debes agregar prendas al catálogo.</p>
              </div>
            ) : (
              items.map((item) => {
                const stock = availableStock(item.code, item.id);
                const maxQty = stock + item.quantity;
                const subtotal = item.pricePerUnit * item.quantity;
                return (
                  <div key={item.id} className="p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-3">
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <select
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-[#2bb297]"
                          value={item.garmentId}
                          onChange={(e) => updateItem(item.id, { garmentId: e.target.value })}
                          required
                        >
                          <option value="">-- Seleccionar Prenda --</option>
                          {inventory.map((inv) => {
                            const invStock = availableStock(inv.code, item.id);
                            const outOfStock = invStock <= 0 && inv.id !== item.garmentId;
                            return (
                              <option key={inv.id} value={inv.id} disabled={outOfStock}>
                                {inv.code} - {inv.name} ({formatCurrency(inv.basePrice)}) {outOfStock ? '· Sin stock' : `· Stock: ${invStock}`}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                      {items.length > 1 && (
                        <button type="button" onClick={() => removeItemRow(item.id)} className="p-2 text-[#8c3a4b]/70 hover:text-[#8c3a4b] transition">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                    </div>

                    {item.garmentId && (
                      <>
                        <div className="flex items-center justify-between px-1 flex-wrap gap-2">
                          <div className="flex items-center gap-4">
                            <div>
                              <p className="text-[10px] text-slate-400 font-bold uppercase">Precio Unit.</p>
                              <p className="text-xs font-bold text-slate-700">{formatCurrency(item.pricePerUnit)}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-slate-400 font-bold uppercase mb-1 text-center">Cant. <span className="text-slate-300 normal-case">(stock: {maxQty})</span></p>
                              <input
                                type="number"
                                min="1"
                                max={maxQty}
                                className="w-16 px-2 py-1 border border-slate-200 rounded-md text-xs font-bold text-center"
                                value={item.quantity}
                                onChange={(e) => {
                                  const val = Math.max(1, Math.min(maxQty, parseInt(e.target.value) || 1));
                                  updateItem(item.id, { quantity: val });
                                }}
                              />
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] text-slate-400 font-bold uppercase">Subtotal</p>
                            <p className="text-sm font-black text-[#1a8a72]">{formatCurrency(subtotal)}</p>
                          </div>
                        </div>
                        <div>
                          <label className="block text-[10px] font-black text-[#8c3a4b] uppercase mb-1">
                            Descuento por desperfecto (Q) <span className="normal-case text-slate-400">— opcional</span>
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            max={subtotal}
                            className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-bold"
                            value={item.discount || ''}
                            onChange={(e) => {
                              const val = Math.max(0, Math.min(subtotal, parseFloat(e.target.value) || 0));
                              updateItem(item.id, { discount: val });
                            }}
                            placeholder="0.00"
                          />
                        </div>
                      </>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <button
            type="button"
            onClick={addItemRow}
            disabled={isInventoryEmpty}
            className="mt-4 w-full py-2 border-2 border-dashed border-slate-200 rounded-xl text-[10px] font-black text-slate-400 hover:border-[#2bb297] hover:text-[#1a8a72] transition uppercase tracking-widest flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4" />
            </svg>
            Agregar otra prenda
          </button>
        </div>

        <div className="border-t border-slate-100 pt-5">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-[10px] font-black text-slate-400 uppercase ml-1 tracking-widest">Método(s) de Pago</label>
            <button type="button" onClick={addPaymentRow} className="text-[10px] font-black text-[#2bb297] hover:text-[#1a8a72] uppercase tracking-widest">
              + Combinar otro método
            </button>
          </div>

          <div className="space-y-2">
            {payments.map((p) => (
              <div key={p.id}>
                <div className="flex items-center gap-2">
                  <select
                    className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-xs font-bold focus:ring-2 focus:ring-[#2bb297]"
                    value={p.method}
                    onChange={(e) => handleMethodChange(p.id, e.target.value as PaymentMethod)}
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m.value} value={m.value} disabled={m.value === 'balance' && hasBalancePayment && p.method !== 'balance'}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="w-24 px-2 py-2 border border-slate-200 rounded-lg text-xs font-bold text-right"
                    value={p.amount || ''}
                    onChange={(e) => updatePayment(p.id, { amount: parseFloat(e.target.value) || 0 })}
                    placeholder="0.00"
                  />
                  {payments.length > 1 && (
                    <button type="button" onClick={() => removePaymentRow(p.id)} className="text-[#8c3a4b]/70 hover:text-[#8c3a4b] px-1">×</button>
                  )}
                </div>
                {p.method === 'balance' && (
                  p.customerId ? (
                    <p className="text-[10px] font-bold text-[#8a6a3f] mt-1 ml-1">
                      Usando saldo de <span className="font-black">{p.customerName}</span>{' '}
                      <button type="button" onClick={() => setPickerForPaymentId(p.id)} className="underline">cambiar</button>
                    </p>
                  ) : (
                    <p className="text-[10px] font-bold text-[#8c3a4b] mt-1 ml-1">Elige de qué clienta se descuenta ↓</p>
                  )
                )}
                {pickerForPaymentId === p.id && (
                  <div className="mt-2">
                    <CreditCustomerPicker
                      customers={customers}
                      selectedCustomerId={p.customerId || ''}
                      onSelect={(c) => handlePickCustomerForPayment(p.id, c)}
                      onClose={() => setPickerForPaymentId(null)}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className={`mt-3 text-[11px] font-black text-right ${amountsMatch(remaining, 0) ? 'text-[#1a8a72]' : 'text-[#8c3a4b]'}`}>
            {amountsMatch(remaining, 0) ? '✓ Pagos completos' : remaining > 0 ? `Falta ${formatCurrency(remaining)}` : `Sobran ${formatCurrency(-remaining)}`}
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-black text-slate-400 uppercase mb-1 ml-1 tracking-widest">Nota (opcional)</label>
          <input
            type="text"
            className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#2bb297] text-sm"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ej. Prenda con mancha leve, se vendió con descuento"
          />
        </div>

        <div className="bg-slate-900 p-5 rounded-2xl shadow-xl">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total a Cobrar</span>
            <span className="text-xl font-black text-white">{formatCurrency(total)}</span>
          </div>
        </div>

        {submitError && (
          <p className="text-[11px] text-[#8c3a4b] font-bold bg-[#8c3a4b]/10 border border-[#8c3a4b]/20 rounded-xl px-3 py-2">⚠️ {submitError}</p>
        )}

        <button
          type="submit"
          disabled={isInventoryEmpty || submitting}
          className="w-full bg-[#2bb297] hover:bg-[#1a8a72] disabled:bg-slate-300 text-white font-black py-4 rounded-2xl transition duration-200 shadow-xl shadow-[#2bb297]/30 uppercase tracking-widest text-xs"
        >
          {submitting ? 'Guardando...' : 'Registrar Venta'}
        </button>
      </form>
    </div>
  );
};
