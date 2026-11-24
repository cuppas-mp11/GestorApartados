import React, { useState } from 'react';
import { InventoryItem, Lot, Customer, Sale, SaleItem, SalePayment, PaymentMethod, SaleStatus, UserRole, LotColorSettings } from '../types';
import { generateId, formatCurrency, getStockForCode, getSaleTotal, getSaleItemsCount, paymentMethodLabel, getPaymentsTotal, amountsMatch, PAYMENT_METHODS, getDailySequenceMap, getLocalDateStr, isSameLocalDay, getEffectivePriceForCode, getStageInfo, getCandidateLotsForCode, getLotStage } from '../utils';
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
  lotColorSettings: LotColorSettings;
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

export const QuickSaleForm: React.FC<QuickSaleFormProps> = ({ onAdd, inventory, lots, customers, sales, role, onCancelSale, onEditSale, lotColorSettings }) => {
  // La ventana de "Venta Nueva" se abre bajo demanda — así la vendedora ve
  // primero un botón llamativo en vez del formulario completo, y la ventana
  // se queda abierta tras cada "Guardar" para seguir registrando sin reabrirla.
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState(emptyDraft());
  const [showBalancePicker, setShowBalancePicker] = useState(false);
  const [combinedMode, setCombinedMode] = useState(false);
  const [combinedAmounts, setCombinedAmounts] = useState<Partial<Record<PaymentMethod, string>>>({});
  const [combinedCustomer, setCombinedCustomer] = useState<Customer | null>(null);
  const [showCombinedBalancePicker, setShowCombinedBalancePicker] = useState(false);
  // Método elegido para la línea actual — ya NO guarda de una vez al elegirlo;
  // solo se confirma y se guarda al presionar el botón "Guardar" de abajo.
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);
  const [selectedBalanceCustomer, setSelectedBalanceCustomer] = useState<Customer | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [methodFilter, setMethodFilter] = useState<'ALL' | 'DISCOUNT' | PaymentMethod>('ALL');

  const todayStr = getLocalDateStr();
  // Ascendente: la primera venta del día queda arriba (#1), y las nuevas se
  // van agregando hacia abajo — más fácil de seguir visualmente que ir
  // buscando la más reciente hasta arriba.
  const todaySales = sales.filter((s) => isSameLocalDay(s.date)).sort((a, b) => a.correlative - b.correlative);
  const completedToday = todaySales.filter((s) => s.status === SaleStatus.COMPLETED);
  const totalToday = completedToday.reduce((acc, s) => acc + getSaleTotal(s), 0);
  const dailySeq = getDailySequenceMap(todaySales);

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
    // Precio automático: si la prenda más antigua en stock de este código ya
    // está en descuento (lote por color), se cobra ese precio rebajado de
    // una vez — la vendedora puede ajustarlo a mano si hace falta.
    const effectivePrice = getEffectivePriceForCode(inv.code, lots, inv.basePrice, lotColorSettings);
    setDraft({ ...emptyDraft(), garmentId, code: inv.code, name: inv.name, pricePerUnit: effectivePrice, quantity: 1 });
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
      setError('Selecciona una prenda y una cantidad válida (dentro del stock disponible).');
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

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="w-full bg-[#2bb297] hover:bg-[#1a8a72] text-white font-black py-5 rounded-2xl transition text-base flex items-center justify-center gap-3 shadow-sm uppercase tracking-wide"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
        </svg>
        Venta Nueva
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[92vh] overflow-hidden flex flex-col">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50 flex-shrink-0">
          <div>
            <h2 className="text-lg font-black text-slate-800">Venta del día</h2>
            <p className="text-xs font-black text-[#1a8a72] mt-0.5">Total del día: {formatCurrency(totalToday)}</p>
          </div>
          <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-slate-600 p-1">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1 space-y-6">
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
                const effectivePrice = getEffectivePriceForCode(inv.code, lots, inv.basePrice, lotColorSettings);
                const oldestLot = getCandidateLotsForCode(inv.code, lots).find((l) => l.quantityRemaining > 0);
                const stageLabel = oldestLot?.color
                  ? getStageInfo(getLotStage(oldestLot.entryDate, lotColorSettings)).label
                  : null;
                const priceLabel = effectivePrice !== inv.basePrice
                  ? `${formatCurrency(inv.basePrice)} → ${formatCurrency(effectivePrice)}${stageLabel ? ` (${stageLabel})` : ''}`
                  : formatCurrency(inv.basePrice);
                return (
                  <option key={inv.id} value={inv.id} disabled={invStock <= 0}>
                    {inv.code} - {inv.name} ({priceLabel}) {invStock <= 0 ? '· Sin stock' : `· Stock: ${invStock}`}
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

      {/* ---- Ventas de hoy ---- */}
      <div>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <p className="text-sm font-black text-slate-800 uppercase tracking-tight">Historial de hoy</p>
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
                        <td className="px-3 py-2.5 text-[10px] font-bold text-slate-400">{dailySeq.get(sale.id)}</td>
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

