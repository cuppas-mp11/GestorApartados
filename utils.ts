import { Reservation } from './types';

// Plazo de vencimiento centralizado (antes estaba repetido en 3 archivos distintos)
export const DEADLINE_DAYS = 15;

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

// ---- Sistema de Lotes / Rotación de mercadería ----

const MONTH_ABBR = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

// Genera la siguiente etiqueta de lote (ej. "ENE03") basada en el mes actual.
// La numeración reinicia cada mes.
export const getNextLotLabel = (existingLabels: string[]): string => {
  const abbr = MONTH_ABBR[new Date().getMonth()];
  const nums = existingLabels
    .filter((l) => l.startsWith(abbr))
    .map((l) => parseInt(l.slice(3)) || 0);
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return `${abbr}${String(next).padStart(2, '0')}`;
};

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
