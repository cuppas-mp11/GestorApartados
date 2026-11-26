import React, { useState } from 'react';
import { downloadStyledExcel, Cell } from '../excelStyle';
import { loadLogoDataUrl, PDF_LOGO_SIZE, PDF_TEXT_X_WITH_LOGO } from '../pdfLogo';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Reservation, ReservationStatus } from '../types';
import { formatCurrency, formatDate, getTotalPrice, getTotalPaid, getBalance, getLocalDateStr } from '../utils';

interface ExportMenuProps {
  reservations: Reservation[];
}

export const ExportMenu: React.FC<ExportMenuProps> = ({ reservations }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [filterType, setFilterType] = useState<'PENDING' | 'MONTH' | 'ALL'>('PENDING');
  const [format, setFormat] = useState<'EXCEL' | 'PDF'>('EXCEL');
  const [selectedMonth, setSelectedMonth] = useState(getLocalDateStr().substring(0, 7));

  const getFilteredData = () => {
    switch (filterType) {
      case 'PENDING':
        return reservations.filter(r => r.status === ReservationStatus.PENDING);
      case 'MONTH':
        return reservations.filter(r => getLocalDateStr(r.date).startsWith(selectedMonth));
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
      void exportToExcel(data);
    } else {
      void exportToPDF(data);
    }
    setIsOpen(false);
  };

  const exportToExcel = async (data: Reservation[]) => {
    const fileName = `Reporte_Apartados_${filterType}_${getLocalDateStr()}.xlsx`;
    const statusLabel = (r: Reservation) =>
      r.status === ReservationStatus.PENDING ? 'PENDIENTE' : r.status === ReservationStatus.PAID ? 'LIQUIDADO' : 'LIBERADO';

    const rows: Cell[][] = data.map((res) => [
      res.correlative,
      res.customerCode,
      res.customerName,
      res.phoneNumber,
      formatDate(res.date),
      res.items.map((it) => `${it.code} (${it.quantity})`).join(', '),
      statusLabel(res),
      getTotalPrice(res),
      getTotalPaid(res),
      getBalance(res),
    ]);

    await downloadStyledExcel(fileName, [
      {
        name: 'Apartados',
        title: `Reporte de Apartados — ${filterType === 'PENDING' ? 'Pendientes' : filterType === 'MONTH' ? `Mes ${selectedMonth}` : 'Historial completo'}`,
        widths: [11, 14, 26, 13, 22, 34, 14, 14, 14, 14],
        landscape: true,
        freezeHeader: true,
        sections: [
          {
            columns: [
              { header: 'Correlativo', type: 'center' },
              { header: 'Código', type: 'center' },
              { header: 'Cliente' },
              { header: 'Teléfono', type: 'center' },
              { header: 'Fecha' },
              { header: 'Prendas' },
              { header: 'Estado', type: 'center' },
              { header: 'Total', type: 'money' },
              { header: 'Pagado', type: 'money' },
              { header: 'Saldo', type: 'money' },
            ],
            rows,
            total: ['', '', `${data.length} apartado(s)`, '', '', '', '', data.reduce((a, r) => a + getTotalPrice(r), 0), data.reduce((a, r) => a + getTotalPaid(r), 0), data.reduce((a, r) => a + getBalance(r), 0)],
          },
        ],
      },
    ]);
  };

  const exportToPDF = async (data: Reservation[]) => {
    const doc = new jsPDF();
    const logo = await loadLogoDataUrl();
    const title = `Reporte de Apartados - ${filterType === 'PENDING' ? 'Pendientes' : filterType === 'MONTH' ? `Mes ${selectedMonth}` : 'Historial Completo'}`;

    if (logo) doc.addImage(logo, 'PNG', 14, 8, PDF_LOGO_SIZE, PDF_LOGO_SIZE);
    const textX = logo ? PDF_TEXT_X_WITH_LOGO : 14;
    doc.setFontSize(18);
    doc.text('Vestimenta GT', textX, 15);
    doc.setFontSize(12);
    doc.text(title, textX, 22);
    doc.setFontSize(9);
    doc.text(`Generado: ${new Date().toLocaleString('es-GT')}`, textX, 28);

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
                      className={`text-left px-3 py-2 rounded-lg text-xs font-bold transition ${filterType === type ? 'bg-[#2bb297]/5 text-[#2bb297] border border-[#2bb297]/10' : 'text-slate-600 hover:bg-slate-50'}`}
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
                    className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold border transition ${format === 'EXCEL' ? 'bg-[#2bb297]/5 text-[#1a8a72] border-[#2bb297]/20' : 'text-slate-600 border-transparent hover:bg-slate-50'}`}
                  >
                    EXCEL (.xlsx)
                  </button>
                  <button
                    onClick={() => setFormat('PDF')}
                    className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold border transition ${format === 'PDF' ? 'bg-[#8c3a4b]/10 text-[#8c3a4b] border-[#8c3a4b]/30' : 'text-slate-600 border-transparent hover:bg-slate-50'}`}
                  >
                    PDF (.pdf)
                  </button>
                </div>
              </div>

              <button
                onClick={handleExport}
                className="w-full bg-[#2bb297] text-white py-3 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-[#1a8a72] transition shadow-lg shadow-[#2bb297]/10"
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
