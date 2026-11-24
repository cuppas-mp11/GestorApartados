import React, { useMemo, useState } from 'react';
import { InventoryItem, Lot, Reservation } from '../types';
import { formatCurrency, getStockForCode, getReservedForCode } from '../utils';

interface InventoryCatalogTableProps {
  items: InventoryItem[];
  lots: Lot[];
  reservations: Reservation[];
}

// Catálogo completo, siempre visible, ordenado por código, con buscador —
// para consultar rápido cuánto hay de una prenda sin tener que abrir el
// cuadro de "Gestionar Base de Datos de Prendas" (ese sigue siendo para
// agregar, editar o eliminar; esta tabla es solo de consulta).
export const InventoryCatalogTable: React.FC<InventoryCatalogTableProps> = ({ items, lots, reservations }) => {
  const [search, setSearch] = useState('');

  const stockFor = (code: string) => getStockForCode(code, lots);

  const sortedItems = useMemo(
    () => [...items].sort((a, b) => a.code.localeCompare(b.code)),
    [items]
  );

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sortedItems;
    return sortedItems.filter(
      (i) =>
        i.code.toLowerCase().includes(q) ||
        i.name.toLowerCase().includes(q) ||
        (i.category || '').toLowerCase().includes(q)
    );
  }, [sortedItems, search]);

  return (
    <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Catálogo completo</p>
        <span className="text-[10px] font-bold text-slate-400">{filteredItems.length} de {items.length} prenda(s)</span>
      </div>

      <div className="relative mb-3">
        <svg className="w-4 h-4 text-slate-300 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
        </svg>
        <input
          type="text"
          placeholder="Buscar por código, nombre o categoría..."
          className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-lg text-sm font-bold focus:ring-2 focus:ring-[#2bb297]"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {filteredItems.length === 0 ? (
        <p className="text-center text-slate-400 py-8 text-sm">
          {items.length === 0 ? 'Aún no hay prendas registradas.' : 'Ninguna prenda coincide con esa búsqueda.'}
        </p>
      ) : (
        <div className="overflow-x-auto -mx-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                <th className="text-left px-5 py-2">Código</th>
                <th className="text-left px-2 py-2">Nombre</th>
                <th className="text-left px-2 py-2 hidden sm:table-cell">Categoría</th>
                <th className="text-right px-2 py-2">Precio</th>
                <th className="text-right px-5 py-2">Disponible</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => {
                const stock = stockFor(item.code);
                const reserved = getReservedForCode(item.code, reservations);
                return (
                  <tr key={item.id} className="border-b border-slate-50 hover:bg-slate-50 transition">
                    <td className="px-5 py-2.5">
                      <span className="bg-slate-100 text-slate-500 text-[10px] font-black px-2 py-0.5 rounded border border-slate-200">{item.code}</span>
                    </td>
                    <td className="px-2 py-2.5 font-bold text-slate-700">{item.name}</td>
                    <td className="px-2 py-2.5 hidden sm:table-cell text-[10px] text-slate-400 font-bold uppercase">{item.category || '—'}</td>
                    <td className="px-2 py-2.5 text-right font-bold text-[#1a8a72]">{formatCurrency(item.basePrice)}</td>
                    <td className="px-5 py-2.5 text-right">
                      <span className={`font-black ${stock > 0 ? 'text-[#1a8a72]' : 'text-slate-300'}`}>{stock}</span>
                      {reserved > 0 && (
                        <span className="block text-[9px] text-[#c9a876] font-bold">{reserved} apartada(s)</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
