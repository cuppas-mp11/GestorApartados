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

// ---- Fase 3: Costos, gastos y rentabilidad (visible SOLO para admin) ----

// Catálogo de "pacas" (paquetes de ropa comprados por precio y cantidad) —
// funciona como el catálogo de Inventario, pero para la materia prima: cada
// compra con un precio y una cantidad específicos genera (o reutiliza) un
// código de paca. Si se registra una compra con el MISMO precio y la MISMA
// cantidad que una paca que ya existe, no se crea un código nuevo — se agrega
// esa fecha al historial de compras de esa paca (`purchases`), porque se trata
// de la misma "referencia" de costo. Solo si las características son distintas
// se genera un código nuevo (PACA001, PACA002...).
export interface PacaPurchase {
  id: string;
  date: string; // YYYY-MM-DD, fecha en la que se compró esta vez
  createdByEmail: string;
  createdAt: string;
}

export interface Paca {
  id: string;
  code: string; // ej. "PACA001", auto-generado y consecutivo
  balePrice: number; // "Precio de paca"
  quantity: number; // cantidad de prendas que trae esta paca
  unitCost: number; // balePrice / quantity, ya calculado y guardado
  note?: string; // ej. "Blusas, proveedor Juana — sticker rojo"
  purchases: PacaPurchase[]; // historial de cada vez que se volvió a comprar esta misma paca
  createdByEmail: string;
  createdAt: string;
}

// Asignación manual de cuántas prendas (de un código, en un rango de fechas)
// salieron de cada paca — es la versión "costo" del pago combinado: la suma de
// las cantidades debe cuadrar exacto con el total vendido de ese código en ese
// rango.
export interface PacaAllocation {
  pacaId: string;
  pacaCode: string;
  quantity: number;
}

// Costeo semanal/mensual manual: como todavía no hay lector de código de
// barras, la única forma de saber de qué paca salió cada prenda vendida es que
// el admin revise las etiquetas físicas (diferenciadas por un sticker de
// color) que la vendedora le reporta, y reparta la cantidad vendida de cada
// código de prenda entre las pacas correspondientes. Cada reconciliación cubre
// UN código de prenda y UN rango de fechas (normalmente la semana del reporte).
export interface PacaReconciliation {
  id: string;
  code: string; // InventoryItem.code (ej. "PNT100")
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  totalQuantity: number; // cantidad vendida de ese código en ese rango (al momento de costear)
  allocations: PacaAllocation[]; // debe sumar exactamente totalQuantity
  createdByEmail: string;
  createdAt: string;
  updatedByEmail?: string;
  updatedAt?: string;
}

// Categoría de gasto definida por la usuaria (no una lista fija) — igual que el
// catálogo de Inventario o el de Pacas, se va armando con el tiempo: "Luz",
// "Internet", "Sticker", lo que haga falta, sin quedar forzado a meter todo en
// "Otro".
export interface ExpenseCategoryItem {
  id: string;
  label: string; // ej. "Luz", "Renta", "Sticker"
  createdByEmail: string;
  createdAt: string;
}

// "fixed" = gasto fijo (se repite normalmente cada mes, ej. renta) — solo para
// categorizar/filtrar en los reportes. "variable" = gasto que no es recurrente.
export type ExpenseFrequency = 'fixed' | 'variable';

// Gasto fijo o variable del negocio (renta, luz, planilla, etc.), para poder
// calcular la ganancia real y no solo lo que entra por ventas.
export interface Expense {
  id: string;
  date: string; // YYYY-MM-DD — a qué día/mes corresponde el gasto
  categoryId: string; // referencia a ExpenseCategoryItem.id
  frequency: ExpenseFrequency;
  amount: number;
  note?: string;
  // Si este gasto se generó confirmando una plantilla recurrente, queda la
  // referencia — así el sistema sabe que ya quedó cubierto ese mes.
  templateId?: string;
  createdByEmail: string;
  createdAt: string;
  // Rastro de edición (ya se puede corregir un gasto guardado, no solo borrarlo)
  editedAt?: string;
  editedByEmail?: string;
}

// Gasto fijo que se repite mes a mes (renta, planilla, internet...). No crea el
// gasto solo: cada mes aparece como "pendiente de confirmar" hasta que un admin
// lo confirma (pudiendo ajustar el monto si cambió) — así no hay que escribir
// categoría + monto + fecha desde cero cada vez, ni se corre el riesgo de
// olvidarlo un mes.
export interface ExpenseTemplate {
  id: string;
  categoryId: string;
  defaultAmount: number;
  note?: string;
  active: boolean; // se puede desactivar sin perder el historial de gastos que ya generó
  createdByEmail: string;
  createdAt: string;
}

// Costo chiquito que se suma a CADA prenda vendida (planchado, bolsa/empaque,
// plástico + etiqueta, etc.) al calcular la ganancia real — a diferencia de los
// `Expense` de arriba, este NO se registra como un monto del mes: el sistema lo
// multiplica solo por la cantidad de prendas vendidas en el rango. Editable en
// cualquier momento si cambia el precio (ej. suben las bolsas).
export interface UnitCostItem {
  id: string;
  label: string; // ej. "Planchado", "Empaque (bolsa)", "Plástico + etiqueta"
  amount: number; // Q por cada prenda vendida
}

// Configuración financiera general del negocio — un solo documento en Firestore,
// editable en cualquier momento (ej. si el banco cambia su tasa, o cambia el %
// de comisión de la vendedora de un mes a otro).
export interface FinanceSettings {
  // Comisión que cobra el procesador de tarjeta (ej. Visa) por cada transacción
  // — SOLO aplica a lo que se pagó con tarjeta.
  cardCommissionPercent: number; // ej. 5 significa 5%
  // IVA de la factura que se genera en pagos con tarjeta Y con transferencia/
  // depósito (en efectivo/otro no se genera factura, así que no aplica).
  invoiceTaxPercent: number;
  // % que recibe la vendedora sobre la ganancia neta del periodo (ya descontado
  // el costo de paca costeado, los costos por prenda, la comisión de tarjeta y el IVA).
  vendorCommissionPercent: number;
  // Costos fijos por cada prenda vendida (planchado, empaque, plástico, etc.)
  unitCosts: UnitCostItem[];
  updatedByEmail?: string;
  updatedAt?: string;
}
