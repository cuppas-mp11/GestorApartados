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
  category?: string; // ej. "Blusas", "Pantalones" — opcional, para agrupar y reportar
  basePrice: number;
}

// Cada entrega de mercadería genera uno o más "lotes" (uno por cada prenda/código
// que llegó ese día). Varios lotes pueden compartir el mismo "label" si llegaron
// en la misma entrega (ej. "ENE03").
export interface Lot {
  id: string;
  code: string;
  label: string; // ej. "ENE03"
  entryDate: string; // ISO string
  quantityIn: number;
  quantityRemaining: number;
  note?: string;
  // Verificación cruzada: la vendedora confirma o reporta un problema con lo que llegó
  verificationStatus?: 'confirmed' | 'flagged'; // sin definir = pendiente de revisar
  verificationNote?: string; // razón cuando se marca "flagged"
  verifiedByEmail?: string;
  verifiedAt?: string;
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

// Registro de qué lote(s) se descontaron para cubrir un apartado o una venta.
// Guardarlo permite devolver el stock exacto si el apartado se libera/elimina
// o si la venta se anula, sin tener que adivinar de qué lote salió.
export interface StockAllocation {
  lotId: string;
  code: string;
  quantity: number;
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
  // De qué lote(s) se descontó el stock al crear este apartado (Fase 2).
  // Si está vacío/ausente, es un apartado viejo de antes de Fase 2 (nunca descontó stock).
  stockAllocations?: StockAllocation[];
  // Se marca true una vez que el stock ya fue devuelto (al liberar o eliminar),
  // para no devolverlo dos veces.
  stockRestored?: boolean;
}

// ---- Fase 2: Ventas directas (mostrador) ----

export type PaymentMethod = 'cash' | 'transfer' | 'card' | 'other';

export enum SaleStatus {
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export interface SaleItem {
  id: string;
  garmentId: string;
  name: string;
  code: string;
  quantity: number;
  pricePerUnit: number;
  // Descuento en Quetzales aplicado a esta línea completa (ej. por desperfecto).
  discount: number;
}

export interface Sale {
  id: string;
  correlative: number;
  date: string; // ISO
  items: SaleItem[];
  paymentMethod: PaymentMethod;
  customerName?: string;
  note?: string;
  soldByEmail: string;
  status: SaleStatus;
  stockAllocations: StockAllocation[];
  cancelledAt?: string;
  cancelledByEmail?: string;
  cancelReason?: string;
}
