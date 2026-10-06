import {
  Reservation, Lot, Sale, SaleItem, SalePayment, PaymentMethod, Customer,
  Paca, PacaReconciliation, Expense, ExpenseCategoryItem, ExpenseTemplate,
  UnitCostItem, FinanceSettings,
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

export const formatDate = (dateString: string): string => {
  return new Date(dateString).toLocaleDateString('es-ES', {
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

// ---- Fase 3: Catálogo de pacas, costeo manual por sticker y gastos (solo admin) ----

export const getNextPacaCode = (pacas: Paca[]): string => {
  const nums = pacas.map((p) => parseInt((p.code || '').replace(/\D/g, ''), 10) || 0);
  const last = nums.length > 0 ? Math.max(...nums) : 0;
  return `PACA${String(last + 1).padStart(3, '0')}`;
};

// Busca una paca YA existente con el MISMO precio y la MISMA cantidad (mismas
// características = mismo costo unitario), para no crear un código nuevo cada
// vez que se vuelve a comprar "la misma" paca — se le agrega la fecha a su
// historial de compras en vez de duplicarla.
export const findMatchingPaca = (pacas: Paca[], balePrice: number, quantity: number): Paca | undefined =>
  pacas.find((p) => amountsMatch(p.balePrice, balePrice) && p.quantity === quantity);

// Fecha de la compra más reciente de una paca (puede tener varias si se ha
// vuelto a comprar con las mismas características).
export const getLatestPurchaseDate = (paca: Paca): string | undefined => {
  if (!paca.purchases || paca.purchases.length === 0) return undefined;
  return [...paca.purchases].sort((a, b) => b.date.localeCompare(a.date))[0].date;
};

export const sortPacasByLatestPurchase = (pacas: Paca[]): Paca[] =>
  [...pacas].sort((a, b) => (getLatestPurchaseDate(b) || '').localeCompare(getLatestPurchaseDate(a) || ''));

// Cantidad vendida de un código de prenda dentro de un conjunto de ventas.
export const getSoldQuantityForCode = (sales: Sale[], code: string): number =>
  sales.reduce((acc, s) => acc + s.items.filter((it) => it.code === code).reduce((a, it) => a + it.quantity, 0), 0);

export const getDistinctCodesSold = (sales: Sale[]): string[] =>
  Array.from(new Set(sales.flatMap((s) => s.items.map((it) => it.code))));

// Reconciliaciones (costeos) cuyo rango de fechas cae COMPLETO dentro del rango
// que se está revisando — si una reconciliación se sale del rango (ej. costeó
// una semana que cruza de un mes a otro), no se cuenta aquí para evitar mezclar
// periodos a medias. Conviene costear usando cortes de fecha compatibles con
// cómo luego se revisa la rentabilidad (ej. por semana completa, o por mes).
export const getReconciliationsInRange = (
  reconciliations: PacaReconciliation[],
  start: string,
  end: string
): PacaReconciliation[] =>
  reconciliations.filter((r) => r.startDate >= start && r.endDate <= end);

export interface CodeCostBreakdown {
  code: string;
  soldQuantity: number;
  costedQuantity: number;
  pendingQuantity: number;
  costedTotal: number; // Q, solo de la parte ya costeada
}

// Para cada código de prenda vendido en el rango, cuánto ya se costeó (según
// las reconciliaciones admin con sticker) y cuánto sigue pendiente. El costo
// de lo pendiente NO se estima — se deja fuera de la ganancia y se muestra
// aparte, para no mezclar un número exacto con uno adivinado.
export const getCostBreakdownByCode = (
  sales: Sale[],
  reconciliations: PacaReconciliation[],
  pacas: Paca[],
  start: string,
  end: string
): CodeCostBreakdown[] => {
  const inRangeRecon = getReconciliationsInRange(reconciliations, start, end);
  const pacaById = new Map(pacas.map((p) => [p.id, p]));

  return getDistinctCodesSold(sales).map((code) => {
    const soldQuantity = getSoldQuantityForCode(sales, code);
    let costedQuantity = 0;
    let costedTotal = 0;
    inRangeRecon
      .filter((r) => r.code === code)
      .forEach((r) => {
        r.allocations.forEach((a) => {
          costedQuantity += a.quantity;
          costedTotal += a.quantity * (pacaById.get(a.pacaId)?.unitCost || 0);
        });
      });

    // Nunca mostrar más prendas "costeadas" que las realmente vendidas en el
    // rango (por si una venta se editó/anuló después de haber costeado).
    const cappedCosted = Math.min(costedQuantity, soldQuantity);
    return {
      code,
      soldQuantity,
      costedQuantity: cappedCosted,
      pendingQuantity: Math.max(0, soldQuantity - cappedCosted),
      costedTotal: cappedCosted < costedQuantity ? costedTotal * (cappedCosted / Math.max(costedQuantity, 1)) : costedTotal,
    };
  });
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
//   Ingresos → costo de paca (solo lo ya costeado por sticker) → costos por
//   prenda → comisión de tarjeta → IVA de factura (tarjeta + transferencia) →
//   Ganancia neta → comisión de vendedora.
// Los gastos fijos/variables del periodo (Expenses) NO se incluyen aquí — se
// restan aparte, a nivel de todo el negocio, para llegar a la ganancia final.
export interface ProfitabilityBreakdown {
  revenue: number;
  itemsSold: number;
  itemsCosted: number; // prendas vendidas que ya tienen paca asignada (costeadas)
  itemsPending: number; // prendas vendidas sin costear todavía (no se les estima costo)
  cogsPaca: number; // costo de paca, solo de las prendas costeadas
  cogsUnitCosts: number; // planchado/empaque/etc., aplica a TODAS las prendas vendidas
  cardTotal: number;
  transferTotal: number;
  cardFee: number;
  invoiceTax: number;
  grossProfitAfterCogs: number; // revenue - cogsPaca - cogsUnitCosts
  netProfit: number; // grossProfitAfterCogs - cardFee - invoiceTax ("ganancia neta", base de la comisión)
  vendorCommission: number;
  profitAfterCommission: number; // netProfit - vendorCommission
}

export const calculateProfitability = (
  sales: Sale[],
  pacas: Paca[],
  reconciliations: PacaReconciliation[],
  settings: FinanceSettings,
  start: string,
  end: string
): ProfitabilityBreakdown => {
  const revenue = sales.reduce((acc, s) => acc + getSaleTotal(s), 0);
  const itemsSold = sales.reduce((acc, s) => acc + getSaleItemsCount(s), 0);

  const byCode = getCostBreakdownByCode(sales, reconciliations, pacas, start, end);
  const cogsPaca = byCode.reduce((acc, c) => acc + c.costedTotal, 0);
  const itemsCosted = byCode.reduce((acc, c) => acc + c.costedQuantity, 0);
  const itemsPending = byCode.reduce((acc, c) => acc + c.pendingQuantity, 0);

  const cogsUnitCosts = itemsSold * getUnitCostsTotal(settings.unitCosts || []);
  const cardTotal = getPaymentMethodTotal(sales, 'card');
  const transferTotal = getPaymentMethodTotal(sales, 'transfer');
  const cardFee = cardTotal * ((settings.cardCommissionPercent || 0) / 100);
  const invoiceTax = (cardTotal + transferTotal) * ((settings.invoiceTaxPercent || 0) / 100);
  const grossProfitAfterCogs = revenue - cogsPaca - cogsUnitCosts;
  const netProfit = grossProfitAfterCogs - cardFee - invoiceTax;
  // No se paga comisión sobre una pérdida — si el periodo cerró en negativo, la
  // comisión de la vendedora es Q0, no un número negativo.
  const vendorCommission = netProfit > 0 ? netProfit * ((settings.vendorCommissionPercent || 0) / 100) : 0;
  const profitAfterCommission = netProfit - vendorCommission;

  return {
    revenue,
    itemsSold,
    itemsCosted,
    itemsPending,
    cogsPaca,
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
  pacas: Paca[],
  reconciliations: PacaReconciliation[],
  settings: FinanceSettings,
  start: string,
  end: string
): SellerCommission[] =>
  getDistinctSellerEmails(sales)
    .map((email) => ({
      email,
      breakdown: calculateProfitability(sales.filter((s) => s.soldByEmail === email), pacas, reconciliations, settings, start, end),
    }))
    .sort((a, b) => b.breakdown.revenue - a.breakdown.revenue);
