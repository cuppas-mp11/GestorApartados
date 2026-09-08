import React, { useState } from 'react';
import { Customer } from '../types';

interface CustomerManagerProps {
  customers: Customer[];
  onUpdate: (id: string, updates: { name?: string; phone?: string }) => void;
  onDelete: (id: string) => void;
}

export const CustomerManager: React.FC<CustomerManagerProps> = ({ customers, onUpdate, onDelete }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editError, setEditError] = useState('');

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
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-hidden flex flex-col">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Libreta de Clientes</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase">Corrige nombre o teléfono si cambian</p>
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
              {sorted.map((c) => (
                <div key={c.id} className="p-3 border rounded-lg hover:bg-slate-50 transition-colors">
                  {editingId === c.id ? (
                    <div className="space-y-2">
                      <input
                        className="w-full px-3 py-2 border border-blue-300 rounded-lg text-sm bg-blue-50"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="Nombre"
                      />
                      <input
                        className="w-full px-3 py-2 border border-blue-300 rounded-lg text-sm bg-blue-50"
                        value={editPhone}
                        onChange={(e) => setEditPhone(e.target.value.replace(/\D/g, '').slice(0, 8))}
                        placeholder="Teléfono (8 dígitos)"
                      />
                      {editError && <p className="text-[11px] text-rose-600 font-bold">{editError}</p>}
                      <div className="flex gap-2">
                        <button onClick={() => saveEdit(c.id)} className="flex-1 bg-blue-600 text-white text-xs font-bold py-1.5 rounded-lg">Guardar</button>
                        <button onClick={() => setEditingId(null)} className="flex-1 bg-slate-200 text-slate-600 text-xs font-bold py-1.5 rounded-lg">Cancelar</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="flex gap-3 items-center">
                        <span className="bg-slate-100 text-slate-500 text-[10px] font-black px-2 py-0.5 rounded border border-slate-200">{c.code}</span>
                        <div>
                          <span className="font-semibold text-slate-700 text-sm">{c.name}</span>
                          <p className="text-xs text-blue-600 font-bold">{c.phone}</p>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => startEdit(c)} className="text-blue-500 hover:text-blue-700 p-2 rounded-full hover:bg-blue-50 transition text-xs font-bold">
                          Editar
                        </button>
                        <button
                          onClick={() => { if (confirm(`¿Quitar a ${c.name} de la libreta de clientes? Sus apartados anteriores no se verán afectados.`)) onDelete(c.id); }}
                          className="text-rose-400 hover:text-rose-600 p-2 rounded-full hover:bg-rose-50 transition text-xs font-bold"
                        >
                          Quitar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
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
