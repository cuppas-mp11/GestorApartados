export enum ReservationStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  CANCELLED = 'CANCELLED',
  DELETED = 'DELETED' // Archivado (antes se borraba para siempre; ahora queda en el historial)
}

export interface Customer {
  id: string;
  code: string;
  name: string;
  phone: string;
}

export type UserRole = 'admin' | 'employee';

export interface UserRoleDoc {
  role: UserRole;
  email: string;
}

// Registro de correcciones a un apartado (quién cambió qué y cuándo)
export interface EditLogEntry {
  id: string;
  reservationId: string;
  field: string;
  oldValue: string;
  newValue: string;
  editedByEmail: string;
  editedAt: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  code: string;
  basePrice: number;
}

export interface ReservationItem {
  id: string;
  garmentId: string;
  name: string;
  code: string;
  quantity: number;
  pricePerUnit: number;
}

export interface Payment {
  id: string;
  date: string;
  amount: number;
  note?: string;
}

export interface Reservation {
  id: string;
  correlative: number;
  customerName: string;
  customerCode: string;
  phoneNumber: string;
  items: ReservationItem[];
  date: string;
  status: ReservationStatus;
  depositAmount: number;
  payments: Payment[];
  // Rastro de archivado (soft-delete)
  deletedAt?: string;
  deletedByEmail?: string;
  // Rastro de última corrección manual
  lastEditedAt?: string;
  lastEditedByEmail?: string;
}
