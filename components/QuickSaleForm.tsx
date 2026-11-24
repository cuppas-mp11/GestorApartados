import React, { useState } from 'react';
import { InventoryItem, Lot, Customer, Sale, SaleItem, SalePayment, PaymentMethod, LotColorSettings } from '../types';
import { generateId, formatCurrency, getStockForCode, paymentMethodLabel, amountsMatch, PAYMENT_METHODS, getEffectivePriceForCode, getStageInfo, getCandidateLotsForCode, getLotStage } from '../utils';
import { CreditCustomerPicker } from './CreditCustomerPicker';

type SaleDraft = Omit<Sale, 'id' | 'correlative' | 'soldByEmail' | 'status' | 'stockAllocations'>;

interface QuickSaleFormProps {
  onAdd: (sale: SaleDraft) => Promise<void>;
  inventory: InventoryItem[];
  lots: Lot[];
  customers: Customer[];
  lotColorSettings: LotColorSettings;
}

const QUICK_METHODS: { value: PaymentMethod; short: string }[] = [
  { value: 'cash', short: 'EF' },
  { value: 'card', short: 'TC' },
  { value: 'transfer', short: 'DEP' },
];

interface QuickRow {
  id: string;
  garmentId: string;
  code: string;
  name: string;
  pricePerUnit: number;
  quantity: number;
  discount: number;
}

const emptyRow = (): QuickRow => ({ id: generateId(), garmentId: '', code: '', name: '', pricePerUnit: 0, quantity: 1, discount: 0 });

export const QuickSaleForm: React.FC<QuickSaleFormProps> = ({ onAdd, inventory, lots, customers, lotColorSettings }) => {
  // La ventana de "Venta Nueva" se abre bajo demanda — así la vendedora ve
  // primero un botón llamativo en vez del formulario completo, y la ventana
  // se queda abierta tras cada "Guardar" para seguir registrando sin reabrirla.
  const [isOpen, setIsOpen] = useState(false);
  // Varias prendas por venta (ej. la misma clienta pidió varias cosas, o se
  // acumularon entregas) — igual que "+ Agregar otra prenda" en venta
  // detallada y en la entrega de mercadería.
  const [rows, setRows] = useState<QuickRow[]>([emptyRow()]);
  const [note, setNote] = useState('');
  const [showBalancePicker, setShowBalancePicker] = useState(false);
  const [combinedMode, setCombinedMode] = useState(false);
  const [combinedAmounts, setCombinedAmounts] = useState<Partial<Record<PaymentMethod, string>>>({});
  const [combinedCustomer, setCombinedCustomer] = useState<Customer | null>(null);
  const [showCombinedBalancePicker, setShowCombinedBalancePicker] = useState(false);
  // Método elegido para la venta actual — ya NO guarda de una vez al elegirlo;
  // solo se confirma y se guarda al presionar el botón "Guardar" de abajo.
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);
  const [selectedBalanceCustomer, setSelectedBalanceCustomer] = useState<Customer | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isInventoryEmpty = inventory.length === 0;

  // Stock disponible de un código, descontando lo que ya ocuparon las otras
  // filas de esta misma venta (para no vender dos veces el mismo stock).
  const availableStock = (code: string, exceptRowId: string) => {
    const totalStock = getStockForCode(code, lots);
    const usedElsewhere = rows.filter((r) => r.id !== exceptRowId && r.code === code).reduce((acc, r) => acc + r.quantity, 0);
    return Math.max(0, totalStock - usedElsewhere);
  };

  const addRow = () => { setRows((prev) => [...prev, emptyRow()]); resetPaymentUi(); };
  const removeRow = (id: string) => { setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev)); resetPaymentUi(); };

  const updateRow = (id: string, updates: Partial<QuickRow>) => {
    setRows((prev) => prev.map((row) => {
      if (row.id !== id) return row;
      const updated = { ...row, ...updates };
      if ('garmentId' in updates) {
        const inv = inventory.find((i) => i.id === updates.garmentId);
        if (inv) {
          // Precio automático: si la prenda más antigua en stock de este código
          // ya está en descuento (lote por color), se cobra ese precio rebajado
          // de una vez — la vendedora puede ajustarlo a mano si hace falta.
          updated.code = inv.code;
          updated.name = inv.name;
          updated.pricePerUnit = getEffectivePriceForCode(inv.code, lots, inv.basePrice, lotColorSettings);
          const stock = availableStock(inv.code, row.id);
          updated.quantity = Math.max(1, Math.min(updated.quantity || 1, Math.max(1, stock)));
          updated.discount = 0;
        } else {
          updated.code = '';
          updated.name = '';
          updated.pricePerUnit = 0;
        }
      }
      return updated;
    }));
    resetPaymentUi();
  };

  const validRows = rows.filter((r) => r.garmentId !== '');
  const rowTotal = validRows.reduce((acc, r) => acc + Math.max(0, r.pricePerUnit * r.quantity - (r.discount || 0)), 0);
  const rowReady = validRows.length > 0 && validRows.every((r) => r.quantity > 0 && r.quantity <= availableStock(r.code, r.id));

  const resetPaymentUi = () => {
    setShowBalancePicker(false);
    setCombinedMode(false);
    setCombinedAmounts({});
    setCombinedCustomer(null);
    setShowCombinedBalancePicker(false);
    setSelectedMethod(null);
    setSelectedBalanceCustomer(null);
  };

  const commitRow = async (payments: SalePayment[]) => {
    if (!rowReady) {
      setError('Selecciona al menos una prenda con una cantidad válida (dentro del stock disponible).');
      return;
    }
    setError('');
    setSaving(true);

    const items: SaleItem[] = validRows.map((r) => ({
      id: generateId(),
      garmentId: r.garmentId,
      name: r.name,
      code: r.code,
      quantity: r.quantity,
      pricePerUnit: r.pricePerUnit,
      discount: r.discount || 0,
    }));

    const balancePayment = payments.find((p) => p.method === 'balance');

    const saleDraft: SaleDraft = {
      date: new Date().toISOString(),
      items,
      payments,
      note: note.trim() || undefined,
      customerId: balancePayment?.customerId,
      customerName: balancePayment?.customerName,
      quickEntry: true,
    };

    try {
      await onAdd(saleDraft);
      setRows([emptyRow()]);
      setNote('');
      resetPaymentUi();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar esta venta.');
    } finally {
      setSaving(false);
    }
  };

  // Ya no guardan la venta — solo marcan la selección. El guardado real
  // ocurre al presionar "Guardar" (ver handleSaveClick).
  const handleSelectMethod = (method: PaymentMethod) => {
    setError('');
    setSelectedMethod(method);
    setShowBalancePicker(false);
    setCombinedMode(false);
  };

  const handleSelectBalanceCustomer = (customer: Customer) => {
    setError('');
    setSelectedMethod('balance');
    setSelectedBalanceCustomer(customer);
    setShowBalancePicker(false);
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
      setError('Los montos combinados deben sumar exactamente el total de la venta.');
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

  const canSave = combinedMode
    ? combinedComplete
    : rowReady && (
        (!!selectedMethod && selectedMethod !== 'balance') ||
        (selectedMethod === 'balance' && !!selectedBalanceCustomer)
      );

  const handleSaveClick = () => {
    if (combinedMode) {
      submitCombined();
      return;
    }
    if (!rowReady) {
      setError('Selecciona al menos una prenda con una cantidad válida (dentro del stock disponible).');
      return;
    }
    if (!selectedMethod) {
      setError('Selecciona un método de pago.');
      return;
    }
    if (selectedMethod === 'balance') {
      if (!selectedBalanceCustomer) {
        setError('Elige la clienta para pagar con saldo a favor.');
        return;
      }
      commitRow([{ id: generateId(), method: 'balance', amount: rowTotal, customerId: selectedBalanceCustomer.id, customerName: selectedBalanceCustomer.name }]);
      return;
    }
    commitRow([{ id: generateId(), method: selectedMethod, amount: rowTotal }]);
  };

  const handleCloseModal = () => {
    setIsOpen(false);
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="inline-flex bg-[#2bb297] hover:bg-[#1a8a72] text-white font-black px-6 py-4 rounded-2xl transition text-sm items-center justify-center gap-2 shadow-sm uppercase tracking-wide"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
        </svg>
        Venta Nueva
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[92vh] overflow-hidden flex flex-col">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50 flex-shrink-0">
          <div>
            <h2 className="text-lg font-black text-slate-800">Venta Nueva</h2>
            <p className="text-xs font-black text-[#1a8a72] mt-0.5">Total de esta venta: {formatCurrency(rowTotal)}</p>
          </div>
          <button onClick={handleCloseModal} className="text-slate-400 hover:text-slate-600 p-1">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1 space-y-5">
          {isInventoryEmpty ? (
            <div className="bg-[#c9a876]/10 border border-[#c9a876]/25 p-4 rounded-xl text-center">
              <p className="text-xs text-[#8a6a3f] font-bold tracking-tight">⚠️ Primero debes agregar prendas al catálogo.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {rows.map((row) => {
                const stock = row.code ? availableStock(row.code, row.id) : 0;
                const subtotal = row.pricePerUnit * row.quantity;
                const total = Math.max(0, subtotal - (row.discount || 0));
                return (
                  <div key={row.id} className="p-4 bg-white border-2 border-[#2bb297]/30 rounded-2xl shadow-sm">
                    <div className="flex gap-2 items-start">
                      <div className="flex-1">
                        <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Prenda</label>
                        <select
                          className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm font-bold focus:ring-2 focus:ring-[#2bb297]"
                          value={row.garmentId}
                          onChange={(e) => updateRow(row.id, { garmentId: e.target.value })}
                        >
                          <option value="">-- Seleccionar --</option>
                          {inventory.map((inv) => {
                            const invStock = availableStock(inv.code, row.id);
                            const outOfStock = invStock <= 0 && inv.id !== row.garmentId;
                            const effectivePrice = getEffectivePriceForCode(inv.code, lots, inv.basePrice, lotColorSettings);
                            const oldestLot = getCandidateLotsForCode(inv.code, lots).find((l) => l.quantityRemaining > 0);
                            const stageLabel = oldestLot?.color
                              ? getStageInfo(getLotStage(oldestLot.entryDate, lotColorSettings)).label
                              : null;
                            const priceLabel = effectivePrice !== inv.basePrice
                              ? `${formatCurrency(inv.basePrice)} → ${formatCurrency(effectivePrice)}${stageLabel ? ` (${stageLabel})` : ''}`
                              : formatCurrency(inv.basePrice);
                            return (
                              <option key={inv.id} value={inv.id} disabled={outOfStock}>
                                {inv.code} - {inv.name} ({priceLabel}) {outOfStock ? '· Sin stock' : `· Stock: ${invStock}`}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                      {rows.length > 1 && (
                        <button type="button" onClick={() => removeRow(row.id)} className="mt-5 p-2 text-[#8c3a4b]/70 hover:text-[#8c3a4b] transition">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                    </div>

                    {row.garmentId && (
                      <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                        <div>
                          <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Cant. <span className="text-slate-300 normal-case">(stock {stock})</span></label>
                          <input
                            type="number"
                            min="1"
                            max={Math.max(1, stock)}
                            className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm font-bold text-center"
                            value={row.quantity}
                            onChange={(e) => updateRow(row.id, { quantity: Math.max(1, Math.min(Math.max(1, stock), parseInt(e.target.value) || 1)) })}
                          />
                        </div>
                        <div>
                          <label className="block text-[9px] font-black text-[#8c3a4b] uppercase mb-1">Descuento (Q)</label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            max={subtotal}
                            className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm font-bold"
                            value={row.discount || ''}
                            onChange={(e) => updateRow(row.id, { discount: Math.max(0, Math.min(subtotal, parseFloat(e.target.value) || 0)) })}
                            placeholder="0.00"
                          />
                        </div>
                        <div>
                          <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Subtotal</label>
                          <div className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-black text-[#1a8a72] text-right">
                            {formatCurrency(total)}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              <button
                type="button"
                onClick={addRow}
                disabled={isInventoryEmpty}
                className="w-full py-3 border-2 border-dashed border-slate-200 rounded-xl text-[10px] font-black text-slate-400 hover:border-[#2bb297] hover:text-[#1a8a72] transition uppercase tracking-widest flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4" />
                </svg>
                Agregar otra prenda
              </button>
            </div>
          )}

          <div>
            <input
              type="text"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Nota opcional (ej. agujero pequeño, mancha leve...)"
            />
          </div>

          <div className="bg-slate-900 p-4 rounded-2xl shadow-xl flex justify-between items-center">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total a cobrar</span>
            <span className="text-xl font-black text-white">{formatCurrency(rowTotal)}</span>
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mr-1">Método de pago →</span>
              {QUICK_METHODS.map((m) => {
                const active = !combinedMode && selectedMethod === m.value;
                return (
                  <button
                    key={m.value}
                    type="button"
                    disabled={!rowReady || saving}
                    onClick={() => handleSelectMethod(m.value)}
                    className={`w-12 h-12 rounded-full border-2 disabled:opacity-40 disabled:hover:border-slate-200 flex items-center justify-center text-[10px] font-black transition ${
                      active
                        ? 'border-[#2bb297] bg-[#2bb297] text-white'
                        : 'border-slate-200 hover:border-[#2bb297] text-slate-500 hover:text-[#1a8a72] hover:bg-[#2bb297]/5'
                    }`}
                    title={paymentMethodLabel(m.value)}
                  >
                    {m.short}
                  </button>
                );
              })}
              <button
                type="button"
                disabled={!rowReady || saving}
                onClick={() => { setShowBalancePicker(true); setCombinedMode(false); setSelectedMethod(null); setSelectedBalanceCustomer(null); }}
                className={`px-4 py-3 rounded-xl border-2 disabled:opacity-40 text-[10px] font-black uppercase tracking-wide transition ${
                  !combinedMode && selectedMethod === 'balance'
                    ? 'border-[#c9a876] bg-[#c9a876] text-white'
                    : 'border-[#c9a876]/50 hover:border-[#c9a876] bg-[#c9a876]/10 text-[#8a6a3f]'
                }`}
              >
                Saldo a favor
              </button>
              <button
                type="button"
                disabled={!rowReady || saving}
                onClick={() => { setCombinedMode(true); setShowBalancePicker(false); setSelectedMethod(null); setSelectedBalanceCustomer(null); }}
                className={`px-4 py-3 rounded-xl border-2 disabled:opacity-40 text-[10px] font-black uppercase tracking-wide transition ${
                  combinedMode
                    ? 'border-slate-700 bg-slate-700 text-white'
                    : 'border-slate-700/30 hover:border-slate-700 bg-slate-700/5 text-slate-700'
                }`}
              >
                Pago combinado
              </button>
              {saving && <span className="text-[10px] font-black text-slate-400 uppercase">Guardando...</span>}
            </div>

            {!combinedMode && selectedMethod === 'balance' && selectedBalanceCustomer && !showBalancePicker && (
              <p className="mt-2 text-[10px] font-bold text-[#8a6a3f]">
                Pagará con saldo de <span className="font-black">{selectedBalanceCustomer.name}</span>{' '}
                <button type="button" onClick={() => setShowBalancePicker(true)} className="underline">cambiar</button>
              </p>
            )}

            {showBalancePicker && (
              <div className="mt-3">
                <CreditCustomerPicker
                  customers={customers}
                  selectedCustomerId=""
                  onSelect={handleSelectBalanceCustomer}
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

                <div className={`mt-3 text-[10px] font-bold ${combinedComplete ? 'text-[#1a8a72]' : 'text-slate-400'}`}>
                  {combinedComplete ? 'Listo — presiona "Guardar" abajo para registrar la venta.' : 'Completa los montos y, si aplica, la clienta de saldo a favor.'}
                </div>
                <div className="mt-2">
                  <button type="button" onClick={resetPaymentUi} className="px-4 bg-slate-200 text-slate-600 text-xs font-black py-2 rounded-lg">
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {error && (
              <p className="mt-3 text-[11px] text-[#8c3a4b] font-bold bg-[#8c3a4b]/10 border border-[#8c3a4b]/20 rounded-xl px-3 py-2">⚠️ {error}</p>
            )}

            <p className="mt-3 text-[9px] text-slate-400 font-bold uppercase tracking-wide">
              EF= Efectivo &nbsp;&nbsp; TC=Tarjeta &nbsp;&nbsp; DEP=Depósito o transferencia — elige el método y presiona "Guardar" abajo para registrar la venta.
            </p>
          </div>
        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50 flex-shrink-0 flex items-center justify-end gap-3">
          <button
            type="button"
            disabled={!canSave || saving}
            onClick={handleSaveClick}
            className="px-10 py-3.5 bg-[#2bb297] hover:bg-[#1a8a72] disabled:bg-slate-300 text-white text-sm font-black rounded-xl uppercase tracking-wide transition shadow-sm"
          >
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
};
