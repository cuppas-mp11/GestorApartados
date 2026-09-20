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
  // Saldo a favor (Fase 2.5): dinero de apartados vencidos que no se devuelve
  // en efectivo, sino que queda disponible para usarse como método de pago
  // en una venta futura. Si no existe el campo, se trata como 0.
  creditBalance?: number;
}

export type UserRole = 'admin' | 'employee';

export interface UserRoleDoc {
  role: UserRole;
  email: string;
  // Alias corto para mostrar en vez del correo completo (ej. "Vendió: Ana" en
  // vez de "Vendió: vestimentagt@gmail.com"). Se asigna a mano desde Firebase,
  // igual que el rol — ver GUIA_FIREBASE.md. Si no existe, se muestra el correo.
  alias?: string;
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
  // Fase 2.5: si este apartado VENCIÓ y al liberarlo ya tenía abono, ese monto
  // se acreditó como saldo a favor de la clienta. Queda registrado aquí para
  // que se vea en la tabla (y no se vuelva a acreditar si algo se reintenta).
  creditIssued?: boolean;
  creditAmount?: number;
}

// ---- Fase 2: Ventas directas (mostrador) ----

// "balance" = pago con saldo a favor de una clienta (Fase 2.5)
export type PaymentMethod = 'cash' | 'transfer' | 'card' | 'other' | 'balance';

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

// Fase 2.5: una venta puede pagarse combinando varios métodos
// (ej. Q50 en efectivo + Q25 con tarjeta). La suma de amount debe
// igualar el total de la venta.
export interface SalePayment {
  id: string;
  method: PaymentMethod;
  amount: number;
  // Solo si method === 'balance': de qué clienta se está descontando el saldo.
  customerId?: string;
  customerName?: string;
}

export interface Sale {
  id: string;
  correlative: number;
  date: string; // ISO
  items: SaleItem[];
  payments: SalePayment[];
  customerName?: string;
  // Clienta ligada a la venta (necesario cuando se paga con saldo).
  customerId?: string;
  note?: string;
  soldByEmail: string;
  status: SaleStatus;
  stockAllocations: StockAllocation[];
  cancelledAt?: string;
  cancelledByEmail?: string;
  cancelReason?: string;
  // true si se registró desde el modo rápido "Venta del día" (por grupos)
  quickEntry?: boolean;
  // Rastro de corrección (solo admin puede editar una venta ya guardada)
  editedAt?: string;
  editedByEmail?: string;
}

// ---- Fase 2.5: Saldo a favor de clientas ----

export type CreditTransactionType =
  | 'EARNED_EXPIRED_RESERVATION' // se generó al liberar un apartado vencido
  | 'USED_IN_SALE'                // se usó como método de pago en una venta
  | 'REFUND_CANCELLED_SALE'       // se devuelve porque se anuló una venta que lo usaba
  | 'MANUAL_ADJUSTMENT';          // admin corrige el saldo a mano

// Bitácora de movimientos de saldo — inmutable, para poder auditar de dónde
// salió o a dónde se fue cada quetzal de crédito.
export interface CreditTransaction {
  id: string;
  customerId: string;
  customerName: string;
  type: CreditTransactionType;
  amount: number; // positivo = se abona saldo, negativo = se descuenta/usa
  date: string;
  reservationId?: string;
  saleId?: string;
  note?: string;
  createdByEmail: string;
}
