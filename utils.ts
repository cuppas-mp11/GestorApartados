import {
  DailyClosing, Reservation, Lot, Sale, SaleItem, SalePayment, PaymentMethod, Customer,
  GarmentPriceEntry, Expense, ExpenseCategoryItem, ExpenseTemplate,
  UnitCostItem, FinanceSettings, LotColorSettings, LotStage, InventoryItem,
} from './types';

// Plazo de vencimiento centralizado (antes estaba repetido en 3 archivos distintos)
export const DEADLINE_DAYS = 15;

// Convierte un valor de <input type="date"> (ej. "2026-07-01") a un objeto Date
// usando la hora LOCAL, evitando el corrimiento de un día que ocurre si se usa
// `new Date("2026-07-01")` directamente (JS lo interpreta como UTC, y en zonas
// horarias negativas como Guatemala, GMT-6, eso lo empuja al día anterior).
export const parseLocalDateInput = (dateString: string): Date => {
  const [y, m, d] = dateString.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const generateId = (): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Math.random().toString(36).slice(2, 11);
};

export const calculateDaysPassed = (dateString: string): number => {
  // Comparación por día calendario (no por horas exactas), evita vencer "antes de tiempo"
  const reservationDate = new Date(dateString);
  const today = new Date();
  reservationDate.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  const diffTime = today.getTime() - reservationDate.getTime();
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
};

export const isOverdue = (dateString: string): boolean => {
  return calculateDaysPassed(dateString) > DEADLINE_DAYS;
};

export const getDeadlineDate = (dateString: string): string => {
  const date = new Date(dateString);
  date.setDate(date.getDate() + DEADLINE_DAYS);
  return date.toISOString();
};

// Si recibe una fecha "pura" tipo "2026-10-23" (de un <input type="date">,
// sin hora), la interpreta en hora LOCAL en vez de UTC — si no, un string así
// se toma como medianoche UTC y en Guatemala (UTC-6) se muestra el día
// anterior (ej. "23/10" se veía como "22 de octubre"). Si en cambio recibe
// un timestamp ISO completo (como los que ya usa el sistema para ventas,
// apartados, lotes, etc.), lo interpreta normal, sin tocar nada.
export const formatDate = (dateString: string): string => {
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(dateString);
  const date = isDateOnly ? parseLocalDateInput(dateString) : new Date(dateString);
  return date.toLocaleDateString('es-ES', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

export const formatCurrency = (amount: number): string => {
  return `Q${(amount || 0).toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// ---- Funciones financieras ÚNICAS (antes duplicadas y ligeramente distintas en 5 archivos) ----

export const getTotalPrice = (res: Reservation): number =>
  res.items.reduce((acc, it) => acc + it.pricePerUnit * it.quantity, 0);

export const getTotalPaid = (res: Reservation): number =>
  res.payments?.reduce((acc, p) => acc + p.amount, 0) ?? (res.depositAmount || 0);

export const getBalance = (res: Reservation): number =>
  getTotalPrice(res) - getTotalPaid(res);

// Convierte un string "YYYY-MM-DD" (de un <input type="date">) a un Date en hora LOCAL,
// evitando el bug clásico de JS donde `new Date("2026-07-01")` se interpreta como UTC
// y puede "retroceder" un día en zonas horarias detrás de UTC (como Guatemala).
export const parseLocalDate = (dateStr: string): Date => {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
};

// ---- Sistema de Lotes / Rotación de mercadería ----

const MONTH_ABBR = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

// Etiqueta de lote basada en semana de CALENDARIO dentro del mes (no en el orden de entregas):
// días 1-7 = semana 01, días 8-14 = semana 02, etc. Si dos entregas caen en el mismo
// bloque de 7 días, comparten automáticamente la misma etiqueta.
export const getLotLabelForDate = (date: Date): string => {
  const abbr = MONTH_ABBR[date.getMonth()];
  const week = Math.ceil(date.getDate() / 7);
  return `${abbr}${String(week).padStart(2, '0')}`;
};

export const getCurrentLotLabel = (): string => getLotLabelForDate(new Date());

export const getWeeksInStore = (entryDateISO: string): number => {
  return Math.floor(calculateDaysPassed(entryDateISO) / 7);
};

// Umbrales de rotación: 0-4 semanas = reciente, 5-7 = vigilar, 8+ = rebajar ya.
// Se pueden ajustar aquí si en el futuro cambian de opinión sobre los cortes.
export const getLotAlertLevel = (weeks: number): { level: 'green' | 'amber' | 'red'; label: string } => {
  if (weeks >= 8) return { level: 'red', label: 'Rebajar ya' };
  if (weeks >= 5) return { level: 'amber', label: 'Vigilar' };
  return { level: 'green', label: 'Reciente' };
};

// ---- Sistema de lotes por color ----

export const DEFAULT_LOT_COLOR_SETTINGS: LotColorSettings = {
  // Semana 1 = 23/10/2026 (primer lote con este sistema de colores).
  firstLotDate: '2026-10-23',
  // 6 colores en uso + 2 espacios de reserva vacíos (por si el plazo se alarga
  // a 7 u 8 semanas en el futuro) — getActiveLotColors() ignora los vacíos.
  colors: ['ROSADO', 'ROJO', 'AMARILLO', 'PLATEADO', 'VERDE', 'AZUL', '', ''],
  daysToFirstDiscount: 21,
  daysToFinalDiscount: 35,
  daysToPullout: 42,
  firstDiscountPercent: 0.15,
  finalDiscountPercent: 0.30,
  roundTo: 5,
  priceFloor: 35,
  manualExceptions: [
    { normalPrice: 35, firstDiscountPrice: 30, finalDiscountPrice: 30 },
    { normalPrice: 40, firstDiscountPrice: 35, finalDiscountPrice: 30 },
  ],
  wholesalePrice: 25,
};

// Colores "en uso" (ignora espacios de reserva vacíos para colores 7-8).
export const getActiveLotColors = (settings: LotColorSettings): string[] =>
  (settings.colors || []).map((c) => (c || '').trim()).filter(Boolean);

// Color que le toca a un lote según su fecha de entrada: cada bloque de 7 días
// desde `firstLotDate` avanza una posición en el ciclo de colores.
export const getLotColorForDate = (entryDate: Date, settings: LotColorSettings): string => {
  const colors = getActiveLotColors(settings);
  if (colors.length === 0) return '';
  const first = parseLocalDateInput(settings.firstLotDate);
  first.setHours(0, 0, 0, 0);
  const entry = new Date(entryDate);
  entry.setHours(0, 0, 0, 0);
  const days = Math.floor((entry.getTime() - first.getTime()) / (1000 * 60 * 60 * 24));
  const weekIndex = Math.floor(days / 7);
  const idx = ((weekIndex % colors.length) + colors.length) % colors.length;
  return colors[idx];
};

// Paleta visual para los 6 colores del ciclo (elegida por la administradora:
// "Opción 1 — Pasteles suaves"). Se usa para pintar el nombre del color como
// una etiqueta/chip (fondo del color, texto en un tono que haga contraste),
// tanto en Venta Nueva como en Lotes y en la configuración de Lotes por color.
export interface LotColorStyle { bg: string; text: string }

export const LOT_COLOR_PALETTE: Record<string, LotColorStyle> = {
  ROSADO: { bg: '#fbcfe8', text: '#831843' },
  ROJO: { bg: '#fecaca', text: '#7f1d1d' },
  AMARILLO: { bg: '#fef08a', text: '#713f12' },
  PLATEADO: { bg: '#e2e8f0', text: '#1e293b' },
  VERDE: { bg: '#bbf7d0', text: '#14532d' },
  AZUL: { bg: '#bfdbfe', text: '#1e3a8a' },
};

// Para un color que la administradora agregue y no esté en la paleta de
// arriba (ej. si cambia el ciclo a futuro con un nombre nuevo), o para lotes
// viejos sin color — un gris neutro en vez de dejarlo sin estilo.
const LOT_COLOR_FALLBACK: LotColorStyle = { bg: '#e2e8f0', text: '#475569' };

export const getLotColorStyle = (colorName?: string): LotColorStyle => {
  if (!colorName) return LOT_COLOR_FALLBACK;
  return LOT_COLOR_PALETTE[colorName.trim().toUpperCase()] || LOT_COLOR_FALLBACK;
};

// Código de etiqueta tipo "dd/mm" (el que va escrito en la prenda, junto al color).
export const formatLotColorCode = (entryDateISO: string): string => {
  const d = new Date(entryDateISO);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
};

// Etiqueta completa de un lote nuevo: "ROSADO 23/10".
export const buildColorLotLabel = (entryDate: Date, settings: LotColorSettings): string => {
  const color = getLotColorForDate(entryDate, settings);
  const code = formatLotColorCode(entryDate.toISOString());
  return color ? `${color} ${code}` : code;
};

// En qué etapa de precio está un lote hoy, según cuántos días lleva en tienda.
export const getLotStage = (entryDateISO: string, settings: LotColorSettings): LotStage => {
  const days = calculateDaysPassed(entryDateISO);
  if (days >= settings.daysToPullout) return 'pullout';
  if (days >= settings.daysToFinalDiscount) return 'final_discount';
  if (days >= settings.daysToFirstDiscount) return 'first_discount';
  return 'normal';
};

export const getStageInfo = (stage: LotStage): { label: string; level: 'green' | 'amber' | 'red' | 'slate' } => {
  switch (stage) {
    case 'first_discount': return { label: 'Precio rebajado (-15%)', level: 'amber' };
    case 'final_discount': return { label: 'Última oportunidad (-30%)', level: 'red' };
    case 'pullout': return { label: 'Sacar de los estantes', level: 'slate' };
    default: return { label: 'Precio normal', level: 'green' };
  }
};

// Redondea al múltiplo de `roundTo` más cercano (ej. a Q5), nunca hacia arriba
// de forma que termine arriba del precio sin redondear.
const roundToMultiple = (value: number, roundTo: number): number => {
  if (!roundTo || roundTo <= 0) return Math.round(value);
  return Math.round(value / roundTo) * roundTo;
};

// Precio de una prenda en una etapa dada, a partir de su precio normal.
// 1) Si el precio normal tiene una excepción manual, se usa esa (tal cual).
// 2) Si no, se calcula el % de descuento, se redondea al múltiplo configurado,
//    y nunca baja del piso de precio.
export const getDiscountedPrice = (normalPrice: number, stage: LotStage, settings: LotColorSettings): number => {
  if (stage === 'normal' || stage === 'pullout') return normalPrice;

  const exception = (settings.manualExceptions || []).find((e) => amountsMatch(e.normalPrice, normalPrice));
  if (exception) {
    return stage === 'first_discount' ? exception.firstDiscountPrice : exception.finalDiscountPrice;
  }

  const percent = stage === 'first_discount' ? settings.firstDiscountPercent : settings.finalDiscountPercent;
  const raw = normalPrice * (1 - percent);
  const rounded = roundToMultiple(raw, settings.roundTo || 5);
  return Math.max(settings.priceFloor || 0, rounded);
};

// Precio sugerido para vender un código HOY: toma el lote más antiguo que
// todavía tenga stock (el que se va a descontar primero, por FIFO) y calcula
// el precio según su etapa. Si ese lote no tiene color asignado (lote de
// antes de este sistema) o no hay stock registrado, usa el precio normal del
// catálogo tal cual, sin descuento.
export const getEffectivePriceForCode = (
  code: string,
  lots: Lot[],
  normalPrice: number,
  settings: LotColorSettings
): number => {
  const candidates = getCandidateLotsForCode(code, lots).filter((l) => l.quantityRemaining > 0);
  const oldest = candidates[0];
  if (!oldest || !oldest.color) return normalPrice;
  const stage = getLotStage(oldest.entryDate, settings);
  return getDiscountedPrice(normalPrice, stage, settings);
};

// Precio de UN lote específico (cuando la vendedora elige a mano de qué
// lote/etiqueta es la prenda, en vez de que el sistema adivine el más
// antiguo). Si el lote no tiene color asignado (de antes de este sistema),
// se vende a precio normal, sin descuento.
export const getEffectivePriceForLot = (
  lot: Lot,
  normalPrice: number,
  settings: LotColorSettings
): number => {
  if (!lot.color) return normalPrice;
  const stage = getLotStage(lot.entryDate, settings);
  return getDiscountedPrice(normalPrice, stage, settings);
};

export const getNextCustomerCode = (customers: { code: string }[]): string => {
  const nums = customers.map((c) => parseInt((c.code || '').substring(1)) || 0);
  const last = nums.length > 0 ? Math.max(...nums) : 0;
  return `C${String(last + 1).padStart(3, '0')}`;
};

// ---- Stock (Fase 2) ----

// Stock disponible de una prenda: suma de lo que queda en todos sus lotes.
// A partir de Fase 2, esto ya descuenta lo apartado y lo vendido.
export const getStockForCode = (code: string, lots: Lot[]): number =>
  lots.filter((l) => l.code === code).reduce((acc, l) => acc + l.quantityRemaining, 0);

export interface StockNeed { code: string; quantity: number }

// Suma cantidades repetidas del mismo código (ej. si el usuario agregó la misma
// prenda en dos líneas distintas de un mismo apartado/venta).
export const aggregateStockNeeds = (needs: StockNeed[]): StockNeed[] => {
  const map = new Map<string, number>();
  for (const n of needs) map.set(n.code, (map.get(n.code) || 0) + n.quantity);
  return Array.from(map.entries()).map(([code, quantity]) => ({ code, quantity }));
};

// Lotes candidatos de un código, del más antiguo al más nuevo (FIFO), para
// descontar stock respetando el orden de rotación de mercadería.
export const getCandidateLotsForCode = (code: string, lots: Lot[]): Lot[] =>
  lots
    .filter((l) => l.code === code)
    .sort((a, b) => new Date(a.entryDate).getTime() - new Date(b.entryDate).getTime());

// Cuánto de un código está actualmente "flotando" en apartados pendientes
// (ya descontado del stock físico, pero aún no vendido ni liberado).
export const getReservedForCode = (code: string, reservations: Reservation[]): number =>
  reservations
    .filter((r) => r.status === 'PENDING')
    .flatMap((r) => r.items)
    .filter((it) => it.code === code)
    .reduce((acc, it) => acc + it.quantity, 0);

// ---- Ventas directas (Fase 2) ----

export const PAYMENT_METHODS: { value: PaymentMethod; label: string; short: string }[] = [
  { value: 'cash', label: 'Efectivo', short: 'EF' },
  { value: 'transfer', label: 'Depósito o transferencia', short: 'DEP' },
  { value: 'card', label: 'Tarjeta', short: 'TC' },
  { value: 'other', label: 'Otro', short: 'OT' },
  { value: 'balance', label: 'Saldo a Favor', short: 'SALDO' },
];

// Métodos "normales" para los botones rápidos (todo menos Saldo, que tiene su propio flujo).
export const QUICK_PAYMENT_METHODS = PAYMENT_METHODS.filter((m) => m.value !== 'balance');

export const paymentMethodLabel = (method: PaymentMethod): string =>
  PAYMENT_METHODS.find((p) => p.value === method)?.label || method;

// Total de una línea de venta, ya restando el descuento por desperfecto (si hay)
export const getSaleItemTotal = (item: SaleItem): number =>
  Math.max(0, item.pricePerUnit * item.quantity - (item.discount || 0));

export const getSaleTotal = (sale: Sale): number =>
  sale.items.reduce((acc, it) => acc + getSaleItemTotal(it), 0);

export const getSaleItemsCount = (sale: Sale): number =>
  sale.items.reduce((acc, it) => acc + it.quantity, 0);

// Numera las ventas de UN mismo día del 1 en adelante, en el orden en que
// ocurrieron (por correlativo, que ya va en orden cronológico), sin importar
// en qué orden se estén mostrando en pantalla. Se usa en "Venta del día" y en
// el reporte del día, donde interesa "la venta #3 de hoy", no el correlativo
// global del sistema (ese sigue existiendo internamente, solo no se muestra ahí).
export const getDailySequenceMap = (daySales: Sale[]): Map<string, number> => {
  const chronological = [...daySales].sort((a, b) => a.correlative - b.correlative);
  return new Map(chronological.map((s, idx) => [s.id, idx + 1]));
};

// "PNT100 - Pantalón de 100 (2)" — mismo formato que se ve en el sistema,
// para que el reporte impreso se lea igual que la pantalla.
export const formatSaleItemLabel = (item: SaleItem): string =>
  `${item.code} - ${item.name} (${item.quantity})`;

// Muestra el alias corto de un usuario (asignado a mano en Firebase) en vez de
// su correo completo. Si no tiene alias asignado, se muestra el correo tal cual.
export const getDisplayName = (email: string | undefined, aliases: Record<string, string>): string => {
  if (!email) return 'desconocido';
  return aliases[email] || email;
};

// ---- Pagos combinados y saldo a favor (Fase 2.5) ----

export const getPaymentsTotal = (payments: SalePayment[]): number =>
  payments.reduce((acc, p) => acc + (p.amount || 0), 0);

// Tolerancia de 1 centavo para comparar totales (evita falsos negativos por floats)
export const amountsMatch = (a: number, b: number): boolean => Math.abs(a - b) < 0.01;

export const getCustomerCredit = (customer: Customer): number => customer.creditBalance || 0;

// Clientas con saldo a favor disponible (para el buscador al pagar con "Saldo")
export const getCustomersWithCredit = (customers: Customer[]): Customer[] =>
  customers.filter((c) => getCustomerCredit(c) > 0).sort((a, b) => getCustomerCredit(b) - getCustomerCredit(a));

// Ventas guardadas ANTES de Fase 2.5 tenían un solo campo `paymentMethod`
// (texto) en vez de la lista `payments[]` que se usa ahora. Sin esto, esas
// ventas viejas rompían la pantalla al leerlas (payments.map de undefined).
// Se normalizan al vuelo, una sola vez, al leerlas de Firestore.
export const normalizeSale = (raw: any): Sale => {
  if (Array.isArray(raw.payments)) return raw as Sale;
  const total = (raw.items || []).reduce(
    (acc: number, it: any) => acc + Math.max(0, (it.pricePerUnit || 0) * (it.quantity || 0) - (it.discount || 0)),
    0
  );
  return {
    ...raw,
    payments: [{ id: `legacy-${raw.id}`, method: raw.paymentMethod || 'other', amount: total }],
  } as Sale;
};

// Fecha de calendario LOCAL (Guatemala) en formato YYYY-MM-DD — para agrupar o
// filtrar "por día" (ej. "ventas de hoy"). Usar toISOString() para esto es un
// error clásico: como toISOString() da la fecha en UTC, y Guatemala está 6
// horas detrás, cualquier venta hecha después de las 6:00pm locales quedaba
// registrada como si fuera el día siguiente, y se mezclaba con las del otro día.
export const getLocalDateStr = (date: Date | string = new Date()): string => {
  // Un string "YYYY-MM-DD" (sin hora) ya es una fecha de calendario tal cual
  // se escribió — NO pasarlo por `new Date(...)`, porque JavaScript interpreta
  // esos strings como medianoche en UTC, y al convertir de vuelta a hora local
  // de Guatemala (UTC-6) se recorrería un día hacia atrás.
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  const d = typeof date === 'string' ? new Date(date) : date;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const isSameLocalDay = (dateA: Date | string, dateB: Date | string = new Date()): boolean =>
  getLocalDateStr(dateA) === getLocalDateStr(dateB);

// ¿Una fecha (YYYY-MM-DD) cae dentro de un rango [start, end], ambos incluidos?
export const isDateInRange = (dateStr: string, start: string, end: string): boolean => {
  const d = getLocalDateStr(dateStr);
  return d >= start && d <= end;
};

// ---- Fase 3: Precio por prenda y gastos (solo admin) ----

// Precio por prenda vigente en una fecha: el de la entrada más reciente cuya
// fecha de vigencia sea igual o anterior a ese día. Si la fecha es anterior a
// TODAS las entradas, se usa la más antigua (así reportes de días previos al
// primer registro no salen en cero). Sin ninguna entrada, devuelve 0.
export const getGarmentPriceForDate = (entries: GarmentPriceEntry[], dateStr: string): number => {
  if (!entries || entries.length === 0) return 0;
  const day = getLocalDateStr(dateStr);
  const sorted = [...entries].sort(
    (a, b) => a.effectiveDate.localeCompare(b.effectiveDate) || a.createdAt.localeCompare(b.createdAt)
  );
  let current = sorted[0];
  for (const e of sorted) {
    if (e.effectiveDate <= day) current = e;
  }
  return current.price || 0;
};

// Entrada vigente HOY (la que se muestra como "precio actual").
export const getCurrentGarmentPriceEntry = (entries: GarmentPriceEntry[]): GarmentPriceEntry | undefined => {
  if (!entries || entries.length === 0) return undefined;
  const today = getLocalDateStr();
  const sorted = [...entries].sort(
    (a, b) => a.effectiveDate.localeCompare(b.effectiveDate) || a.createdAt.localeCompare(b.createdAt)
  );
  let current = sorted[0];
  for (const e of sorted) {
    if (e.effectiveDate <= today) current = e;
  }
  return current;
};

export const getExpenseCategoryLabel = (categoryId: string, categories: ExpenseCategoryItem[]): string =>
  categories.find((c) => c.id === categoryId)?.label || 'Sin categoría';

export const getCurrentMonthStr = (date: Date | string = new Date()): string => getLocalDateStr(date).slice(0, 7);

// ¿Ya se confirmó esta plantilla recurrente para el mes indicado ("YYYY-MM")?
export const isTemplateConfirmedForMonth = (template: ExpenseTemplate, expenses: Expense[], monthStr: string): boolean =>
  expenses.some((e) => e.templateId === template.id && e.date.startsWith(monthStr));

export const getExpensesInRange = (expenses: Expense[], start: string, end: string): Expense[] =>
  expenses.filter((e) => isDateInRange(e.date, start, end));

export const getExpensesTotal = (expenses: Expense[]): number =>
  expenses.reduce((acc, e) => acc + (e.amount || 0), 0);

// Ventas COMPLETADAS (no anuladas) cuya fecha cae dentro de un rango [start, end].
export const getSalesInRange = (sales: Sale[], start: string, end: string): Sale[] =>
  sales.filter((s) => (s.status as unknown as string) === 'COMPLETED' && isDateInRange(s.date, start, end));

// Cuánto se pagó con un método específico dentro de un conjunto de ventas.
export const getPaymentMethodTotal = (sales: Sale[], method: PaymentMethod): number =>
  sales.reduce((acc, s) => acc + s.payments.filter((p) => p.method === method).reduce((a, p) => a + p.amount, 0), 0);

// ---- Costos por prenda vendida + comisión de vendedora ----

// Suma de todos los costos configurados por prenda (planchado + empaque +
// plástico + etiqueta + lo que se agregue), por CADA prenda vendida.
export const getUnitCostsTotal = (unitCosts: UnitCostItem[]): number =>
  unitCosts.reduce((acc, u) => acc + (u.amount || 0), 0);

// Correos únicos de quienes vendieron dentro de un conjunto de ventas (para
// poder calcular la comisión de cada vendedora por separado).
export const getDistinctSellerEmails = (sales: Sale[]): string[] =>
  Array.from(new Set(sales.map((s) => s.soldByEmail).filter(Boolean)));

// Desglose completo de rentabilidad para un conjunto de ventas (puede ser todas
// las del negocio en un rango, o solo las de una vendedora). Sigue el mismo
// orden que el Excel de la tienda:
//   Ingresos → precio por prenda (el vigente el día de cada venta) → costos por
//   prenda → comisión de tarjeta → IVA de factura (tarjeta + transferencia) →
//   Ganancia neta → comisión de vendedora.
// Los gastos fijos/variables del periodo (Expenses) NO se incluyen aquí — se
// restan aparte, a nivel de todo el negocio, para llegar a la ganancia final.
export interface ProfitabilityBreakdown {
  revenue: number;
  itemsSold: number;
  cogsGarment: number; // precio por prenda × prendas vendidas (con el precio vigente en la fecha de cada venta)
  cogsUnitCosts: number; // planchado/empaque/etc., aplica a TODAS las prendas vendidas
  cardTotal: number;
  transferTotal: number;
  cardFee: number;
  invoiceTax: number;
  grossProfitAfterCogs: number; // revenue - cogsGarment - cogsUnitCosts
  netProfit: number; // grossProfitAfterCogs - cardFee - invoiceTax ("ganancia neta", base de la comisión)
  vendorCommission: number;
  profitAfterCommission: number; // netProfit - vendorCommission
}

export const calculateProfitability = (
  sales: Sale[],
  garmentPrices: GarmentPriceEntry[],
  settings: FinanceSettings
): ProfitabilityBreakdown => {
  const revenue = sales.reduce((acc, s) => acc + getSaleTotal(s), 0);
  const itemsSold = sales.reduce((acc, s) => acc + getSaleItemsCount(s), 0);

  const cogsGarment = sales.reduce((acc, s) => acc + getSaleItemsCount(s) * getGarmentPriceForDate(garmentPrices, s.date), 0);

  const cogsUnitCosts = itemsSold * getUnitCostsTotal(settings.unitCosts || []);
  const cardTotal = getPaymentMethodTotal(sales, 'card');
  const transferTotal = getPaymentMethodTotal(sales, 'transfer');
  const cardFee = cardTotal * ((settings.cardCommissionPercent || 0) / 100);
  const invoiceTax = (cardTotal + transferTotal) * ((settings.invoiceTaxPercent || 0) / 100);
  const grossProfitAfterCogs = revenue - cogsGarment - cogsUnitCosts;
  const netProfit = grossProfitAfterCogs - cardFee - invoiceTax;
  // No se paga comisión sobre una pérdida — si el periodo cerró en negativo, la
  // comisión de la vendedora es Q0, no un número negativo.
  const vendorCommission = netProfit > 0 ? netProfit * ((settings.vendorCommissionPercent || 0) / 100) : 0;
  const profitAfterCommission = netProfit - vendorCommission;

  return {
    revenue,
    itemsSold,
    cogsGarment,
    cogsUnitCosts,
    cardTotal,
    transferTotal,
    cardFee,
    invoiceTax,
    grossProfitAfterCogs,
    netProfit,
    vendorCommission,
    profitAfterCommission,
  };
};

export interface SellerCommission {
  email: string;
  breakdown: ProfitabilityBreakdown;
}

// Misma lógica de arriba, pero una fila por cada vendedora (según soldByEmail
// de cada venta), para pagar la comisión de cada quien según lo que ella vendió.
export const calculateCommissionsBySeller = (
  sales: Sale[],
  garmentPrices: GarmentPriceEntry[],
  settings: FinanceSettings
): SellerCommission[] =>
  getDistinctSellerEmails(sales)
    .map((email) => ({
      email,
      breakdown: calculateProfitability(sales.filter((s) => s.soldByEmail === email), garmentPrices, settings),
    }))
    .sort((a, b) => b.breakdown.revenue - a.breakdown.revenue);

// "Miércoles 25-Nov-26" — para mostrar la fecha del día en el Resumen.
export const formatTodayLabel = (date: Date = new Date()): string => {
  const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  return `${days[date.getDay()]} ${String(date.getDate()).padStart(2, '0')}-${months[date.getMonth()]}-${String(date.getFullYear()).slice(-2)}`;
};

// Totales de un día para el cierre: lo que dice el sistema (ventas completadas
// de ese día).
export const getDayClosingTotals = (sales: Sale[], dateStr: string) => {
  const daySales = sales.filter((s) => isSameLocalDay(s.date, dateStr));
  const completed = daySales.filter((s) => (s.status as unknown as string) === 'COMPLETED');
  const byMethod: Record<string, number> = {};
  PAYMENT_METHODS.forEach((m) => {
    byMethod[m.value] = completed.reduce((acc, s) => acc + s.payments.filter((p) => p.method === m.value).reduce((a, p) => a + p.amount, 0), 0);
  });
  return {
    daySales,
    salesCount: completed.length,
    itemsCount: completed.reduce((acc, s) => acc + getSaleItemsCount(s), 0),
    totalSold: completed.reduce((acc, s) => acc + getSaleTotal(s), 0),
    discountTotal: completed.reduce((acc, s) => acc + s.items.reduce((a, it) => a + (it.discount || 0), 0), 0),
    cancelledCount: daySales.length - completed.length,
    byMethod,
  };
};

// ---- Caja corriente ----
// El efectivo de la caja se lleva de un cierre al siguiente: lo que se queda en
// caja hoy (contado - lo enviado a la administradora) es el efectivo de apertura
// de mañana. Las tarjetas, depósitos y saldos a favor no pasan por la caja.

// Último cierre ANTERIOR a una fecha (si lo hay).
export const getPreviousClosing = (closings: DailyClosing[], dateStr: string): DailyClosing | undefined =>
  [...closings].filter((c) => c.date < dateStr).sort((a, b) => b.date.localeCompare(a.date))[0];

// Efectivo cobrado en ventas completadas DESPUÉS del cierre anterior (sin
// incluirlo) hasta la fecha indicada (incluida). Sin cierre anterior, solo cuenta ese día.
export const getCashSalesSince = (sales: Sale[], previous: DailyClosing | undefined, untilDate: string): number =>
  sales
    .filter((s) => (s.status as unknown as string) === 'COMPLETED')
    .filter((s) => {
      const d = getLocalDateStr(s.date);
      return d <= untilDate && (previous ? d > previous.date : d === untilDate);
    })
    .reduce((acc, s) => acc + s.payments.filter((p) => p.method === 'cash').reduce((a, p) => a + p.amount, 0), 0);

// Estado del efectivo de un cierre, para mostrarlo con color.
export const getCashStatus = (closing: Pick<DailyClosing, 'difference'>): { label: string; ok: boolean } => {
  const d = closing.difference;
  if (Math.abs(d) < 0.01) return { label: 'Cuadra ✓', ok: true };
  return { label: d > 0 ? `Sobran ${formatCurrency(d)}` : `Faltan ${formatCurrency(Math.abs(d))}`, ok: false };
};
