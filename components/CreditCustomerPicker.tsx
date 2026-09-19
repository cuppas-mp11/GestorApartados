import React, { useState } from 'react';
import { Customer } from '../types';
import { formatCurrency, getCustomersWithCredit, getCustomerCredit } from '../utils';

interface CreditCustomerPickerProps {
  customers: Customer[];
  selectedCustomerId: string;
  onSelect: (customer: Customer) => void;
  onClose?: () => void;
}

// Panel lateral/desplegable para elegir con qué clienta (de las que tienen
// saldo a favor disponible) se está pagando una venta.
export const CreditCustomerPicker: React.FC<CreditCustomerPickerProps> = ({ customers, selectedCustomerId, onSelect, onClose }) => {
  const [search, setSearch] = useState('');
  const withCredit = getCustomersWithCredit(customers);
  const filtered = withCredit.filter(
    (c) => c.name.toLowerCase().includes(search.toLowerCase()) || c.code.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="bg-white border border-[#c9a876]/40 rounded-xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] font-black text-[#8a6a3f] uppercase tracking-widest">Clientas con Saldo a Favor</p>
        {onClose && (
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg leading-none">×</button>
        )}
      </div>

      {withCredit.length === 0 ? (
        <p className="text-xs text-slate-400 font-medium py-4 text-center">Ninguna clienta tiene saldo a favor disponible todavía.</p>
      ) : (
        <>
          <input
            type="text"
            placeholder="Buscar por nombre o código..."
            className="w-full px-3 py-2 mb-2 border border-slate-200 rounded-lg text-xs font-medium focus:ring-2 focus:ring-[#c9a876]"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {filtered.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-3">Sin resultados.</p>
            ) : (
              filtered.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onSelect(c)}
                  className={`w-full flex items-center justify-between p-2.5 rounded-lg border text-left transition ${
                    selectedCustomerId === c.id
                      ? 'bg-[#c9a876]/15 border-[#c9a876]'
                      : 'bg-slate-50 border-slate-100 hover:border-[#c9a876]/40'
                  }`}
                >
                  <div>
                    <span className="text-[8px] font-black bg-white text-slate-400 px-1 rounded border border-slate-200 mr-1">{c.code}</span>
                    <span className="text-xs font-bold text-slate-800">{c.name}</span>
                  </div>
                  <span className="text-xs font-black text-[#8a6a3f]">{formatCurrency(getCustomerCredit(c))}</span>
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
};
