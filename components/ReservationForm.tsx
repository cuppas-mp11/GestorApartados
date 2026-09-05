import React, { useState } from 'react';
import { Reservation, ReservationStatus, InventoryItem, ReservationItem } from '../types';
import { generateId, formatCurrency, getOrAssignCustomerCode } from '../utils';

interface ReservationFormProps {
  onAdd: (reservation: Reservation) => void;
  inventory: InventoryItem[];
  nextCorrelative: number;
  existingReservations: Reservation[];
}

export const ReservationForm: React.FC<ReservationFormProps> = ({ onAdd, inventory, nextCorrelative, existingReservations }) => {
  const [customerName, setCustomerName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [items, setItems] = useState<ReservationItem[]>([
    { id: generateId(), garmentId: '', name: '', code: '', quantity: 1, pricePerUnit: 0 }
  ]);
  const [depositAmount, setDepositAmount] = useState('');

  const totalPrice = items.reduce((acc, item) => acc + (item.pricePerUnit * item.quantity), 0);

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
      if (item.id === id) {
        const updated = { ...item, ...updates };
        if ('garmentId' in updates) {
          const selectedInv = inventory.find(inv => inv.id === updates.garmentId);
          if (selectedInv) {
            updated.name = selectedInv.name;
            updated.code = selectedInv.code;
            updated.pricePerUnit = selectedInv.basePrice;
          } else {
            updated.name = '';
            updated.code = '';
            updated.pricePerUnit = 0;
          }
        }
        return updated;
      }
      return item;
    }));
  };

  const validatePhone = (val: string) => {
    const cleanVal = val.replace(/\D/g, '');
    if (cleanVal.length > 0 && cleanVal.length !== 8) {
      setPhoneError('El teléfono debe tener exactamente 8 dígitos.');
    } else {
      setPhoneError('');
    }
    setPhoneNumber(cleanVal.slice(0, 8));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const deposit = parseFloat(depositAmount) || 0;

    if (!customerName || items.some(i => !i.garmentId)) {
      alert("Por favor completa los datos obligatorios.");
      return;
    }

    if (phoneNumber.length !== 8) {
      setPhoneError('El teléfono debe tener exactamente 8 dígitos.');
      return;
    }

    const assignedCode = getOrAssignCustomerCode(customerName, existingReservations);
    const reservationId = generateId();

    const newReservation: Reservation = {
      id: reservationId,
      correlative: nextCorrelative,
      customerName,
      customerCode: assignedCode,
      phoneNumber,
      items: items.filter(i => i.garmentId !== ''),
      date: new Date(date).toISOString(),
      status: ReservationStatus.PENDING,
      depositAmount: deposit,
      payments: [{
        id: generateId(),
        date: new Date(date).toISOString(),
        amount: deposit,
        note: 'Abono inicial'
      }]
    };

    onAdd(newReservation);

    setCustomerName('');
    setPhoneNumber('');
    setPhoneError('');
    setDepositAmount('');
    setItems([{ id: generateId(), garmentId: '', name: '', code: '', quantity: 1, pricePerUnit: 0 }]);
  };

  const isInventoryEmpty = inventory.length === 0;

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 h-fit">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">Nuevo Apartado</h2>
        <span className="bg-blue-600 text-white px-3 py-1 rounded-full font-black text-xs shadow-sm">#{nextCorrelative}</span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-3">
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase mb-1 ml-1 tracking-widest">Nombre del Cliente</label>
            <input
              type="text"
              required
              list="customer-names"
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 bg-slate-50 transition"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Nombre del cliente"
            />
            <datalist id="customer-names">
              {Array.from(new Set(existingReservations.map(r => r.customerName))).map(name => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase mb-1 ml-1 tracking-widest">Número de Teléfono (8 dígitos)</label>
            <input
              type="text"
              required
              inputMode="numeric"
              className={`w-full px-4 py-2.5 border rounded-xl focus:ring-2 transition bg-slate-50 font-medium ${phoneError ? 'border-rose-400 focus:ring-rose-200' : 'border-slate-200 focus:ring-blue-500'}`}
              value={phoneNumber}
              onChange={(e) => validatePhone(e.target.value)}
              placeholder="Ej. 41235678"
            />
            {phoneError && <p className="text-[10px] text-rose-500 font-bold mt-1 ml-1">{phoneError}</p>}
          </div>
        </div>

        <div className="border-t border-slate-100 pt-5">
          <label className="block text-[10px] font-black text-slate-400 uppercase ml-1 tracking-widest mb-3">Detalle de Prendas</label>

          <div className="space-y-4">
            {isInventoryEmpty ? (
              <div className="bg-amber-50 border border-amber-100 p-4 rounded-xl text-center">
                <p className="text-xs text-amber-700 font-bold tracking-tight">⚠️ Primero debes agregar prendas al catálogo arriba.</p>
              </div>
            ) : (
              items.map((item) => (
                <div key={item.id} className="p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-3">
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <select
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-blue-500"
                        value={item.garmentId}
                        onChange={(e) => updateItem(item.id, { garmentId: e.target.value })}
                        required
                      >
                        <option value="">-- Seleccionar Prenda --</option>
                        {inventory.map(inv => (
                          <option key={inv.id} value={inv.id}>
                            {inv.code} - {inv.name} ({formatCurrency(inv.basePrice)})
                          </option>
                        ))}
                      </select>
                    </div>
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeItemRow(item.id)}
                        className="p-2 text-rose-400 hover:text-rose-600 transition"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </div>

                  {item.garmentId && (
                    <div className="flex items-center justify-between px-1">
                      <div className="flex items-center gap-4">
                        <div>
                          <p className="text-[10px] text-slate-400 font-bold uppercase">Precio Unit.</p>
                          <p className="text-xs font-bold text-slate-700">{formatCurrency(item.pricePerUnit)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-400 font-bold uppercase mb-1 text-center">Cant.</p>
                          <input
                            type="number"
                            min="1"
                            className="w-16 px-2 py-1 border border-slate-200 rounded-md text-xs font-bold text-center"
                            value={item.quantity}
                            onChange={(e) => updateItem(item.id, { quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                          />
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-slate-400 font-bold uppercase">Subtotal</p>
                        <p className="text-sm font-black text-blue-600">{formatCurrency(item.pricePerUnit * item.quantity)}</p>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          <button
            type="button"
            onClick={addItemRow}
            disabled={isInventoryEmpty}
            className="mt-4 w-full py-2 border-2 border-dashed border-slate-200 rounded-xl text-[10px] font-black text-slate-400 hover:border-blue-400 hover:text-blue-500 transition uppercase tracking-widest flex items-center justify-center gap-2"
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
              step="0.01"
              className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 font-bold"
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
              className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-xs font-bold"
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
            <span className="text-[10px] font-black text-rose-400 uppercase tracking-widest">Saldo Pendiente</span>
            <span className="text-xl font-black text-white">{formatCurrency(Math.max(0, totalPrice - (parseFloat(depositAmount) || 0)))}</span>
          </div>
        </div>

        <button
          type="submit"
          disabled={isInventoryEmpty}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-black py-4 rounded-2xl transition duration-200 shadow-xl shadow-blue-200 uppercase tracking-widest text-xs"
        >
          Guardar Registro
        </button>
      </form>
    </div>
  );
};
