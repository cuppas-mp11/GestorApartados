import React, { useState } from 'react';
import { InventoryItem, Lot, Customer, Sale, SaleItem, SalePayment, PaymentMethod, LotColorSettings, LotStage } from '../types';
import { generateId, formatCurrency, getStockForCode, paymentMethodLabel, amountsMatch, PAYMENT_METHODS, getCandidateLotsForCode, getEffectivePriceForLot, getLotStage, getStageInfo, getLotColorStyle } from '../utils';
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
  basePrice: number;
  quantity: number;
  // De qué lote/etiqueta física es la prenda. Si el código solo tiene un lote
  // con stock, se auto-selecciona solo; si tiene varios, la vendedora debe
  // elegirlo a mano viendo la etiqueta del lote físico.
  lotId: string;
  // Descuento adicional manual (ej. por desperfecto), aparte del descuento
  // automático que ya trae el lote elegido según su etapa de rebaja.
  extraDiscount: number;
}

const emptyRow = (): QuickRow => ({ id: generateId(), garmentId: '', code: '', name: '', basePrice: 0, quantity: 1, lotId: '', extraDiscount: 0 });

interface RowComputed {
  lotsForRow: Lot[];
  needsLotChoice: boolean;
  selectedLot: Lot | null;
  available: number;
  effectivePrice: number;
  lotDiscountTotal: number;
  totalDiscount: number;
  subtotal: number;
  lineTotal: number;
  stage: LotStage | null;
  stageInfo: { label: string; level: 'green' | 'amber' | 'red' | 'slate' } | null;
  ready: boolean;
}

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

  // Lotes de un código que todavía tienen stock, del más antiguo al más nuevo
  // (el orden no importa para la elección manual, pero mantenerlo consistente
  // ayuda a leerlo de un vistazo).
  const lotsForCode = (code: string): Lot[] => getCandidateLotsForCode(code, lots).filter((l) => l.quantityRemaining > 0);

  // Cuánto queda de un lote específico, descontando lo que ya ocuparon otras
  // filas de esta misma venta que eligieron ese mismo lote.
  const availableForLot = (lotId: string, exceptRowId: string): number => {
    const lot = lots.find((l) => l.id === lotId);
    if (!lot) return 0;
    const usedElsewhere = rows.filter((r) => r.id !== exceptRowId && r.lotId === lotId).reduce((acc, r) => acc + r.quantity, 0);
    return Math.max(0, lot.quantityRemaining - usedElsewhere);
  };

  const computeRow = (row: QuickRow): RowComputed => {
    const lotsForRow = row.code ? lotsForCode(row.code) : [];
    const needsLotChoice = lotsForRow.length > 1;
    const selectedLot = lotsForRow.find((l) => l.id === row.lotId) || null;
    const available = row.lotId ? availableForLot(row.lotId, row.id) : 0;
    const effectivePrice = selectedLot ? getEffectivePriceForLot(selectedLot, row.basePrice, lotColorSettings) : row.basePrice;
    const lotDiscountTotal = Math.max(0, row.basePrice - effectivePrice) * row.quantity;
    const extraDiscount = row.extraDiscount || 0;
    const totalDiscount = lotDiscountTotal + extraDiscount;
    const subtotal = row.basePrice * row.quantity;
    const lineTotal = Math.max(0, subtotal - totalDiscount);
    const stage = selectedLot?.color ? getLotStage(selectedLot.entryDate, lotColorSettings) : null;
    const stageInfo = stage ? getStageInfo(stage) : null;
    const ready = row.garmentId !== '' && !!row.lotId && row.quantity > 0 && row.quantity <= available;
    return { lotsForRow, needsLotChoice, selectedLot, available, effectivePrice, lotDiscountTotal, totalDiscount, subtotal, lineTotal, stage, stageInfo, ready };
  };

  const resetPaymentUi = () => {
    setShowBalancePicker(false);
    setCombinedMode(false);
    setCombinedAmounts({});
    setCombinedCustomer(null);
    setShowCombinedBalancePicker(false);
    setSelectedMethod(null);
    setSelectedBalanceCustomer(null);
  };

  const addRow = () => { setRows((prev) => [...prev, emptyRow()]); resetPaymentUi(); };
  const removeRow = (id: string) => { setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev)); resetPaymentUi(); };

  const updateRow = (id: string, updates: Partial<QuickRow>) => {
    setRows((prev) => prev.map((row) => {
      if (row.id !== id) return row;
      let updated = { ...row, ...updates };
      if ('garmentId' in updates) {
        const inv = inventory.find((i) => i.id === updates.garmentId);
        if (inv) {
          updated.code = inv.code;
          updated.name = inv.name;
          updated.basePrice = inv.basePrice;
          updated.extraDiscount = 0;
          // Si solo hay un lote con stock de este código, se auto-selecciona
          // (nada que elegir); si hay varios, queda sin elegir hasta que la
          // vendedora vea la etiqueta física y marque cuál es.
          const candidates = lotsForCode(inv.code);
          if (candidates.length === 1) {
            const only = candidates[0];
            updated.lotId = only.id;
            updated.quantity = Math.max(1, Math.min(updated.quantity || 1, availableForLot(only.id, row.id)));
          } else {
            updated.lotId = '';
            updated.quantity = 1;
          }
        } else {
          updated = { ...updated, code: '', name: '', basePrice: 0, lotId: '', extraDiscount: 0, quantity: 1 };
        }
      } else if ('lotId' in updates && updates.lotId) {
        const max = Math.max(1, availableForLot(updates.lotId, row.id));
        updated.quantity = Math.max(1, Math.min(updated.quantity || 1, max));
      }
      return updated;
    }));
    resetPaymentUi();
  };

  const validRows = rows.filter((r) => r.garmentId !== '');
  const rowComputations = new Map(rows.map((r) => [r.id, computeRow(r)]));
  const rowTotal = validRows.reduce((acc, r) => acc + (rowComputations.get(r.id)?.lineTotal || 0), 0);
  const rowReady = validRows.length > 0 && validRows.every((r) => rowComputations.get(r.id)?.ready);

  const commitRow = async (payments: SalePayment[]) => {
    if (!rowReady) {
      setError('Revisa las prendas: falta elegir lote o la cantidad no cabe en el stock de ese lote.');
      return;
    }
    setError('');
    setSaving(true);

    const items: SaleItem[] = validRows.map((r) => {
      const c = rowComputations.get(r.id)!;
      return {
        id: generateId(),
        garmentId: r.garmentId,
        name: r.name,
        code: r.code,
        quantity: r.quantity,
        pricePerUnit: r.basePrice,
        discount: c.totalDiscount,
        lotId: r.lotId || undefined,
      };
    });

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
    if (validRows.length === 0) {
      setError('Agrega al menos una prenda.');
      return;
    }
    const unresolvedRow = validRows.find((r) => !rowComputations.get(r.id)?.ready);
    if (unresolvedRow) {
      const c = rowComputations.get(unresolvedRow.id)!;
      if (!unresolvedRow.lotId) {
        setError(`Elige de qué lote/etiqueta es "${unresolvedRow.name}" antes de guardar.`);
      } else {
        setError(`Revisa la cantidad de "${unresolvedRow.name}" — no hay suficiente stock en ese lote (disponible: ${c.available}).`);
      }
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
                const c = computeRow(row);
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
                            const invStock = getStockForCode(inv.code, lots);
                            const outOfStock = invStock <= 0 && inv.id !== row.garmentId;
                            return (
                              <option key={inv.id} value={inv.id} disabled={outOfStock}>
                                {inv.code} - {inv.name} ({formatCurrency(inv.basePrice)}) {outOfStock ? '· Sin stock' : `· Stock: ${invStock}`}
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
                      <>
                        {/* ---- Lote / etiqueta ---- */}
                        <div className="mt-3">
                          {c.needsLotChoice ? (
                            <>
                              <label className="block text-[9px] font-black text-[#1a8a72] uppercase mb-1">
                                Lote / etiqueta de la prenda <span className="normal-case text-slate-400">— según lo que diga la etiqueta física</span>
                              </label>
                              <select
                                className="w-full px-3 py-2.5 border-2 border-[#2bb297]/40 rounded-lg text-sm font-bold focus:ring-2 focus:ring-[#2bb297]"
                                value={row.lotId}
                                onChange={(e) => updateRow(row.id, { lotId: e.target.value })}
                              >
                                <option value="">-- Elegir lote --</option>
                                {c.lotsForRow.map((lot) => {
                                  const price = getEffectivePriceForLot(lot, row.basePrice, lotColorSettings);
                                  const stage = lot.color ? getLotStage(lot.entryDate, lotColorSettings) : null;
                                  const info = stage ? getStageInfo(stage) : null;
                                  const avail = availableForLot(lot.id, row.id);
                                  const priceLabel = price !== row.basePrice
                                    ? `${formatCurrency(row.basePrice)} → ${formatCurrency(price)}${info ? ` (${info.label})` : ''}`
                                    : formatCurrency(row.basePrice);
                                  const disabledOpt = avail <= 0 && lot.id !== row.lotId;
                                  const optStyle = getLotColorStyle(lot.color);
                                  return (
                                    <option key={lot.id} value={lot.id} disabled={disabledOpt} style={{ backgroundColor: optStyle.bg, color: optStyle.text }}>
                                      {lot.label} — {priceLabel} · disponible: {avail}
                                    </option>
                                  );
                                })}
                              </select>
                              {c.selectedLot && (() => {
                                const badgeStyle = getLotColorStyle(c.selectedLot.color);
                                return (
                                  <p className="mt-2 text-[10px] font-bold text-slate-400">
                                    Elegido:{' '}
                                    <span
                                      className="inline-block px-2.5 py-1 rounded-full font-black uppercase tracking-wide"
                                      style={{ backgroundColor: badgeStyle.bg, color: badgeStyle.text }}
                                    >
                                      {c.selectedLot.label}
                                    </span>
                                    {c.stageInfo && c.stageInfo.label !== 'Precio normal' ? ` · ${c.stageInfo.label}` : ''}
                                  </p>
                                );
                              })()}
                            </>
                          ) : c.selectedLot ? (() => {
                            const badgeStyle = getLotColorStyle(c.selectedLot.color);
                            return (
                              <p className="text-[10px] font-bold text-slate-400">
                                Lote:{' '}
                                <span
                                  className="inline-block px-2.5 py-1 rounded-full font-black uppercase tracking-wide"
                                  style={{ backgroundColor: badgeStyle.bg, color: badgeStyle.text }}
                                >
                                  {c.selectedLot.label}
                                </span>
                                {c.stageInfo && c.stageInfo.label !== 'Precio normal' ? ` · ${c.stageInfo.label}` : ''}
                                <span className="normal-case"> — único en stock, seleccionado automáticamente</span>
                              </p>
                            );
                          })() : null}
                        </div>

                        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                          <div>
                            <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">
                              Cant. {row.lotId && <span className="text-slate-300 normal-case">(stock de ese lote: {c.available})</span>}
                            </label>
                            <input
                              type="number"
                              min="1"
                              max={Math.max(1, c.available)}
                              disabled={!row.lotId}
                              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm font-bold text-center disabled:opacity-50"
                              value={row.quantity}
                              onChange={(e) => updateRow(row.id, { quantity: Math.max(1, Math.min(Math.max(1, c.available), parseInt(e.target.value) || 1)) })}
                            />
                          </div>
                          <div>
                            <label className="block text-[9px] font-black text-[#8c3a4b] uppercase mb-1">Descuento adicional (Q) <span className="normal-case text-slate-400">— opcional</span></label>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              max={Math.max(0, c.subtotal - c.lotDiscountTotal)}
                              className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm font-bold"
                              value={row.extraDiscount || ''}
                              onChange={(e) => updateRow(row.id, { extraDiscount: Math.max(0, Math.min(Math.max(0, c.subtotal - c.lotDiscountTotal), parseFloat(e.target.value) || 0)) })}
                              placeholder="0.00"
                            />
                          </div>
                          <div>
                            <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Subtotal</label>
                            <div className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-black text-[#1a8a72] text-right">
                              {formatCurrency(c.lineTotal)}
                            </div>
                          </div>
                        </div>

                        {c.lotDiscountTotal > 0 && (
                          <p className="mt-2 text-[10px] font-black text-[#8c3a4b] bg-[#8c3a4b]/10 border border-[#8c3a4b]/20 rounded-lg px-2 py-1.5 inline-block">
                            Descuento por lote ({c.stageInfo?.label}): -{formatCurrency(c.lotDiscountTotal)}
                          </p>
                        )}
                      </>
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
