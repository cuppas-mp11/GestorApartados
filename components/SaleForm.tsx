import React, { useState } from 'react';
import { InventoryItem, Lot, Customer, Sale, SaleItem, PaymentMethod } from '../types';
import { generateId, formatCurrency, getStockForCode, PAYMENT_METHODS, getSaleItemTotal } from '../utils';

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
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [customerName, setCustomerName] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const total = items.reduce((acc, it) => acc + getSaleItemTotal(it), 0);
  const isInventoryEmpty = inventory.length === 0;

  // Stock disponible por código, restando lo que ya está usado en otras líneas de esta misma venta.
  const availableStock = (code: string, exceptItemId: string) => {
    const totalStock = getStockForCode(code, lots);
    const usedElsewhere = items
      .filter((i) => i.id !== exceptItemId && i.code === code)
      .reduce((acc, i) => acc + i.quantity, 0);
    return Math.max(0, totalStock - usedElsewhere);
  };

  const addItemRow = () => {
    setItems([...items, { id: generateId(), garmentId: '', name: '', code: '', quantity: 1, pricePerUnit: 0, discount: 0 }]);
  };

  const removeItemRow = (id: string) => {
    if (items.length > 1) setItems(items.filter((i) => i.id !== id));
  };

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

  const resetForm = () => {
    setItems([{ id: generateId(), garmentId: '', name: '', code: '', quantity: 1, pricePerUnit: 0, discount: 0 }]);
    setPaymentMethod('cash');
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

    const draft: SaleDraft = {
      date: new Date().toISOString(),
      items: validItems,
      paymentMethod,
      customerName: customerName.trim() || undefined,
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
            className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#2bb297] bg-slate-50 transition"
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
              <div className="bg-amber-50 border border-amber-100 p-4 rounded-xl text-center">
                <p className="text-xs text-amber-700 font-bold tracking-tight">⚠️ Primero debes agregar prendas al catálogo.</p>
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
                        <button type="button" onClick={() => removeItemRow(item.id)} className="p-2 text-rose-400 hover:text-rose-600 transition">
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
          <label className="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1 tracking-widest">Método de Pago</label>
          <div className="grid grid-cols-4 gap-2">
            {PAYMENT_METHODS.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setPaymentMethod(m.value)}
                className={`py-2 rounded-xl text-[10px] font-black uppercase tracking-wide border transition ${
                  paymentMethod === m.value
                    ? 'bg-[#2bb297] border-[#2bb297] text-white shadow-sm'
                    : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-[#2bb297]/40'
                }`}
              >
                {m.label}
              </button>
            ))}
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
          <p className="text-[11px] text-rose-600 font-bold bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">⚠️ {submitError}</p>
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
