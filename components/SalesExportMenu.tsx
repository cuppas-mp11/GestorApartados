import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Sale, SaleStatus, PaymentMethod } from '../types';
import { formatCurrency, formatDate, getSaleTotal, getSaleItemsCount, paymentMethodLabel, PAYMENT_METHODS, getDailySequenceMap, formatSaleItemLabel } from '../utils';

interface SalesExportMenuProps {
  sales: Sale[];
}

const todayStr = () => new Date().toISOString().split('T')[0];

export const SalesExportMenu: React.FC<SalesExportMenuProps> = ({ sales }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<'DAY' | 'RANGE'>('DAY');
  const [day, setDay] = useState(todayStr());
  const [rangeStart, setRangeStart] = useState(todayStr());
  const [rangeEnd, setRangeEnd] = useState(todayStr());
  const [format, setFormat] = useState<'PDF' | 'EXCEL'>('PDF');

  const salesForDay = (dateStr: string) =>
    sales.filter((s) => s.date.startsWith(dateStr)).sort((a, b) => a.correlative - b.correlative);

  const dateListBetween = (start: string, end: string): string[] => {
    const dates: string[] = [];
    let cur = new Date(start + 'T00:00:00');
    const last = new Date(end + 'T00:00:00');
    while (cur <= last) {
      dates.push(cur.toISOString().split('T')[0]);
      cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1);
    }
    return dates;
  };

  const methodTotal = (daySales: Sale[], method: PaymentMethod) =>
    daySales
      .filter((s) => s.status === SaleStatus.COMPLETED)
      .reduce((acc, s) => acc + s.payments.filter((p) => p.method === method).reduce((a, p) => a + p.amount, 0), 0);

  const handleExport = () => {
    if (mode === 'DAY') {
      const data = salesForDay(day);
      if (data.length === 0) {
        alert('No hay ventas registradas ese día.');
        return;
      }
      if (format === 'PDF') exportDayToPDF(data);
      else exportDayToExcel(data);
    } else {
      if (rangeEnd < rangeStart) {
        alert('La fecha final no puede ser anterior a la inicial.');
        return;
      }
      exportRangeToExcel();
    }
    setIsOpen(false);
  };

  const exportDayToPDF = (data: Sale[]) => {
    const doc = new jsPDF();
    const completed = data.filter((s) => s.status === SaleStatus.COMPLETED);
    const totalDia = completed.reduce((acc, s) => acc + getSaleTotal(s), 0);
    const itemsDia = completed.reduce((acc, s) => acc + getSaleItemsCount(s), 0);
    const dailySeq = getDailySequenceMap(data);

    doc.setFontSize(18);
    doc.text('Vestimenta GT', 14, 15);
    doc.setFontSize(12);
    doc.text(`Reporte de Ventas — ${formatDate(day)}`, 14, 25);
    doc.setFontSize(9);
    doc.text(`Generado: ${new Date().toLocaleString('es-GT')}`, 14, 31);

    const summaryRows = PAYMENT_METHODS
      .map((m) => [m.label, formatCurrency(methodTotal(data, m.value))])
      .filter((row) => row[1] !== formatCurrency(0));
    autoTable(doc, {
      startY: 36,
      head: [['Método de pago', 'Total']],
      body: summaryRows.length > 0 ? summaryRows : [['Sin ventas completadas', formatCurrency(0)]],
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [43, 178, 151], textColor: 255 },
      columnStyles: { 1: { halign: 'right' } },
    });

    const afterSummaryY = (doc as any).lastAutoTable.finalY + 6;

    const tableHeaders = [['#', 'Prenda(s)', 'Método(s)', 'Descuento', 'Total', 'Vendió']];
    const tableRows = data.map((s) => {
      const cancelled = s.status === SaleStatus.CANCELLED;
      const itemsList = s.items.map((it) => formatSaleItemLabel(it)).join('\n');
      const paymentsList = s.payments.map((p) => `${paymentMethodLabel(p.method)}: ${formatCurrency(p.amount)}`).join('\n');
      const discount = s.items.reduce((acc, it) => acc + (it.discount || 0), 0);
      return [
        `${dailySeq.get(s.id)}${cancelled ? ' (ANULADA)' : ''}`,
        itemsList,
        paymentsList,
        discount > 0 ? formatCurrency(discount) : '—',
        formatCurrency(getSaleTotal(s)),
        s.soldByEmail,
      ];
    });

    autoTable(doc, {
      startY: afterSummaryY,
      head: tableHeaders,
      body: tableRows,
      theme: 'grid',
      styles: { fontSize: 7.5, cellPadding: 2 },
      headStyles: { fillColor: [43, 178, 151], textColor: 255 },
      columnStyles: { 4: { halign: 'right' } },
    });

    const finalY = (doc as any).lastAutoTable.finalY + 8;
    doc.setFontSize(11);
    doc.text(`Total del día: ${formatCurrency(totalDia)}  ·  ${itemsDia} prenda(s)  ·  ${completed.length} venta(s)`, 14, finalY);

    doc.save(`Reporte_Ventas_${day}.pdf`);
  };

  const exportDayToExcel = (data: Sale[]) => {
    const dailySeq = getDailySequenceMap(data);
    const rows = data.map((s) => {
      const discount = s.items.reduce((acc, it) => acc + (it.discount || 0), 0);
      return {
        '#': dailySeq.get(s.id),
        'Hora': new Date(s.date).toLocaleTimeString('es-GT'),
        'Prendas': s.items.map((it) => formatSaleItemLabel(it)).join(', '),
        'Método(s) de pago': s.payments.map((p) => `${paymentMethodLabel(p.method)}: ${formatCurrency(p.amount)}`).join(' / '),
        'Descuento (Q)': discount,
        'Total (Q)': getSaleTotal(s),
        'Vendió': s.soldByEmail,
        'Estado': s.status === SaleStatus.CANCELLED ? 'ANULADA' : 'COMPLETADA',
      };
    });
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Ventas');
    XLSX.writeFile(workbook, `Reporte_Ventas_${day}.xlsx`);
  };

  const exportRangeToExcel = () => {
    const dates = dateListBetween(rangeStart, rangeEnd);
    const rows = dates.map((dateStr) => {
      const daySales = salesForDay(dateStr);
      const completed = daySales.filter((s) => s.status === SaleStatus.COMPLETED);
      const totalDiscount = completed.reduce((acc, s) => acc + s.items.reduce((a, it) => a + (it.discount || 0), 0), 0);
      const row: Record<string, string | number> = {
        'Fecha': formatDate(dateStr),
        '# Ventas': completed.length,
        '# Prendas': completed.reduce((acc, s) => acc + getSaleItemsCount(s), 0),
      };
      PAYMENT_METHODS.forEach((m) => {
        row[m.label] = methodTotal(daySales, m.value);
      });
      row['Descuentos (Q)'] = totalDiscount;
      row['Total del día (Q)'] = completed.reduce((acc, s) => acc + getSaleTotal(s), 0);
      return row;
    });

    // Fila de totales al final, para que la admin vea el acumulado del rango de un vistazo.
    const totalsRow: Record<string, string | number> = { 'Fecha': 'TOTAL DEL RANGO', '# Ventas': 0, '# Prendas': 0 };
    PAYMENT_METHODS.forEach((m) => { totalsRow[m.label] = 0; });
    totalsRow['Descuentos (Q)'] = 0;
    totalsRow['Total del día (Q)'] = 0;
    rows.forEach((r) => {
      totalsRow['# Ventas'] = (totalsRow['# Ventas'] as number) + (r['# Ventas'] as number);
      totalsRow['# Prendas'] = (totalsRow['# Prendas'] as number) + (r['# Prendas'] as number);
      PAYMENT_METHODS.forEach((m) => { totalsRow[m.label] = (totalsRow[m.label] as number) + (r[m.label] as number); });
      totalsRow['Descuentos (Q)'] = (totalsRow['Descuentos (Q)'] as number) + (r['Descuentos (Q)'] as number);
      totalsRow['Total del día (Q)'] = (totalsRow['Total del día (Q)'] as number) + (r['Total del día (Q)'] as number);
    });
    rows.push(totalsRow);

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Ventas por día');
    XLSX.writeFile(workbook, `Reporte_Ventas_${rangeStart}_a_${rangeEnd}.xlsx`);
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
        Descargar Reporte
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)}></div>
          <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-slate-100 z-50 p-4">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Configurar Reporte</h3>

            <div className="space-y-4">
              <div className="flex gap-2">
                <button
                  onClick={() => { setMode('DAY'); setFormat('PDF'); }}
                  className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold border transition ${mode === 'DAY' ? 'bg-[#2bb297]/5 text-[#1a8a72] border-[#2bb297]/20' : 'text-slate-600 border-transparent hover:bg-slate-50'}`}
                >
                  Reporte del día
                </button>
                <button
                  onClick={() => { setMode('RANGE'); setFormat('EXCEL'); }}
                  className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold border transition ${mode === 'RANGE' ? 'bg-[#2bb297]/5 text-[#1a8a72] border-[#2bb297]/20' : 'text-slate-600 border-transparent hover:bg-slate-50'}`}
                >
                  Elegir días
                </button>
              </div>

              {mode === 'DAY' ? (
                <>
                  <div>
                    <label className="block text-[9px] font-black text-slate-500 uppercase mb-1">Fecha</label>
                    <input
                      type="date"
                      value={day}
                      onChange={(e) => setDay(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-black text-slate-500 uppercase mb-1">Formato</label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setFormat('PDF')}
                        className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold border transition ${format === 'PDF' ? 'bg-[#8c3a4b]/10 text-[#8c3a4b] border-[#8c3a4b]/30' : 'text-slate-600 border-transparent hover:bg-slate-50'}`}
                      >
                        PDF (.pdf)
                      </button>
                      <button
                        onClick={() => setFormat('EXCEL')}
                        className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold border transition ${format === 'EXCEL' ? 'bg-[#2bb297]/5 text-[#1a8a72] border-[#2bb297]/20' : 'text-slate-600 border-transparent hover:bg-slate-50'}`}
                      >
                        EXCEL (.xlsx)
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[9px] font-black text-slate-500 uppercase mb-1">Desde</label>
                    <input
                      type="date"
                      value={rangeStart}
                      onChange={(e) => setRangeStart(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-black text-slate-500 uppercase mb-1">Hasta</label>
                    <input
                      type="date"
                      value={rangeEnd}
                      onChange={(e) => setRangeEnd(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                    />
                  </div>
                  <p className="col-span-2 text-[9px] text-slate-400 font-bold">
                    Genera una tabla de Excel con una fila por cada día del rango (como se descarga siempre en Excel).
                  </p>
                </div>
              )}

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
