import React, { useState } from 'react';
import { Reservation, ReservationStatus, UserRole } from '../types';
import { formatDate, isOverdue, calculateDaysPassed, formatCurrency, getDeadlineDate, getTotalPrice, getTotalPaid, getBalance, DEADLINE_DAYS, getDisplayName } from '../utils';

interface ReservationTableProps {
  reservations: Reservation[];
  onUpdateStatus: (id: string, status: ReservationStatus) => void;
  onDelete: (id: string) => void;
  onAddPayment: (id: string, amount: number) => void;
  onEditField: (id: string, field: 'customerName' | 'phoneNumber', newValue: string) => void;
  role: UserRole | null;
  aliases: Record<string, string>;
}

export const ReservationTable: React.FC<ReservationTableProps> = ({ reservations, onUpdateStatus, onDelete, onAddPayment, onEditField, role, aliases }) => {
  const [addingPaymentId, setAddingPaymentId] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentError, setPaymentError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editPhoneError, setEditPhoneError] = useState('');

  const startEditing = (res: Reservation) => {
    setEditingId(res.id);
    setEditName(res.customerName);
    setEditPhone(res.phoneNumber);
    setEditPhoneError('');
  };

  const saveEdit = (e: React.FormEvent, res: Reservation) => {
    e.preventDefault();
    const cleanPhone = editPhone.replace(/\D/g, '').slice(0, 8);
    if (cleanPhone.length !== 8) {
      setEditPhoneError('El teléfono debe tener exactamente 8 dígitos.');
      return;
    }
    if (!editName.trim()) {
      setEditPhoneError('El nombre no puede quedar vacío.');
      return;
    }
    if (editName !== res.customerName) onEditField(res.id, 'customerName', editName.trim());
    if (cleanPhone !== res.phoneNumber) onEditField(res.id, 'phoneNumber', cleanPhone);
    setEditingId(null);
  };

  const handleAddPayment = (e: React.FormEvent, res: Reservation) => {
    e.preventDefault();
    const amount = parseFloat(paymentAmount);
    const balance = getBalance(res);

    if (isNaN(amount) || amount <= 0) {
      setPaymentError('Ingresa un monto válido.');
      return;
    }
    // Evita sobrepago: el abono no puede superar el saldo pendiente
    if (amount > balance + 0.01) {
      setPaymentError(`El abono no puede superar el saldo (${formatCurrency(balance)}).`);
      return;
    }
    onAddPayment(res.id, amount);
    setAddingPaymentId(null);
    setPaymentAmount('');
    setPaymentError('');
  };

  if (reservations.length === 0) {
    return (
      <div className="bg-white p-12 text-center rounded-xl border border-slate-200 shadow-sm">
        <svg className="w-16 h-16 mx-auto mb-4 opacity-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
        <p className="text-slate-500 font-medium tracking-tight">Aún no hay registros de apartados.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">#</th>
              <th className="px-4 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Cliente</th>
              <th className="px-4 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Prendas</th>
              <th className="px-4 py-4 text-xs font-bold text-slate-400 uppercase text-center tracking-widest">Cant.</th>
              <th className="px-4 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Finanzas</th>
              <th className="px-4 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Vencimiento</th>
              <th className="px-4 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {reservations.map((res) => {
              const overdue = res.status === ReservationStatus.PENDING && isOverdue(res.date);
              const days = calculateDaysPassed(res.date);
              const totalPrice = getTotalPrice(res);
              const totalPaid = getTotalPaid(res);
              const balance = getBalance(res);
              const totalItemsCount = res.items.reduce((acc, it) => acc + it.quantity, 0);

              return (
                <tr key={res.id} className={`hover:bg-slate-50 transition-colors ${overdue ? 'bg-[#8c3a4b]/5' : ''}`}>
                  <td className="px-4 py-4 align-top">
                    <span className="text-sm font-bold text-slate-400">{res.correlative}</span>
                  </td>
                  <td className="px-4 py-4 align-top whitespace-nowrap">
                    {editingId === res.id ? (
                      <form onSubmit={(e) => saveEdit(e, res)} className="flex flex-col gap-1.5 w-40">
                        <input
                          className="px-2 py-1 text-xs border border-[#2bb297]/30 rounded font-bold bg-[#2bb297]/5"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          placeholder="Nombre"
                          autoFocus
                        />
                        <input
                          className="px-2 py-1 text-xs border border-[#2bb297]/30 rounded font-bold bg-[#2bb297]/5"
                          value={editPhone}
                          onChange={(e) => setEditPhone(e.target.value.replace(/\D/g, '').slice(0, 8))}
                          placeholder="Teléfono"
                        />
                        {editPhoneError && <p className="text-[9px] text-[#8c3a4b] font-bold">{editPhoneError}</p>}
                        <div className="flex gap-1">
                          <button type="submit" className="flex-1 bg-[#2bb297] text-white text-[10px] font-black py-1 rounded">Guardar</button>
                          <button type="button" onClick={() => setEditingId(null)} className="flex-1 bg-slate-200 text-slate-600 text-[10px] font-black py-1 rounded">Cancelar</button>
                        </div>
                      </form>
                    ) : (
                      <div className="flex flex-col">
                        <span className="text-[9px] font-black bg-[#2bb297]/10 text-[#2bb297] px-1.5 py-0.5 rounded-md mb-1 w-fit border border-[#2bb297]/20">{res.customerCode}</span>
                        <div className="font-bold text-slate-900 leading-tight">{res.customerName}</div>
                        <div className="text-xs text-[#2bb297] font-black mt-1">{res.phoneNumber}</div>
                        {res.lastEditedByEmail && (
                          <div className="text-[9px] text-slate-400 font-bold mt-1" title={res.lastEditedAt}>
                            ✎ Corregido por {getDisplayName(res.lastEditedByEmail, aliases)}
                          </div>
                        )}
                        {res.status !== ReservationStatus.DELETED && (
                          <button
                            onClick={() => startEditing(res)}
                            className="text-[9px] text-[#2bb297] hover:text-[#1a8a72] font-black mt-1 text-left uppercase tracking-wide"
                          >
                            Corregir datos
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-4 align-top">
                    <ul className="text-xs space-y-1.5">
                      {res.items.map((item) => (
                        <li key={item.id} className="text-slate-600 flex gap-2 items-center">
                          <span className="bg-slate-100 text-[9px] font-black text-slate-400 px-1 rounded border border-slate-200">{item.code}</span>
                          <span className="font-medium"><span className="font-black">{item.quantity}x</span> {item.name}</span>
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td className="px-4 py-4 align-top text-center">
                    <span className="text-xs bg-slate-100 px-2 py-1 rounded-md font-black text-slate-600">
                      {totalItemsCount}
                    </span>
                  </td>
                  <td className="px-4 py-4 align-top whitespace-nowrap">
                    <div className="text-[10px] text-slate-400 font-bold uppercase">Total: {formatCurrency(totalPrice)}</div>
                    <div className="text-[#1a8a72] text-xs font-bold mt-0.5">Pagado: {formatCurrency(totalPaid)}</div>
                    <div className={`text-sm font-black mt-1 ${balance > 0 ? 'text-[#8c3a4b]' : 'text-[#1a8a72]'}`}>
                      Saldo: {formatCurrency(Math.max(0, balance))}
                    </div>
                  </td>
                  <td className="px-4 py-4 align-top whitespace-nowrap">
                    <div className="text-[10px] text-slate-400 font-bold uppercase">Límite:</div>
                    <div className={`text-xs font-bold ${overdue ? 'text-[#8c3a4b]' : 'text-slate-700'}`}>
                      {formatDate(getDeadlineDate(res.date))}
                    </div>
                    {res.status === ReservationStatus.PENDING && (
                      <div className={`text-[10px] font-black uppercase mt-1.5 px-2 py-0.5 rounded-full inline-block ${overdue ? 'bg-[#8c3a4b] text-white' : 'bg-[#2bb297]/10 text-[#1a8a72]'}`}>
                        {overdue ? 'VENCIDO' : `Faltan ${DEADLINE_DAYS - days} d`}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-4 align-top whitespace-nowrap text-right">
                    <div className="flex flex-col items-end space-y-2">
                      <div className="flex flex-col items-end gap-1.5">
                        {res.status === ReservationStatus.PENDING ? (
                          <>
                            <button
                              onClick={() => { setAddingPaymentId(res.id); setPaymentError(''); }}
                              className="w-full sm:w-auto flex items-center justify-center gap-1.5 bg-[#c9a876]/10 hover:bg-[#c9a876]/15 text-[#8a6a3f] border border-[#c9a876]/25 px-3 py-1.5 rounded-lg text-[11px] font-black transition"
                            >
                              <span>+Q</span> Abonar
                            </button>
                            <button
                              onClick={() => onUpdateStatus(res.id, ReservationStatus.PAID)}
                              className="w-full sm:w-auto flex items-center justify-center gap-1.5 bg-[#2bb297]/5 hover:bg-[#2bb297]/10 text-[#1a8a72] border border-[#2bb297]/20 px-3 py-1.5 rounded-lg text-[11px] font-black transition"
                            >
                              <span>✓</span> Liquidar
                            </button>
                            <button
                              onClick={() => onUpdateStatus(res.id, ReservationStatus.CANCELLED)}
                              className="w-full sm:w-auto flex items-center justify-center gap-1.5 bg-slate-50 hover:bg-slate-100 text-slate-500 border border-slate-200 px-3 py-1.5 rounded-lg text-[11px] font-black transition"
                            >
                              <span>↩</span> Liberar
                            </button>
                          </>
                        ) : (
                          <>
                            <span className={`px-2 py-1 rounded text-[10px] font-black uppercase ${
                              res.status === ReservationStatus.PAID ? 'bg-[#2bb297]/10 text-[#1a8a72]' :
                              res.status === ReservationStatus.DELETED ? 'bg-[#8c3a4b]/15 text-[#6f2d3a]' :
                              'bg-slate-100 text-slate-600'
                            }`}>
                              {res.status === ReservationStatus.PAID ? 'LIQUIDADO' :
                               res.status === ReservationStatus.DELETED ? 'ELIMINADO' : 'LIBERADO'}
                            </span>
                            {res.creditIssued && (
                              <p className="text-[9px] font-black text-[#8a6a3f] mt-1 text-right">
                                +{formatCurrency(res.creditAmount || 0)} saldo generado
                              </p>
                            )}
                          </>
                        )}
                        {res.status === ReservationStatus.DELETED && res.deletedByEmail && (
                          <p className="text-[9px] text-slate-400 font-bold text-right max-w-[140px]">
                            Por {res.deletedByEmail}
                          </p>
                        )}
                        {/* Solo el rol "admin" puede eliminar/archivar registros */}
                        {role === 'admin' && res.status !== ReservationStatus.DELETED && (
                          <button
                            onClick={() => onDelete(res.id)}
                            className="w-full sm:w-auto flex items-center justify-center gap-1.5 text-[#8c3a4b] hover:text-white hover:bg-[#8c3a4b] border border-[#8c3a4b]/30 hover:border-[#8c3a4b] transition px-3 py-1.5 rounded-lg text-[11px] font-black"
                          >
                            <span>🗑</span> Eliminar
                          </button>
                        )}
                      </div>

                      {addingPaymentId === res.id && (
                        <form onSubmit={(e) => handleAddPayment(e, res)} className="flex flex-col items-end gap-1 mt-2">
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              step="0.01"
                              className="w-24 px-2 py-1 text-xs border border-[#c9a876]/40 rounded focus:ring-1 focus:ring-[#c9a876] bg-[#c9a876]/10 font-bold"
                              placeholder="Monto Q"
                              value={paymentAmount}
                              onChange={(e) => setPaymentAmount(e.target.value)}
                              autoFocus
                              required
                            />
                            <button type="submit" className="bg-[#8a6a3f] text-white p-1 rounded text-xs px-2 font-bold">OK</button>
                            <button type="button" onClick={() => { setAddingPaymentId(null); setPaymentError(''); }} className="text-slate-400 p-1 text-xs px-2">X</button>
                          </div>
                          {paymentError && <p className="text-[10px] text-[#8c3a4b] font-bold max-w-[160px] text-right">{paymentError}</p>}
                        </form>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
