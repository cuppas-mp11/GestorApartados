import React, { useState, useEffect } from 'react';
import { Reservation, ReservationStatus, InventoryItem, ReservationItem, Customer, Lot, LotColorSettings } from '../types';
import { generateId, formatCurrency, parseLocalDateInput, getStockForCode, getLocalDateStr, getCandidateLotsForCode, getEffectivePriceForLot, getLotStage, getStageInfo, getLotColorStyle } from '../utils';

interface ReservationFormProps {
  onAdd: (reservation: Reservation) => Promise<void>;
  inventory: InventoryItem[];
  lots: Lot[];
  nextCorrelative: number;
  customers: Customer[];
  lotColorSettings: LotColorSettings;
}

export const ReservationForm: React.FC<ReservationFormProps> = ({ onAdd, inventory, lots, nextCorrelative, customers, lotColorSettings }) => {
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [phoneAutoFilled, setPhoneAutoFilled] = useState(false);
  const [date, setDate] = useState(getLocalDateStr());
  const [items, setItems] = useState<ReservationItem[]>([
    { id: generateId(), garmentId: '', name: '', code: '', quantity: 1, pricePerUnit: 0 }
  ]);
  const [depositAmount, setDepositAmount] = useState('');

  const totalPrice = items.reduce((acc, item) => acc + (item.pricePerUnit * item.quantity), 0);

  // Stock disponible por código, restando lo que ya se está apartando en las
  // otras líneas de este mismo formulario (para no dejar seleccionar más de
  // lo que realmente hay, aunque se repita la misma prenda en dos líneas).
  const availableStock = (code: string, exceptItemId: string) => {
    const totalStock = getStockForCode(code, lots);
    const usedElsewhere = items
      .filter((i) => i.id !== exceptItemId && i.code === code)
      .reduce((acc, i) => acc + i.quantity, 0);
    return Math.max(0, totalStock - usedElsewhere);
  };

  // Lotes de un código que todavía tienen stock.
  const lotsForCode = (code: string): Lot[] => getCandidateLotsForCode(code, lots).filter((l) => l.quantityRemaining > 0);

  // Cuánto queda de un lote, restando lo que otras líneas de este apartado ya tomaron de él.
  const availableForLot = (lotId: string, exceptItemId: string): number => {
    const lot = lots.find((l) => l.id === lotId);
    if (!lot) return 0;
    const usedElsewhere = items.filter((i) => i.id !== exceptItemId && i.lotId === lotId).reduce((acc, i) => acc + i.quantity, 0);
    return Math.max(0, lot.quantityRemaining - usedElsewhere);
  };

  // Congela el precio del lote elegido (con el descuento que tenga HOY) dentro de la línea.
  const applyLot = (item: ReservationItem, lot: Lot | undefined, basePrice: number): ReservationItem => {
    if (!lot) return { ...item, lotId: undefined, lotLabel: undefined, lotColor: undefined, basePrice, pricePerUnit: basePrice, priceNote: undefined };
    const price = getEffectivePriceForLot(lot, basePrice, lotColorSettings);
    const stage = lot.color ? getLotStage(lot.entryDate, lotColorSettings) : null;
    const info = stage ? getStageInfo(stage) : null;
    return {
      ...item,
      lotId: lot.id,
      lotLabel: lot.label,
      lotColor: lot.color,
      basePrice,
      pricePerUnit: price,
      priceNote: info && info.label !== 'Precio normal' ? info.label : undefined,
    };
  };

  // Autocompletar teléfono cuando el nombre coincide EXACTO con un cliente ya registrado
  useEffect(() => {
    const match = customers.find(c => c.name.trim().toLowerCase() === customerName.trim().toLowerCase());
    if (match && customerName.trim() !== '') {
      setPhoneNumber(match.phone);
      setPhoneError('');
      setPhoneAutoFilled(true);
    } else if (phoneAutoFilled) {
      // Si el nombre ya no coincide con nadie, se limpia el teléfono que se había autocompletado
      setPhoneNumber('');
      setPhoneAutoFilled(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerName, customers]);

  const addItemRow = () => {
    setItems([...items, { id: generateId(), garmentId: '', name: '', code: '', quantity: 1, pricePerUnit: 0 }]);
  };

  const removeItemRow = (id: string) => {
    if (items.length > 1) {
      setItems(items.filter(i => i.id !== id));
    }
  };

  const updateItem = (id: string, updates: Partial<ReservationItem>) => {
    setItems(prevItems => prevItems.map(item => {
      if (item.id !== id) return item;
      let updated = { ...item, ...updates };
      if ('garmentId' in updates) {
        const selectedInv = inventory.find(inv => inv.id === updates.garmentId);
        if (selectedInv) {
          updated.name = selectedInv.name;
          updated.code = selectedInv.code;
          // Si hay un solo lote con stock, se elige solo; si hay varios, ella elige.
          const candidates = lotsForCode(selectedInv.code);
          updated = applyLot(updated, candidates.length === 1 ? candidates[0] : undefined, selectedInv.basePrice);
          updated.quantity = 1;
        } else {
          updated = applyLot({ ...updated, name: '', code: '' }, undefined, 0);
        }
      }
      return updated;
    }));
  };

  const chooseLot = (itemId: string, lotId: string) => {
    setItems(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      const inv = inventory.find(i => i.id === item.garmentId);
      const lot = lots.find(l => l.id === lotId);
      const applied = applyLot(item, lot, inv?.basePrice ?? item.basePrice ?? 0);
      const max = lot ? Math.max(1, availableForLot(lotId, itemId)) : 1;
      return { ...applied, quantity: Math.min(applied.quantity || 1, max) };
    }));
  };

  const validatePhone = (val: string) => {
    const cleanVal = val.replace(/\D/g, '').slice(0, 8);
    setPhoneAutoFilled(false); // el usuario está escribiendo el teléfono a mano, ya no es "automático"

    if (cleanVal.length === 8) {
      const match = customers.find(c => c.phone === cleanVal);
      if (match && !customerName.trim()) {
        setCustomerName(match.name);
      }
    }

    if (cleanVal.length > 0 && cleanVal.length !== 8) {
      setPhoneError('El teléfono debe tener exactamente 8 dígitos.');
    } else {
      setPhoneError('');
    }
    setPhoneNumber(cleanVal);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError('');
    const deposit = parseFloat(depositAmount) || 0;

    if (!customerName || items.some(i => !i.garmentId)) {
      alert("Por favor completa los datos obligatorios.");
      return;
    }

    if (phoneNumber.length !== 8) {
      setPhoneError('El teléfono debe tener exactamente 8 dígitos.');
      return;
    }

    // Verificación local de stock antes de intentar guardar (la verificación
    // definitiva ocurre igual en el servidor, por si alguien más vendió al mismo tiempo).
    for (const item of items) {
      if (!item.lotId) {
        setSubmitError(`Elige el lote de "${item.name}" (según la etiqueta de la prenda).`);
        return;
      }
      if (item.quantity > availableForLot(item.lotId, item.id)) {
        setSubmitError(`No hay suficiente stock de "${item.name}" en ese lote. Revisa la cantidad.`);
        return;
      }
    }

    const reservationId = generateId();

    const newReservation: Reservation = {
      id: reservationId,
      correlative: nextCorrelative,
      customerName: customerName.trim(),
      customerCode: '', // App.tsx lo asigna al guardar, según la libreta de clientes
      phoneNumber,
      // Firestore no acepta valores `undefined`: se limpian antes de guardar.
      items: items.filter(i => i.garmentId !== '').map(i => JSON.parse(JSON.stringify(i)) as ReservationItem),
      date: parseLocalDateInput(date).toISOString(),
      status: ReservationStatus.PENDING,
      depositAmount: deposit,
      payments: [{
        id: generateId(),
        date: parseLocalDateInput(date).toISOString(),
        amount: deposit,
        note: 'Abono inicial'
      }]
    };

    setSubmitting(true);
    try {
      await onAdd(newReservation);
      setCustomerName('');
      setPhoneNumber('');
      setPhoneError('');
      setPhoneAutoFilled(false);
      setDepositAmount('');
      setItems([{ id: generateId(), garmentId: '', name: '', code: '', quantity: 1, pricePerUnit: 0 }]);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'No se pudo guardar el apartado.');
    } finally {
      setSubmitting(false);
    }
  };

  const isInventoryEmpty = inventory.length === 0;

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 h-fit">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">Nuevo Apartado</h2>
        <span className="bg-[#2bb297] text-white px-3 py-1 rounded-full font-black text-xs shadow-sm">#{nextCorrelative}</span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-3">
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase mb-1 ml-1 tracking-widest">Nombre del Cliente</label>
            <input
              type="text"
              required
              list="customer-names"
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#2bb297] bg-slate-50 transition"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Nombre del cliente"
            />
            <datalist id="customer-names">
              {customers.map(c => (
                <option key={c.id} value={c.name} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase mb-1 ml-1 tracking-widest">
              Número de Teléfono (8 dígitos) {phoneAutoFilled && <span className="text-[#2bb297] normal-case">· autocompletado ✓</span>}
            </label>
            <input
              type="text"
              required
              inputMode="numeric"
              className={`w-full px-4 py-2.5 border rounded-xl focus:ring-2 transition font-medium ${phoneError ? 'border-[#8c3a4b]/60 focus:ring-[#8c3a4b]/30 bg-slate-50' : phoneAutoFilled ? 'border-[#2bb297]/30 focus:ring-[#2bb297]/20 bg-[#2bb297]/5' : 'border-slate-200 focus:ring-[#2bb297] bg-slate-50'}`}
              value={phoneNumber}
              onChange={(e) => validatePhone(e.target.value)}
              placeholder="Ej. 41235678"
            />
            {phoneError && <p className="text-[10px] text-[#8c3a4b] font-bold mt-1 ml-1">{phoneError}</p>}
          </div>
        </div>

        <div className="border-t border-slate-100 pt-5">
          <label className="block text-[10px] font-black text-slate-400 uppercase ml-1 tracking-widest mb-3">Detalle de Prendas</label>

          <div className="space-y-4">
            {isInventoryEmpty ? (
              <div className="bg-[#c9a876]/10 border border-[#c9a876]/15 p-4 rounded-xl text-center">
                <p className="text-xs text-[#8a6a3f] font-bold tracking-tight">⚠️ Primero debes agregar prendas al catálogo arriba.</p>
              </div>
            ) : (
              items.map((item) => (
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
                        {inventory.map(inv => {
                          const stock = availableStock(inv.code, item.id);
                          const outOfStock = stock <= 0 && inv.id !== item.garmentId;
                          return (
                            <option key={inv.id} value={inv.id} disabled={outOfStock}>
                              {inv.code} - {inv.name} ({formatCurrency(inv.basePrice)}) {outOfStock ? '· Sin stock' : `· Stock: ${stock}`}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeItemRow(item.id)}
                        className="p-2 text-[#8c3a4b]/60 hover:text-[#8c3a4b] transition"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </div>

                  {item.garmentId && (() => {
                    const lotsAvail = lotsForCode(item.code);
                    const selectedLot = lots.find(l => l.id === item.lotId);
                    const badge = getLotColorStyle(selectedLot?.color);
                    const maxQty = item.lotId ? availableForLot(item.lotId, item.id) : 0;
                    return (
                      <>
                        {lotsAvail.length > 1 && (
                          <div>
                            <label className="block text-[9px] font-black text-[#1a8a72] uppercase mb-1">
                              Lote / etiqueta <span className="normal-case text-slate-400">— según la etiqueta física de la prenda</span>
                            </label>
                            <select
                              className="w-full px-3 py-2 border-2 border-[#2bb297]/40 rounded-lg text-sm font-bold focus:ring-2 focus:ring-[#2bb297]"
                              value={item.lotId || ''}
                              onChange={(e) => chooseLot(item.id, e.target.value)}
                            >
                              <option value="">-- Elegir lote --</option>
                              {lotsAvail.map((lot) => {
                                const base = item.basePrice ?? 0;
                                const price = getEffectivePriceForLot(lot, base, lotColorSettings);
                                const avail = availableForLot(lot.id, item.id);
                                const st = getLotColorStyle(lot.color);
                                return (
                                  <option key={lot.id} value={lot.id} disabled={avail <= 0 && lot.id !== item.lotId} style={{ backgroundColor: st.bg, color: st.text }}>
                                    {lot.label} — {price !== base ? `${formatCurrency(base)} → ${formatCurrency(price)}` : formatCurrency(base)} · disponible: {avail}
                                  </option>
                                );
                              })}
                            </select>
                          </div>
                        )}
                        {selectedLot && (
                          <p className="text-[10px] font-bold text-slate-400">
                            Lote:{' '}
                            <span className="inline-block px-2.5 py-1 rounded-full font-black uppercase tracking-wide" style={{ backgroundColor: badge.bg, color: badge.text }}>
                              {selectedLot.label}
                            </span>
                            {lotsAvail.length === 1 && <span className="normal-case"> — único en stock, seleccionado automáticamente</span>}
                          </p>
                        )}
                        {item.lotId && (
                          <div className="flex items-center justify-between px-1">
                            <div className="flex items-center gap-4">
                              <div>
                                <p className="text-[10px] text-slate-400 font-bold uppercase">Precio Unit. (congelado)</p>
                                <p className="text-xs font-bold text-slate-700">
                                  {formatCurrency(item.pricePerUnit)}
                                  {item.basePrice !== undefined && item.pricePerUnit !== item.basePrice && (
                                    <span className="text-slate-400 line-through ml-1.5">{formatCurrency(item.basePrice)}</span>
                                  )}
                                </p>
                                {item.priceNote && <p className="text-[9px] font-black text-[#8a6a3f]">{item.priceNote}</p>}
                              </div>
                              <div>
                                <p className="text-[10px] text-slate-400 font-bold uppercase mb-1 text-center">
                                  Cant. <span className="text-slate-300 normal-case">(en ese lote: {maxQty})</span>
                                </p>
                                <input
                                  type="number"
                                  min="1"
                                  max={Math.max(1, maxQty)}
                                  className="w-16 px-2 py-1 border border-slate-200 rounded-md text-xs font-bold text-center"
                                  value={item.quantity}
                                  onChange={(e) => {
                                    const val = Math.max(1, Math.min(Math.max(1, maxQty), parseInt(e.target.value) || 1));
                                    updateItem(item.id, { quantity: val });
                                  }}
                                />
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-[10px] text-slate-400 font-bold uppercase">Subtotal</p>
                              <p className="text-sm font-black text-[#2bb297]">{formatCurrency(item.pricePerUnit * item.quantity)}</p>
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              ))
            )}
          </div>

          <button
            type="button"
            onClick={addItemRow}
            disabled={isInventoryEmpty}
            className="mt-4 w-full py-2 border-2 border-dashed border-slate-200 rounded-xl text-[10px] font-black text-slate-400 hover:border-[#2bb297]/50 hover:text-[#2bb297] transition uppercase tracking-widest flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4" />
            </svg>
            Agregar otra prenda
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-5">
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase mb-1 ml-1 tracking-widest">Abono Inicial (Q)</label>
            <input
              type="number"
              required
              min="0"
              step="any"
              className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#2bb297] font-bold"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase mb-1 ml-1 tracking-widest">Fecha</label>
            <input
              type="date"
              required
              className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#2bb297] text-xs font-bold"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        </div>

        <div className="bg-slate-900 p-5 rounded-2xl shadow-xl space-y-2">
          <div className="flex justify-between items-center text-slate-400">
            <span className="text-[10px] font-black uppercase tracking-widest">Valor Total</span>
            <span className="text-sm font-bold">{formatCurrency(totalPrice)}</span>
          </div>
          <div className="flex justify-between items-center border-t border-slate-800 pt-2">
            <span className="text-[10px] font-black text-[#8c3a4b]/60 uppercase tracking-widest">Saldo Pendiente</span>
            <span className="text-xl font-black text-white">{formatCurrency(Math.max(0, totalPrice - (parseFloat(depositAmount) || 0)))}</span>
          </div>
        </div>

        {submitError && (
          <p className="text-[11px] text-[#8c3a4b] font-bold bg-[#8c3a4b]/10 border border-[#8c3a4b]/15 rounded-xl px-3 py-2">⚠️ {submitError}</p>
        )}

        <button
          type="submit"
          disabled={isInventoryEmpty || submitting}
          className="w-full bg-[#2bb297] hover:bg-[#1a8a72] disabled:bg-slate-300 text-white font-black py-4 rounded-2xl transition duration-200 shadow-xl shadow-[#2bb297]/20 uppercase tracking-widest text-xs"
        >
          {submitting ? 'Guardando...' : 'Guardar Registro'}
        </button>
      </form>
    </div>
  );
};
