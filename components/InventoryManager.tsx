import React, { useState, useRef } from 'react';
import { InventoryItem } from '../types';
import { generateId, formatCurrency } from '../utils';
import * as XLSX from 'xlsx';

interface InventoryManagerProps {
  items: InventoryItem[];
  onUpdate: (items: InventoryItem[]) => void;
}

export const InventoryManager: React.FC<InventoryManagerProps> = ({ items, onUpdate }) => {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [price, setPrice] = useState('');
  const [formError, setFormError] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedPrice = parseFloat(price);

    // Validación: precio debe ser un número válido mayor a 0
    if (!name || !code || isNaN(parsedPrice) || parsedPrice <= 0) {
      setFormError('Revisa los datos: el precio debe ser un número mayor a 0.');
      return;
    }
    setFormError('');

    const newItem: InventoryItem = {
      id: generateId(),
      name,
      code: code.toUpperCase(),
      basePrice: parsedPrice
    };

    onUpdate([...items, newItem]);
    setName('');
    setCode('');
    setPrice('');
  };

  const handleExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json(ws) as any[];

      const newItems: InventoryItem[] = data
        .map((row: any) => {
          const rawPrice = row.Precio ?? row.price ?? row.costo;
          const parsedPrice = parseFloat(rawPrice);
          return {
            id: generateId(),
            name: row.Nombre || row.name || row.item || 'S/N',
            code: (row.Código || row.code || row.id || generateId().substring(0, 4)).toString().toUpperCase(),
            basePrice: parsedPrice
          };
        })
        // Filtra filas sin nombre válido o con precio inválido (evita romper cálculos por NaN)
        .filter(item => item.name !== 'S/N' && !isNaN(item.basePrice) && item.basePrice > 0);

      const skipped = data.length - newItems.length;

      if (newItems.length > 0) {
        onUpdate([...items, ...newItems]);
      }
      if (skipped > 0) {
        alert(`Se importaron ${newItems.length} prendas. ${skipped} fila(s) se omitieron por datos inválidos (nombre o precio faltante/incorrecto).`);
      } else if (newItems.length > 0) {
        alert(`Se han importado ${newItems.length} prendas exitosamente.`);
      } else {
        alert('No se importó ninguna prenda. Revisa que el Excel tenga columnas de Nombre, Código y Precio.');
      }
    };
    reader.readAsBinaryString(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const remove = (id: string) => {
    onUpdate(items.filter(i => i.id !== id));
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="w-full mb-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium py-2 rounded-lg transition text-sm flex items-center justify-center gap-2 border border-slate-300"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
        Gestionar Base de Datos de Prendas
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <h2 className="text-xl font-bold text-slate-800">Catálogo de Prendas</h2>
          <div className="flex gap-2">
            <input
              type="file"
              accept=".xlsx, .xls, .csv"
              className="hidden"
              ref={fileInputRef}
              onChange={handleExcelUpload}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="bg-emerald-600 text-white px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-emerald-700 transition flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Importar Excel
            </button>
            <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-slate-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          <form onSubmit={handleAdd} className="space-y-4 mb-6 bg-blue-50 p-4 rounded-xl border border-blue-100">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
               <div>
                <label className="block text-[10px] font-bold text-blue-600 uppercase mb-1">Código</label>
                <input
                  type="text"
                  placeholder="Ej. B001"
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                  value={code}
                  onChange={e => setCode(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-blue-600 uppercase mb-1">Nombre</label>
                <input
                  type="text"
                  placeholder="Ej. Blusa Seda"
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-[10px] font-bold text-blue-600 uppercase mb-1">Precio Unitario (Q)</label>
                <input
                  type="number"
                  placeholder="0.00"
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                  value={price}
                  onChange={e => setPrice(e.target.value)}
                  required
                />
              </div>
              <button className="self-end bg-blue-600 text-white rounded-lg px-6 py-2 text-sm font-bold hover:bg-blue-700 transition">
                Añadir Prenda
              </button>
            </div>
            {formError && <p className="text-[11px] text-rose-600 font-bold">{formError}</p>}
          </form>

          <div className="space-y-2">
            {items.length === 0 ? (
              <p className="text-center text-slate-400 py-8">No hay prendas registradas en la base de datos.</p>
            ) : (
              items.map(item => (
                <div key={item.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-slate-50 transition-colors">
                  <div className="flex gap-4 items-center">
                    <span className="bg-slate-100 text-slate-500 text-[10px] font-black px-2 py-0.5 rounded border border-slate-200">{item.code}</span>
                    <div>
                      <span className="font-semibold text-slate-700">{item.name}</span>
                      <p className="text-xs text-blue-600 font-bold">{formatCurrency(item.basePrice)}</p>
                    </div>
                  </div>
                  <button onClick={() => remove(item.id)} className="text-rose-400 hover:text-rose-600 p-2 rounded-full hover:bg-rose-50 transition">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="p-4 border-t bg-slate-50 flex justify-end">
          <button
            onClick={() => setIsOpen(false)}
            className="px-6 py-2 bg-slate-800 text-white rounded-lg font-bold"
          >
            Finalizar
          </button>
        </div>
      </div>
    </div>
  );
};
