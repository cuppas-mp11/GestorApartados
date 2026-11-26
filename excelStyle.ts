// Plantilla COMPARTIDA para todos los Excel del sistema — mismo estilo que el
// PDF del reporte del día: logo arriba a la izquierda, título en tres niveles,
// encabezados verdes con letra blanca, filas alternadas, fila de total en verde
// claro, montos con formato "Q1,234.50" (siguen siendo números sumables).
//
// Si algún día quieres cambiar un color o el tamaño del logo, se hace SOLO aquí
// y cambian los 5 reportes a la vez.
//
// La librería (ExcelJS) se descarga únicamente cuando alguien pide un Excel,
// para no hacer más pesada la carga normal de la app.

// ---- Colores (los mismos del PDF y del resto del sistema) ----
const TEAL = 'FF2BB297'; // encabezados de tabla
const TEAL_DARK = 'FF1A8A72'; // texto de totales y subtítulos
const TEAL_LIGHT = 'FFE8F7F2'; // fondo de la fila de total
const SLATE_DARK = 'FF1E293B';
const SLATE_MID = 'FF64748B';
const ZEBRA = 'FFF8FAFC';
const BORDER = 'FFE2E8F0';
const WINE = 'FF8C3A4B'; // anuladas
const WINE_LIGHT = 'FFFBEFF1';

const MONEY_FMT = '"Q"#,##0.00;[Red]-"Q"#,##0.00';

export type ColType = 'text' | 'money' | 'int' | 'center';
// Una celda puede ser un valor simple, o un objeto si necesita un formato distinto al de su columna.
export type Cell = string | number | null | { v: string | number | null; type?: ColType };

export interface TableSection {
  heading?: string; // subtítulo de la tabla (ej. "Comisión por vendedora")
  columns: { header: string; type?: ColType }[];
  rows: Cell[][];
  total?: Cell[]; // fila de TOTAL (verde claro, en negrilla)
  cancelledRows?: number[]; // índices de filas anuladas (se ven en vino y tachadas)
  emphasisRows?: number[]; // índices de filas importantes (negrilla con fondo verde claro)
}

export interface SheetSpec {
  name: string; // nombre de la pestaña
  title: string; // ej. "Reporte de Ventas — 25 de noviembre de 2026"
  subtitle?: string; // ej. "Del 1 al 24 de noviembre"
  widths: number[]; // ancho de cada columna
  sections: TableSection[];
  landscape?: boolean;
  freezeHeader?: boolean; // fija el encabezado al hacer scroll (solo si hay una tabla)
}

const thinBorder = { style: 'thin' as const, color: { argb: BORDER } };
const allBorders = { top: thinBorder, left: thinBorder, bottom: thinBorder, right: thinBorder };

const normalize = (cell: Cell, colType: ColType): { v: string | number | null; type: ColType } => {
  if (cell !== null && typeof cell === 'object') return { v: cell.v, type: cell.type || colType };
  return { v: cell === '' ? null : cell, type: colType };
};

const applyType = (c: any, type: ColType) => {
  if (type === 'money') {
    c.numFmt = MONEY_FMT;
    c.alignment = { horizontal: 'right', vertical: 'middle', indent: 1 };
  } else if (type === 'int') {
    c.numFmt = '#,##0';
    c.alignment = { horizontal: 'center', vertical: 'middle' };
  } else if (type === 'center') {
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  } else {
    c.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true, indent: 1 };
  }
};

// El logo vive en public/logo.png. Si por cualquier razón no se puede leer, el
// Excel se genera igual, sin logo.
const loadLogo = async (): Promise<ArrayBuffer | null> => {
  try {
    const res = await fetch('/logo.png');
    if (!res.ok) return null;
    const type = res.headers.get('content-type') || '';
    if (!type.startsWith('image/')) return null; // algunos servidores devuelven una página HTML si no existe
    return await res.arrayBuffer();
  } catch {
    return null;
  }
};

export const downloadStyledExcel = async (fileName: string, sheets: SheetSpec[]): Promise<void> => {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Data Vestimenta — Vestimenta GT';
  wb.created = new Date();

  const logoBuffer = await loadLogo();
  const logoId = logoBuffer ? wb.addImage({ buffer: logoBuffer, extension: 'png' }) : null;

  for (const spec of sheets) {
    const ws = wb.addWorksheet(spec.name, {
      views: [{ showGridLines: false }],
      pageSetup: {
        paperSize: 1 as any, // carta
        orientation: spec.landscape ? 'landscape' : 'portrait',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
      },
    });

    // La primera columna debe ser lo bastante ancha para que quepa el logo.
    spec.widths.forEach((w, i) => { ws.getColumn(i + 1).width = i === 0 ? Math.max(w, 10) : w; });

    // ---- Encabezado: logo + título en tres niveles (igual que el PDF) ----
    ws.getRow(1).height = 26;
    ws.getRow(2).height = 20;
    ws.getRow(3).height = 16;
    if (logoId !== null) {
      ws.addImage(logoId, { tl: { col: 0.15, row: 0.1 }, ext: { width: 56, height: 56 } });
    }
    const titleCol = 2;
    const t1 = ws.getCell(1, titleCol);
    t1.value = 'Vestimenta GT';
    t1.font = { name: 'Calibri', size: 18, bold: true, color: { argb: SLATE_DARK } };
    t1.alignment = { vertical: 'middle' };
    const t2 = ws.getCell(2, titleCol);
    t2.value = spec.title;
    t2.font = { name: 'Calibri', size: 12, bold: true, color: { argb: TEAL_DARK } };
    t2.alignment = { vertical: 'middle' };
    const t3 = ws.getCell(3, titleCol);
    t3.value = `${spec.subtitle ? spec.subtitle + ' · ' : ''}Generado: ${new Date().toLocaleString('es-GT')}`;
    t3.font = { name: 'Calibri', size: 9, color: { argb: SLATE_MID } };
    t3.alignment = { vertical: 'middle' };

    let r = 5; // fila actual (deja un renglón en blanco bajo el encabezado)
    let firstHeaderRow = 0;

    for (const sec of spec.sections) {
      if (sec.heading) {
        const h = ws.getCell(r, 1);
        h.value = sec.heading;
        h.font = { name: 'Calibri', size: 11, bold: true, color: { argb: TEAL_DARK } };
        ws.getRow(r).height = 20;
        r += 1;
      }

      // Encabezado de la tabla
      const headerRow = ws.getRow(r);
      headerRow.height = 22;
      sec.columns.forEach((col, i) => {
        const c = headerRow.getCell(i + 1);
        c.value = col.header;
        c.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TEAL } };
        c.alignment = { horizontal: col.type === 'money' ? 'right' : col.type === 'int' || col.type === 'center' ? 'center' : 'left', vertical: 'middle', wrapText: true, indent: col.type === 'money' || !col.type || col.type === 'text' ? 1 : 0 };
        c.border = allBorders;
      });
      if (!firstHeaderRow) firstHeaderRow = r;
      r += 1;

      // Filas de datos
      sec.rows.forEach((row, idx) => {
        const cancelled = sec.cancelledRows?.includes(idx);
        const emphasis = sec.emphasisRows?.includes(idx);
        const xr = ws.getRow(r);
        sec.columns.forEach((col, i) => {
          const { v, type } = normalize(row[i] ?? null, col.type || 'text');
          const c = xr.getCell(i + 1);
          c.value = v;
          applyType(c, type);
          c.border = allBorders;
          c.font = { name: 'Calibri', size: 10 };
          if (idx % 2 === 1) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } };
          if (emphasis) {
            c.font = { name: 'Calibri', size: 10, bold: true, color: { argb: TEAL_DARK } };
            c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TEAL_LIGHT } };
          }
          if (cancelled) {
            c.font = { name: 'Calibri', size: 10, italic: true, strike: true, color: { argb: WINE } };
            c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: WINE_LIGHT } };
          }
        });
        r += 1;
      });

      // Fila de total
      if (sec.total) {
        const xr = ws.getRow(r);
        xr.height = 20;
        sec.columns.forEach((col, i) => {
          const { v, type } = normalize(sec.total![i] ?? null, col.type || 'text');
          const c = xr.getCell(i + 1);
          c.value = v;
          applyType(c, type);
          c.font = { name: 'Calibri', size: 10, bold: true, color: { argb: TEAL_DARK } };
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TEAL_LIGHT } };
          c.border = { ...allBorders, top: { style: 'medium', color: { argb: TEAL } } };
        });
        r += 1;
      }

      r += 1; // renglón en blanco entre tablas
    }

    // Encabezado fijo al hacer scroll (solo cuando la hoja es una sola tabla larga)
    if (spec.freezeHeader && spec.sections.length === 1 && firstHeaderRow) {
      ws.views = [{ showGridLines: false, state: 'frozen', ySplit: firstHeaderRow }];
    }
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
