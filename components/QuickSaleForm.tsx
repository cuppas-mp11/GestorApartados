import React, { useState } from 'react';
import { InventoryItem, Lot, Customer, Sale, SaleItem, SalePayment, PaymentMethod, SaleStatus, UserRole } from '../types';
import { generateId, formatCurrency, getStockForCode, getSaleTotal, getSaleItemsCount, paymentMethodLabel } from '../utils';
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

export const QuickSaleForm: React.FC<QuickSaleFormProps> = ({ onAdd, inventory, lots, customers, sales, role, onCancelSale }) => {
  const [draft, setDraft] = useState(emptyDraft());
  const [showBalancePicker, setShowBalancePicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const todayStr = new Date().toISOString().split('T')[0];
  const todaySales = sales.filter((s) => s.date.startsWith(todayStr)).sort((a, b) => b.correlative - a.correlative);
  const completedToday = todaySales.filter((s) => s.status === SaleStatus.COMPLETED);
  const totalToday = completedToday.reduce((acc, s) => acc + getSaleTotal(s), 0);

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

  const commitRow = async (payment: SalePayment) => {
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

    const saleDraft: SaleDraft = {
      date: new Date().toISOString(),
      items: [item],
      payments: [payment],
      note: draft.note.trim() || undefined,
      customerId: payment.customerId,
      customerName: payment.customerName,
      quickEntry: true,
    };

    try {
      await onAdd(saleDraft);
      setDraft(emptyDraft());
      setShowBalancePicker(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar esta línea.');
    } finally {
      setSaving(false);
    }
  };

  const handleQuickMethod = (method: PaymentMethod) => {
    commitRow({ id: generateId(), method, amount: rowTotal });
  };

  const handleBalanceCustomer = (customer: Customer) => {
    commitRow({ id: generateId(), method: 'balance', amount: rowTotal, customerId: customer.id, customerName: customer.name });
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
              onChange={(e) => handleGarmentChange(e.target.value)}
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
              onChange={(e) => updateDraft({ quantity: Math.max(1, Math.min(stock, parseInt(e.target.value) || 1)) })}
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
              onChange={(e) => updateDraft({ discount: Math.max(0, Math.min(subtotal, parseFloat(e.target.value) || 0)) })}
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
            onClick={() => setShowBalancePicker(true)}
            className="px-4 py-3 rounded-xl border-2 border-[#c9a876]/50 hover:border-[#c9a876] disabled:opacity-40 bg-[#c9a876]/10 text-[10px] font-black text-[#8a6a3f] uppercase tracking-wide transition"
          >
            Saldo a favor
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

        {error && (
          <p className="mt-3 text-[11px] text-[#8c3a4b] font-bold bg-[#8c3a4b]/10 border border-[#8c3a4b]/20 rounded-xl px-3 py-2">⚠️ {error}</p>
        )}

        <p className="mt-3 text-[9px] text-slate-400 font-bold uppercase tracking-wide">
          EF= Efectivo &nbsp;&nbsp; TC=Tarjeta &nbsp;&nbsp; DEP=Depósito o transferencia — cada línea se guarda sola al elegir el método.
        </p>
      </div>

      {/* ---- Ventas de hoy ---- */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-black text-slate-800 uppercase tracking-tight">Venta del día</p>
          <p className="text-lg font-black text-[#1a8a72]">Total del día: {formatCurrency(totalToday)}</p>
        </div>

        {todaySales.length === 0 ? (
          <div className="bg-white p-8 text-center rounded-xl border border-slate-200 shadow-sm">
            <p className="text-slate-400 font-medium text-sm">Aún no hay ventas registradas hoy.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {todaySales.map((sale) => {
              const item = sale.items[0];
              const cancelled = sale.status === SaleStatus.CANCELLED;
              const total = getSaleTotal(sale);
              return (
                <div
                  key={sale.id}
                  className={`flex flex-wrap items-center gap-3 p-3 rounded-xl border ${cancelled ? 'bg-slate-50 border-slate-200 opacity-60' : 'bg-[#2bb297]/5 border-[#2bb297]/20'}`}
                >
                  <span className="text-[9px] font-black bg-white text-slate-400 px-1.5 py-0.5 rounded border border-slate-200">{item.code}</span>
                  <span className="text-xs font-bold text-slate-700 flex-1 min-w-[120px]">
                    <span className="font-black">{item.quantity}x</span> {item.name}
                  </span>
                  {sale.items.length > 1 && (
                    <span className="text-[9px] text-slate-400 font-bold">+{sale.items.length - 1} prenda(s) más</span>
                  )}
                  <div className="flex gap-1">
                    {sale.payments.map((p) => (
                      <span key={p.id} className="text-[9px] font-black uppercase px-2 py-1 rounded-md bg-white border border-slate-200 text-slate-600">
                        {p.method === 'balance' ? 'SALDO' : QUICK_METHODS.find((m) => m.value === p.method)?.short || p.method} {formatCurrency(p.amount)}
                      </span>
                    ))}
                  </div>
                  {item.discount > 0 && (
                    <span className="text-[9px] font-black text-[#8c3a4b] bg-[#8c3a4b]/10 px-1.5 py-0.5 rounded">-{formatCurrency(item.discount)}</span>
                  )}
                  <span className={`text-sm font-black ml-auto ${cancelled ? 'text-slate-400 line-through' : 'text-[#1a8a72]'}`}>{formatCurrency(total)}</span>
                  {cancelled ? (
                    <span className="text-[9px] font-black uppercase px-2 py-1 rounded bg-[#8c3a4b]/15 text-[#6f2d3a]">Anulada</span>
                  ) : role === 'admin' ? (
                    <button
                      onClick={() => onCancelSale(sale.id)}
                      className="text-[10px] font-black text-[#8c3a4b] hover:text-white hover:bg-[#8c3a4b] border border-[#8c3a4b]/30 hover:border-[#8c3a4b] transition px-2 py-1 rounded-lg"
                    >
                      Anular
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-2 text-[10px] text-slate-400 font-bold uppercase tracking-wide">
          {getSaleItemsCount({ items: completedToday.flatMap((s) => s.items) } as Sale)} prenda(s) vendidas hoy en {completedToday.length} venta(s)
        </p>
      </div>
    </div>
  );
};
