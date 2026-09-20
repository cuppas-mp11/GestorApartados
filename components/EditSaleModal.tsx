import React, { useState } from 'react';
import { InventoryItem, Lot, Customer, Sale, SaleItem, SalePayment, PaymentMethod } from '../types';
import { generateId, formatCurrency, getStockForCode, PAYMENT_METHODS, getSaleItemTotal, getPaymentsTotal, amountsMatch } from '../utils';
import { CreditCustomerPicker } from './CreditCustomerPicker';

type SaleDraft = Omit<Sale, 'id' | 'correlative' | 'soldByEmail' | 'status' | 'stockAllocations'>;

interface EditSaleModalProps {
  sale: Sale;
  inventory: InventoryItem[];
  lots: Lot[];
  customers: Customer[];
  onSave: (original: Sale, draft: SaleDraft) => Promise<void>;
  onClose: () => void;
}

// Stock disponible para editar: al stock actual de cada código le suma de vuelta
// lo que esta MISMA venta ya tenía reservado, para no bloquear al admin por
// cantidades que en realidad siguen "siendo de esta venta".
const availableStockForEdit = (code: string, lots: Lot[], sale: Sale, exceptItemId: string, items: SaleItem[]) => {
  const totalStock = getStockForCode(code, lots);
  const heldByThisSale = sale.stockAllocations.filter((a) => a.code === code).reduce((acc, a) => acc + a.quantity, 0);
  const usedElsewhereInDraft = items.filter((i) => i.id !== exceptItemId && i.code === code).reduce((acc, i) => acc + i.quantity, 0);
  return Math.max(0, totalStock + heldByThisSale - usedElsewhereInDraft);
};

export const EditSaleModal: React.FC<EditSaleModalProps> = ({ sale, inventory, lots, customers, onSave, onClose }) => {
  const [items, setItems] = useState<SaleItem[]>(sale.items.map((it) => ({ ...it })));
  const [payments, setPayments] = useState<SalePayment[]>(sale.payments.map((p) => ({ ...p })));
  const [pickerForPaymentId, setPickerForPaymentId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState(sale.customerName || '');
  const [note, setNote] = useState(sale.note || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const total = items.reduce((acc, it) => acc + getSaleItemTotal(it), 0);
  const paymentsTotal = getPaymentsTotal(payments);
  const remaining = total - paymentsTotal;
  const hasBalancePayment = payments.some((p) => p.method === 'balance');

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
          const stock = availableStockForEdit(inv.code, lots, sale, item.id, items);
          updated.quantity = Math.max(1, Math.min(updated.quantity || 1, Math.max(1, stock)));
          updated.discount = 0;
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
    updatePayment(paymentId, { method, customerId: undefined, customerName: undefined });
    setPickerForPaymentId(method === 'balance' ? paymentId : null);
  };
  const handlePickCustomerForPayment = (paymentId: string, customer: Customer) => {
    updatePayment(paymentId, { customerId: customer.id, customerName: customer.name });
    setPickerForPaymentId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const validItems = items.filter((i) => i.garmentId !== '');
    if (validItems.length === 0) {
      setError('Debe quedar al menos una prenda.');
      return;
    }
    for (const item of validItems) {
      const maxQty = availableStockForEdit(item.code, lots, sale, item.id, validItems);
      if (item.quantity > maxQty) {
        setError(`No hay suficiente stock de "${item.name}" para dejarlo en ${item.quantity}.`);
        return;
      }
    }
    for (const p of payments) {
      if (p.method === 'balance' && !p.customerId) {
        setError('Elige de qué clienta se descuenta el pago con "Saldo".');
        return;
      }
      if (p.amount <= 0) {
        setError('Cada línea de pago debe tener un monto mayor a 0.');
        return;
      }
    }
    if (!amountsMatch(paymentsTotal, total)) {
      setError(`Los pagos (${formatCurrency(paymentsTotal)}) no cuadran con el nuevo total (${formatCurrency(total)}).`);
      return;
    }

    const balancePayment = payments.find((p) => p.method === 'balance');
    const draft: SaleDraft = {
      date: sale.date,
      items: validItems,
      payments,
      customerName: customerName.trim() || undefined,
      customerId: balancePayment?.customerId,
      note: note.trim() || undefined,
      quickEntry: sale.quickEntry,
    };

    setSaving(true);
    try {
      await onSave(sale, draft);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la corrección.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div>
            <h2 className="text-lg font-black text-slate-800">Editar venta #{sale.correlative}</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase">Solo administrador · queda registrado quién corrigió</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto flex-1 space-y-5">
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Cliente (opcional)</label>
            <input
              type="text"
              disabled={hasBalancePayment}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm disabled:opacity-60"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Prendas</label>
            <div className="space-y-3">
              {items.map((item) => {
                const maxQty = availableStockForEdit(item.code, lots, sale, item.id, items);
                const subtotal = item.pricePerUnit * item.quantity;
                return (
                  <div key={item.id} className="p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-2">
                    <div className="flex gap-2">
                      <select
                        className="flex-1 px-2 py-2 border border-slate-200 rounded-lg text-xs font-bold"
                        value={item.garmentId}
                        onChange={(e) => updateItem(item.id, { garmentId: e.target.value })}
                      >
                        <option value="">-- Prenda --</option>
                        {inventory.map((inv) => (
                          <option key={inv.id} value={inv.id}>{inv.code} - {inv.name} ({formatCurrency(inv.basePrice)})</option>
                        ))}
                      </select>
                      {items.length > 1 && (
                        <button type="button" onClick={() => removeItemRow(item.id)} className="text-[#8c3a4b]/70 hover:text-[#8c3a4b] px-1">×</button>
                      )}
                    </div>
                    {item.garmentId && (
                      <div className="flex items-center gap-3 flex-wrap">
                        <div>
                          <p className="text-[9px] font-black text-slate-400 uppercase">Cant. (máx {maxQty})</p>
                          <input
                            type="number" min="1" max={maxQty}
                            className="w-16 px-2 py-1 border border-slate-200 rounded-md text-xs font-bold text-center"
                            value={item.quantity}
                            onChange={(e) => updateItem(item.id, { quantity: Math.max(1, Math.min(maxQty, parseInt(e.target.value) || 1)) })}
                          />
                        </div>
                        <div>
                          <p className="text-[9px] font-black text-[#8c3a4b] uppercase">Descuento</p>
                          <input
                            type="number" min="0" step="0.01" max={subtotal}
                            className="w-20 px-2 py-1 border border-slate-200 rounded-md text-xs font-bold"
                            value={item.discount || ''}
                            onChange={(e) => updateItem(item.id, { discount: Math.max(0, Math.min(subtotal, parseFloat(e.target.value) || 0)) })}
                            placeholder="0.00"
                          />
                        </div>
                        <div className="ml-auto text-right">
                          <p className="text-[9px] font-black text-slate-400 uppercase">Total línea</p>
                          <p className="text-sm font-black text-[#1a8a72]">{formatCurrency(getSaleItemTotal(item))}</p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <button type="button" onClick={addItemRow} className="mt-2 w-full py-1.5 border-2 border-dashed border-slate-200 rounded-lg text-[10px] font-black text-slate-400 hover:border-[#2bb297] hover:text-[#1a8a72] uppercase">
              + Agregar prenda
            </button>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-[10px] font-black text-slate-400 uppercase">Método(s) de pago</label>
              <button type="button" onClick={addPaymentRow} className="text-[10px] font-black text-[#2bb297] uppercase">+ Combinar</button>
            </div>
            <div className="space-y-2">
              {payments.map((p) => (
                <div key={p.id}>
                  <div className="flex items-center gap-2">
                    <select
                      className="flex-1 px-2 py-2 border border-slate-200 rounded-lg text-xs font-bold"
                      value={p.method}
                      onChange={(e) => handleMethodChange(p.id, e.target.value as PaymentMethod)}
                    >
                      {PAYMENT_METHODS.map((m) => (
                        <option key={m.value} value={m.value} disabled={m.value === 'balance' && hasBalancePayment && p.method !== 'balance'}>{m.label}</option>
                      ))}
                    </select>
                    <input
                      type="number" min="0" step="0.01"
                      className="w-24 px-2 py-2 border border-slate-200 rounded-lg text-xs font-bold text-right"
                      value={p.amount || ''}
                      onChange={(e) => updatePayment(p.id, { amount: parseFloat(e.target.value) || 0 })}
                    />
                    {payments.length > 1 && (
                      <button type="button" onClick={() => removePaymentRow(p.id)} className="text-[#8c3a4b]/70 hover:text-[#8c3a4b] px-1">×</button>
                    )}
                  </div>
                  {p.method === 'balance' && (
                    p.customerId ? (
                      <p className="text-[10px] font-bold text-[#8a6a3f] mt-1">
                        Saldo de <span className="font-black">{p.customerName}</span>{' '}
                        <button type="button" onClick={() => setPickerForPaymentId(p.id)} className="underline">cambiar</button>
                      </p>
                    ) : (
                      <p className="text-[10px] font-bold text-[#8c3a4b] mt-1">Elige clienta ↓</p>
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
            <div className={`mt-2 text-[11px] font-black text-right ${amountsMatch(remaining, 0) ? 'text-[#1a8a72]' : 'text-[#8c3a4b]'}`}>
              {amountsMatch(remaining, 0) ? '✓ Pagos completos' : remaining > 0 ? `Falta ${formatCurrency(remaining)}` : `Sobran ${formatCurrency(-remaining)}`}
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Nota</label>
            <input
              type="text"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <div className="bg-slate-900 p-4 rounded-xl flex justify-between items-center">
            <span className="text-[10px] font-black text-slate-400 uppercase">Nuevo total</span>
            <span className="text-lg font-black text-white">{formatCurrency(total)}</span>
          </div>

          {error && <p className="text-[11px] text-[#8c3a4b] font-bold bg-[#8c3a4b]/10 border border-[#8c3a4b]/20 rounded-xl px-3 py-2">⚠️ {error}</p>}

          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={saving} className="flex-1 bg-[#2bb297] hover:bg-[#1a8a72] disabled:bg-slate-300 text-white font-black py-3 rounded-xl text-xs uppercase tracking-widest">
              {saving ? 'Guardando...' : 'Guardar corrección'}
            </button>
            <button type="button" onClick={onClose} className="px-5 bg-slate-200 text-slate-600 font-black py-3 rounded-xl text-xs uppercase">
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
