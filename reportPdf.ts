import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { DailyClosing, Sale, SaleStatus, PaymentMethod } from './types';
import { formatCurrency, formatDate, getSaleTotal, getSaleItemsCount, paymentMethodLabel, PAYMENT_METHODS, getDailySequenceMap, getDisplayName } from './utils';
import { loadLogoDataUrl, PDF_LOGO_SIZE, PDF_TEXT_X_WITH_LOGO } from './pdfLogo';

// PDF del reporte de ventas del día — vive aquí (y no dentro de un botón) para
// poder usarlo desde varios lugares: "Generar reporte", "Cerrar el día" y el
// panel de cierres de la administradora.

const methodTotal = (daySales: Sale[], method: PaymentMethod) =>
  daySales
    .filter((s) => s.status === SaleStatus.COMPLETED)
    .reduce((acc, s) => acc + s.payments.filter((p) => p.method === method).reduce((a, p) => a + p.amount, 0), 0);

export const buildDayReportPdf = async (
  data: Sale[],
  day: string,
  aliases: Record<string, string>,
  closing?: DailyClosing
): Promise<jsPDF> => {
    const doc = new jsPDF();
    const logo = await loadLogoDataUrl();
    const completed = data.filter((s) => s.status === SaleStatus.COMPLETED);
    const totalDia = completed.reduce((acc, s) => acc + getSaleTotal(s), 0);
    const itemsDia = completed.reduce((acc, s) => acc + getSaleItemsCount(s), 0);
    const discountDia = completed.reduce((acc, s) => acc + s.items.reduce((a, it) => a + (it.discount || 0), 0), 0);
    const dailySeq = getDailySequenceMap(data);

    // Logo arriba a la izquierda; si hay logo, el texto se corre a la derecha.
    if (logo) doc.addImage(logo, 'PNG', 14, 8, PDF_LOGO_SIZE, PDF_LOGO_SIZE);
    const textX = logo ? PDF_TEXT_X_WITH_LOGO : 14;
    doc.setFontSize(18);
    doc.text('Vestimenta GT', textX, 15);
    doc.setFontSize(12);
    doc.text(`Reporte de Ventas — ${formatDate(day)}`, textX, 22);
    doc.setFontSize(9);
    doc.text(`Generado: ${new Date().toLocaleString('es-GT')}`, textX, 28);

    const summaryRows = PAYMENT_METHODS
      .map((m) => [m.label, formatCurrency(methodTotal(data, m.value))])
      .filter((row) => row[1] !== formatCurrency(0));
    autoTable(doc, {
      startY: 36,
      head: [['Método de pago', 'Total']],
      body: summaryRows.length > 0 ? summaryRows : [['Sin ventas completadas', formatCurrency(0)]],
      // El monto de la fila TOTAL se alinea a la derecha con un estilo puesto
      // directamente en la celda (no solo en columnStyles), porque autoTable
      // no siempre respeta columnStyles en la fila "foot".
      foot: [['TOTAL', { content: formatCurrency(totalDia), styles: { halign: 'right' } }]],
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
    // Igual que en la tabla de arriba: el monto del Total se alinea a la
    // derecha con un estilo puesto directo en la celda, para que autoTable
    // lo respete también en la fila "foot".
    const footRow = [[
      '', 'TOTAL DEL DÍA', '', `${itemsDia} prenda(s)`, `${completed.length} venta(s)`,
      discountDia > 0 ? formatCurrency(discountDia) : '—',
      { content: formatCurrency(totalDia), styles: { halign: 'right' as const } },
      '',
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

    // ---- Cierre de caja: va AL FINAL del reporte, después del detalle de ventas ----
    if (closing) {
      const diff = closing.difference;
      const cuadra = Math.abs(diff) < 0.01;
      const bold = { fontStyle: 'bold' as const };
      const right = { halign: 'right' as const };
      // Filas (contando desde 0) que llevan una línea negra gruesa debajo: separan
      // los grupos de datos (de dónde sale el efectivo / lo esperado / lo enviado / lo que queda).
      const THICK_BELOW_ROWS = [3, 4, 6, 7];

      let y = (doc as any).lastAutoTable.finalY + 10;
      if (y + 80 > doc.internal.pageSize.getHeight()) {
        doc.addPage();
        y = 20;
      }

      autoTable(doc, {
        startY: y,
        head: [['Cierre de caja chica (efectivo)', { content: 'Monto', styles: { halign: 'right' } }]],
        body: [
          // Grupo 1: de dónde sale el efectivo
          ['Caja chica (con lo que abrió)', { content: formatCurrency(closing.openingCash), styles: right }],
          ['+ Cobrado en efectivo', { content: formatCurrency(closing.cashSales), styles: right }],
          ['+ Abonos de apartados (efectivo)', { content: formatCurrency(closing.reservationCash || 0), styles: right }],
          ['− Compras pagadas de caja chica', { content: (closing.purchasesTotal || 0) > 0 ? `-${formatCurrency(closing.purchasesTotal)}` : formatCurrency(0), styles: right }],
          // Grupo 2: lo que el sistema espera
          [{ content: 'Disponible según el sistema', styles: bold }, { content: formatCurrency(closing.expectedCash), styles: { ...bold, ...right } }],
          // Grupo 3: lo que se contó (resaltado en verde claro)
          [
            { content: 'Efectivo contado por la vendedora', styles: { ...bold, fillColor: [232, 247, 242] } },
            { content: formatCurrency(closing.countedCash), styles: { ...bold, ...right, fillColor: [232, 247, 242] } },
          ],
          ['Enviado a la administradora', { content: formatCurrency(closing.sentToAdmin || 0), styles: right }],
          // Grupo 4: lo que queda (resaltado en gris)
          [
            { content: 'Se queda en caja chica', styles: { ...bold, fillColor: [229, 229, 229] } },
            { content: formatCurrency(closing.keptInBox), styles: { ...bold, ...right, fillColor: [229, 229, 229] } },
          ],
        ],
        foot: [[
          cuadra ? 'CUADRA' : diff > 0 ? 'SOBRA' : 'FALTA',
          { content: cuadra ? formatCurrency(0) : formatCurrency(Math.abs(diff)), styles: { halign: 'right' } },
        ]],
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [43, 178, 151], textColor: 255 },
        footStyles: cuadra
          ? { fillColor: [232, 247, 242], textColor: [26, 138, 114], fontStyle: 'bold' }
          : { fillColor: [251, 239, 241], textColor: [140, 58, 75], fontStyle: 'bold' },
        tableWidth: 110,
        margin: { left: 14 },
        // Línea negra gruesa debajo de las filas que cierran un grupo
        didDrawCell: (data: any) => {
          if (data.section === 'body' && THICK_BELOW_ROWS.includes(data.row.index)) {
            doc.setDrawColor(0, 0, 0);
            doc.setLineWidth(0.6);
            doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
          }
        },
      });

      const noteY = (doc as any).lastAutoTable.finalY + 6;
      doc.setFontSize(8);
      doc.text(
        `Cierre enviado por ${getDisplayName(closing.closedByEmail, aliases)} el ${new Date(closing.closedAt).toLocaleString('es-GT')}${closing.note ? ` — Nota: ${closing.note}` : ''}`,
        14,
        noteY
      );
    }

  return doc;
};

export const dayReportFileName = (day: string) => `Reporte_Ventas_${day}.pdf`;

// Descarga normal (computadora o celular).
export const downloadPdf = (doc: jsPDF, fileName: string) => doc.save(fileName);

// "Compartir": en el celular abre el menú del teléfono (WhatsApp, correo, Drive...)
// con el PDF ya adjunto. Si el aparato no lo permite (ej. algunas computadoras),
// simplemente se descarga.
export const sharePdf = async (doc: jsPDF, fileName: string, title: string): Promise<'shared' | 'downloaded' | 'cancelled'> => {
  try {
    const blob = doc.output('blob');
    const file = new File([blob], fileName, { type: 'application/pdf' });
    const nav = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean };
    if (nav.share && nav.canShare && nav.canShare({ files: [file] })) {
      await nav.share({ files: [file], title });
      return 'shared';
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled'; // la persona cerró el menú
  }
  doc.save(fileName);
  return 'downloaded';
};
