import { Reservation, Lot, Sale, SaleItem, SalePayment, PaymentMethod, Customer } from './types';

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
