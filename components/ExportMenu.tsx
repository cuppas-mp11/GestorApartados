import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Reservation, ReservationStatus } from '../types';
import { formatCurrency, formatDate, getTotalPrice, getTotalPaid, getBalance } from '../utils';

interface ExportMenuProps {
  reservations: Reservation[];
}

export const ExportMenu: React.FC<ExportMenuProps> = ({ reservations }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [filterType, setFilterType] = useState<'PENDING' | 'MONTH' | 'ALL'>('PENDING');
  const [format, setFormat] = useState<'EXCEL' | 'PDF'>('EXCEL');
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().substring(0, 7));

  const getFilteredData = () => {
    switch (filterType) {
      case 'PENDING':
        return reservations.filter(r => r.status === ReservationStatus.PENDING);
      case 'MONTH':
        return reservations.filter(r => r.date.startsWith(selectedMonth));
      case 'ALL':
      default:
        return reservations;
    }
  };

  const handleExport = () => {
    const data = getFilteredData();
    if (data.length === 0) {
      alert('No hay datos para exportar con los filtros seleccionados.');
      return;
    }

    if (format === 'EXCEL') {
      exportToExcel(data);
    } else {
      exportToPDF(data);
    }
    setIsOpen(false);
  };

  const exportToExcel = (data: Reservation[]) => {
    const fileName = `Reporte_Apartados_${filterType}_${new Date().toISOString().split('T')[0]}.xlsx`;

    const rows = data.map(res => {
      const total = getTotalPrice(res);
      const paid = getTotalPaid(res);
      const balance = getBalance(res);
      const itemsList = res.items.map(it => `${it.code} (${it.quantity})`).join(', ');

      return {
        'Correlativo': res.correlative,
        'Código Cliente': res.customerCode,
        'Nombre Cliente': res.customerName,
        'Teléfono': res.phoneNumber,
        'Fecha': formatDate(res.date),
        'Prendas': itemsList,
        'Estado': res.status === ReservationStatus.PENDING ? 'PENDIENTE' :
                  res.status === ReservationStatus.PAID ? 'LIQUIDADO' : 'LIBERADO',
        'Total (Q)': total,
        'Pagado (Q)': paid,
        'Saldo (Q)': balance
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Apartados');
    XLSX.writeFile(workbook, fileName);
  };

  const exportToPDF = (data: Reservation[]) => {
    const doc = new jsPDF();
    const title = `Reporte de Apartados - ${filterType === 'PENDING' ? 'Pendientes' : filterType === 'MONTH' ? `Mes ${selectedMonth}` : 'Historial Completo'}`;

    doc.setFontSize(18);
    doc.text('Boutique & Moda GT', 14, 15);
    doc.setFontSize(12);
    doc.text(title, 14, 25);
    doc.text(`Fecha de generación: ${new Date().toLocaleDateString()}`, 14, 32);

    const tableHeaders = [['#', 'Cliente', 'Fecha', 'Prendas', 'Total', 'Pagado', 'Saldo']];
    const tableRows = data.map(res => {
      const total = getTotalPrice(res);
      const paid = getTotalPaid(res);
      const balance = getBalance(res);
      const itemsList = res.items.map(it => `${it.code} (${it.quantity})`).join('\n');

      return [
        res.correlative,
        `${res.customerCode}\n${res.customerName}`,
        formatDate(res.date),
        itemsList,
        formatCurrency(total),
        formatCurrency(paid),
        formatCurrency(balance)
      ];
    });

    autoTable(doc, {
      startY: 40,
      head: tableHeaders,
      body: tableRows,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [37, 99, 235], textColor: 255 },
      columnStyles: {
        0: { cellWidth: 10 },
        3: { cellWidth: 40 },
        4: { halign: 'right' },
        5: { halign: 'right' },
        6: { halign: 'right' }
      }
    });

    doc.save(`Reporte_Apartados_${filterType}.pdf`);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-700 transition shadow-lg"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        Exportar Datos
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)}></div>
          <div className="absolute right-0 mt-2 w-72 bg-white rounded-2xl shadow-2xl border border-slate-100 z-50 p-4">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Configurar Exportación</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-[9px] font-black text-slate-500 uppercase mb-1">Información</label>
                <div className="grid grid-cols-1 gap-1">
                  {(['PENDING', 'MONTH', 'ALL'] as const).map(type => (
                    <button
                      key={type}
                      onClick={() => setFilterType(type)}
                      className={`text-left px-3 py-2 rounded-lg text-xs font-bold transition ${filterType === type ? 'bg-blue-50 text-blue-600 border border-blue-100' : 'text-slate-600 hover:bg-slate-50'}`}
                    >
                      {type === 'PENDING' ? 'Solo Pendientes' : type === 'MONTH' ? 'Por Mes' : 'Historial Completo'}
                    </button>
                  ))}
                </div>
              </div>

              {filterType === 'MONTH' && (
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                />
              )}

              <div>
                <label className="block text-[9px] font-black text-slate-500 uppercase mb-1">Formato</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setFormat('EXCEL')}
                    className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold border transition ${format === 'EXCEL' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'text-slate-600 border-transparent hover:bg-slate-50'}`}
                  >
                    EXCEL (.xlsx)
                  </button>
                  <button
                    onClick={() => setFormat('PDF')}
                    className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold border transition ${format === 'PDF' ? 'bg-rose-50 text-rose-600 border-rose-200' : 'text-slate-600 border-transparent hover:bg-slate-50'}`}
                  >
                    PDF (.pdf)
                  </button>
                </div>
              </div>

              <button
                onClick={handleExport}
                className="w-full bg-blue-600 text-white py-3 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-blue-700 transition shadow-lg shadow-blue-100"
              >
                Generar Archivo
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
