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

// ---- Generación de código de cliente centralizada (antes duplicada en App.tsx y ReservationForm.tsx) ----

export const getOrAssignCustomerCode = (
  customerName: string,
  existingReservations: Reservation[]
): string => {
  const existing = existingReservations.find((r) => r.customerName === customerName);
  if (existing) return existing.customerCode;

  const codes = existingReservations
    .map((r) => r.customerCode)
    .filter((c) => c && c.startsWith('C'));
  const lastNum = codes.length > 0 ? Math.max(...codes.map((c) => parseInt(c.substring(1)) || 0)) : 0;
  return `C${String(lastNum + 1).padStart(3, '0')}`;
};
