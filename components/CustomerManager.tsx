import React, { useState } from 'react';
import { Customer, CreditTransaction, UserRole } from '../types';
import { formatCurrency, formatDate, getCustomerCredit } from '../utils';

interface CustomerManagerProps {
  customers: Customer[];
  creditLedger: CreditTransaction[];
  role: UserRole | null;
  onUpdate: (id: string, updates: { name?: string; phone?: string }) => void;
  onDelete: (id: string) => void;
  onAdjustCredit: (customerId: string, delta: number, note: string) => void;
}

const CREDIT_TYPE_LABELS: Record<string, string> = {
  EARNED_EXPIRED_RESERVATION: 'Apartado vencido liberado',
  USED_IN_SALE: 'Usado en una venta',
  REFUND_CANCELLED_SALE: 'Venta anulada (se devolvió)',
  MANUAL_ADJUSTMENT: 'Ajuste manual',
};

export const CustomerManager: React.FC<CustomerManagerProps> = ({ customers, creditLedger, role, onUpdate, onDelete, onAdjustCredit }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editError, setEditError] = useState('');
  const [ledgerForId, setLedgerForId] = useState<string | null>(null);
  const [adjustingId, setAdjustingId] = useState<string | null>(null);
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustNote, setAdjustNote] = useState('');
  const [adjustError, setAdjustError] = useState('');

  const sorted = [...customers].sort((a, b) => a.name.localeCompare(b.name, 'es'));

  const startEdit = (c: Customer) => {
    setEditingId(c.id);
    setEditName(c.name);
    setEditPhone(c.phone);
    setEditError('');
  };

  const saveEdit = (id: string) => {
    const cleanPhone = editPhone.replace(/\D/g, '').slice(0, 8);
    if (!editName.trim()) {
      setEditError('El nombre no puede quedar vacío.');
      return;
    }
    if (cleanPhone.length !== 8) {
      setEditError('El teléfono debe tener exactamente 8 dígitos.');
      return;
    }
    onUpdate(id, { name: editName.trim(), phone: cleanPhone });
    setEditingId(null);
  };

  const startAdjust = (id: string) => {
    setAdjustingId(id);
    setAdjustAmount('');
    setAdjustNote('');
    setAdjustError('');
  };

  const submitAdjust = (customer: Customer) => {
    const value = parseFloat(adjustAmount);
    if (isNaN(value) || value === 0) {
      setAdjustError('Ingresa un monto distinto de 0 (positivo para abonar, negativo para restar).');
      return;
    }
    if (getCustomerCredit(customer) + value < -0.01) {
      setAdjustError('Ese ajuste dejaría el saldo en negativo.');
      return;
    }
    onAdjustCredit(customer.id, value, adjustNote.trim() || 'Ajuste manual');
    setAdjustingId(null);
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="w-full mb-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium py-2 rounded-lg transition text-sm flex items-center justify-center gap-2 border border-slate-300"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4 4 4 0 004 4zm6 0a4 4 0 10-4-4" />
        </svg>
        Gestionar Clientes
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] overflow-hidden flex flex-col">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Libreta de Clientes</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase">Datos, saldo a favor y bitácora</p>
          </div>
          <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>

        <div className="p-5 overflow-y-auto flex-1">
          {sorted.length === 0 ? (
            <p className="text-center text-slate-400 py-8 text-sm">
              Aún no hay clientes registrados. Se agregan solos al crear el primer apartado de cada persona.
            </p>
          ) : (
            <div className="space-y-2">
              {sorted.map((c) => {
                const credit = getCustomerCredit(c);
                const history = creditLedger.filter((l) => l.customerId === c.id);
                return (
                  <div key={c.id} className="p-3 border rounded-lg hover:bg-slate-50 transition-colors">
                    {editingId === c.id ? (
                      <div className="space-y-2">
                        <input
                          className="w-full px-3 py-2 border border-[#2bb297]/30 rounded-lg text-sm bg-[#2bb297]/5"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          placeholder="Nombre"
                        />
                        <input
                          className="w-full px-3 py-2 border border-[#2bb297]/30 rounded-lg text-sm bg-[#2bb297]/5"
                          value={editPhone}
                          onChange={(e) => setEditPhone(e.target.value.replace(/\D/g, '').slice(0, 8))}
                          placeholder="Teléfono (8 dígitos)"
                        />
                        {editError && <p className="text-[11px] text-[#8c3a4b] font-bold">{editError}</p>}
                        <div className="flex gap-2">
                          <button onClick={() => saveEdit(c.id)} className="flex-1 bg-[#2bb297] text-white text-xs font-bold py-1.5 rounded-lg">Guardar</button>
                          <button onClick={() => setEditingId(null)} className="flex-1 bg-slate-200 text-slate-600 text-xs font-bold py-1.5 rounded-lg">Cancelar</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between">
                          <div className="flex gap-3 items-center">
                            <span className="bg-slate-100 text-slate-500 text-[10px] font-black px-2 py-0.5 rounded border border-slate-200">{c.code}</span>
                            <div>
                              <span className="font-semibold text-slate-700 text-sm">{c.name}</span>
                              <p className="text-xs text-[#2bb297] font-bold">{c.phone}</p>
                            </div>
                          </div>
                          <div className="flex gap-1">
                            <button onClick={() => startEdit(c)} className="text-[#2bb297] hover:text-[#1a8a72] p-2 rounded-full hover:bg-[#2bb297]/5 transition text-xs font-bold">
                              Editar
                            </button>
                            <button
                              onClick={() => { if (confirm(`¿Quitar a ${c.name} de la libreta de clientes? Sus apartados anteriores no se verán afectados.`)) onDelete(c.id); }}
                              className="text-[#8c3a4b]/60 hover:text-[#8c3a4b] p-2 rounded-full hover:bg-[#8c3a4b]/10 transition text-xs font-bold"
                            >
                              Quitar
                            </button>
                          </div>
                        </div>

                        <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] font-black text-slate-400 uppercase">Saldo a favor:</span>
                            <span className={`text-sm font-black ${credit > 0 ? 'text-[#8a6a3f]' : 'text-slate-400'}`}>{formatCurrency(credit)}</span>
                            {history.length > 0 && (
                              <button
                                onClick={() => setLedgerForId(ledgerForId === c.id ? null : c.id)}
                                className="text-[9px] font-black text-slate-400 hover:text-slate-600 underline"
                              >
                                {ledgerForId === c.id ? 'ocultar' : 'ver movimientos'}
                              </button>
                            )}
                          </div>
                          {role === 'admin' && (
                            <button onClick={() => startAdjust(c.id)} className="text-[9px] font-black text-[#c9a876] hover:text-[#8a6a3f] uppercase">
                              Ajustar saldo
                            </button>
                          )}
                        </div>

                        {adjustingId === c.id && (
                          <div className="mt-2 p-2 bg-[#c9a876]/10 border border-[#c9a876]/30 rounded-lg space-y-2">
                            <input
                              type="number"
                              step="0.01"
                              className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs"
                              placeholder="Monto (+abona, -resta)"
                              value={adjustAmount}
                              onChange={(e) => setAdjustAmount(e.target.value)}
                            />
                            <input
                              type="text"
                              className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs"
                              placeholder="Motivo del ajuste"
                              value={adjustNote}
                              onChange={(e) => setAdjustNote(e.target.value)}
                            />
                            {adjustError && <p className="text-[10px] text-[#8c3a4b] font-bold">{adjustError}</p>}
                            <div className="flex gap-2">
                              <button onClick={() => submitAdjust(c)} className="flex-1 bg-[#c9a876] text-white text-xs font-bold py-1 rounded-lg">Guardar ajuste</button>
                              <button onClick={() => setAdjustingId(null)} className="flex-1 bg-slate-200 text-slate-600 text-xs font-bold py-1 rounded-lg">Cancelar</button>
                            </div>
                          </div>
                        )}

                        {ledgerForId === c.id && history.length > 0 && (
                          <ul className="mt-2 space-y-1">
                            {history.map((h) => (
                              <li key={h.id} className="flex items-center justify-between text-[10px] px-2 py-1 bg-slate-50 rounded-lg">
                                <span className="text-slate-500 font-bold">{CREDIT_TYPE_LABELS[h.type] || h.type} · {formatDate(h.date)}</span>
                                <span className={`font-black ${h.amount >= 0 ? 'text-[#1a8a72]' : 'text-[#8c3a4b]'}`}>
                                  {h.amount >= 0 ? '+' : ''}{formatCurrency(h.amount)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="p-4 border-t bg-slate-50 flex justify-end">
          <button onClick={() => setIsOpen(false)} className="px-5 py-2 bg-slate-800 text-white rounded-lg font-bold text-sm">Finalizar</button>
        </div>
      </div>
    </div>
  );
};
