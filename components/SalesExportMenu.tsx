import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Sale, SaleStatus, PaymentMethod } from '../types';
import { formatCurrency, formatDate, getSaleTotal, getSaleItemsCount, paymentMethodLabel, PAYMENT_METHODS, getDailySequenceMap, getDisplayName } from '../utils';

interface SalesExportMenuProps {
  sales: Sale[];
  aliases: Record<string, string>;
}

const todayStr = () => new Date().toISOString().split('T')[0];

export const SalesExportMenu: React.FC<SalesExportMenuProps> = ({ sales, aliases }) => {
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
    const discountDia = completed.reduce((acc, s) => acc + s.items.reduce((a, it) => a + (it.discount || 0), 0), 0);
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
      foot: [['TOTAL', formatCurrency(totalDia)]],
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [43, 178, 151], textColor: 255 },
      footStyles: { fillColor: [232, 247, 242], textColor: [26, 138, 114], fontStyle: 'bold' },
      columnStyles: { 1: { halign: 'right' } },
    });

    const afterSummaryY = (doc as any).lastAutoTable.finalY + 6;

    const tableHeaders = [['#', 'Prenda', 'Precio', 'Cantidad', 'Método(s)', 'Descuento', 'Total', 'Vendió']];
    const tableRows = data.map((s) => {
      const cancelled = s.status === SaleStatus.CANCELLED;
      const prendaList = s.items.map((it) => `${it.code} - ${it.name}`).join('\n');
      const precioList = s.items.map((it) => formatCurrency(it.pricePerUnit)).join('\n');
      const qtyList = s.items.map((it) => `${it.quantity}`).join('\n');
      const paymentsList = s.payments.map((p) => `${paymentMethodLabel(p.method)}: ${formatCurrency(p.amount)}`).join('\n');
      const discount = s.items.reduce((acc, it) => acc + (it.discount || 0), 0);
      return [
        `${dailySeq.get(s.id)}${cancelled ? ' (ANULADA)' : ''}`,
        prendaList,
        precioList,
        qtyList,
        paymentsList,
        discount > 0 ? formatCurrency(discount) : '—',
        formatCurrency(getSaleTotal(s)),
        getDisplayName(s.soldByEmail, aliases),
      ];
    });

    // Fila de totales, alineada bajo la columna a la que corresponde cada dato.
    // "Precio" y "Vendió" quedan en blanco: son solo informativas, como el precio
    // unitario de cada línea, no tiene sentido sumarlas.
    const footRow = [[
      '', 'TOTAL DEL DÍA', '', `${itemsDia} prenda(s)`, `${completed.length} venta(s)`,
      discountDia > 0 ? formatCurrency(discountDia) : '—', formatCurrency(totalDia), '',
    ]];

    autoTable(doc, {
      startY: afterSummaryY,
      head: tableHeaders,
      body: tableRows,
      foot: footRow,
      theme: 'grid',
      styles: { fontSize: 7.5, cellPadding: 2 },
      headStyles: { fillColor: [43, 178, 151], textColor: 255 },
      footStyles: { fillColor: [232, 247, 242], textColor: [26, 138, 114], fontStyle: 'bold', fontSize: 8 },
      columnStyles: { 2: { halign: 'right' }, 3: { halign: 'center' }, 6: { halign: 'right' } },
    });

    doc.save(`Reporte_Ventas_${day}.pdf`);
  };

  const exportDayToExcel = (data: Sale[]) => {
    const completed = data.filter((s) => s.status === SaleStatus.COMPLETED);
    const totalDia = completed.reduce((acc, s) => acc + getSaleTotal(s), 0);
    const itemsDia = completed.reduce((acc, s) => acc + getSaleItemsCount(s), 0);
    const discountDia = completed.reduce((acc, s) => acc + s.items.reduce((a, it) => a + (it.discount || 0), 0), 0);
    const dailySeq = getDailySequenceMap(data);

    const rows: (string | number)[][] = [];
    rows.push(['Vestimenta GT']);
    rows.push([`Reporte de Ventas — ${formatDate(day)}`]);
    rows.push([]);

    // ---- Resumen por método de pago, con su total al final ----
    rows.push(['Método de pago', 'Total']);
    PAYMENT_METHODS.forEach((m) => {
      const total = methodTotal(data, m.value);
      if (total > 0) rows.push([m.label, total]);
    });
    rows.push(['TOTAL', totalDia]);
    rows.push([]);

    // ---- Detalle de ventas, con Prenda, Precio y Cantidad en columnas separadas ----
    rows.push(['#', 'Prenda', 'Precio (Q)', 'Cantidad', 'Método(s) de pago', 'Descuento (Q)', 'Total (Q)', 'Vendió', 'Estado']);
    data.forEach((s) => {
      const cancelled = s.status === SaleStatus.CANCELLED;
      const discount = s.items.reduce((acc, it) => acc + (it.discount || 0), 0);
      s.items.forEach((it, idx) => {
        rows.push([
          idx === 0 ? (dailySeq.get(s.id) ?? '') : '',
          `${it.code} - ${it.name}`,
          it.pricePerUnit,
          it.quantity,
          idx === 0 ? s.payments.map((p) => `${paymentMethodLabel(p.method)}: ${formatCurrency(p.amount)}`).join(' / ') : '',
          idx === 0 ? discount : '',
          idx === 0 ? getSaleTotal(s) : '',
          idx === 0 ? getDisplayName(s.soldByEmail, aliases) : '',
          idx === 0 ? (cancelled ? 'ANULADA' : 'COMPLETADA') : '',
        ]);
      });
    });

    // Fila de totales, cada dato bajo su columna correspondiente.
    // "Precio (Q)" y "Vendió" quedan en blanco: son solo informativas.
    rows.push(['', 'TOTAL DEL DÍA', '', itemsDia, `${completed.length} venta(s)`, discountDia, totalDia, '', '']);

    const worksheet = XLSX.utils.aoa_to_sheet(rows);
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
