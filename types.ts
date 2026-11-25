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
  label: string; // ej. "ENE03" (lotes viejos) o "ROSADO 23/10" (sistema de colores)
  entryDate: string; // ISO string
  quantityIn: number;
  quantityRemaining: number;
  note?: string;
  // Sistema de lotes por color (ver LotColorSettings más abajo): color asignado
  // en el momento de registrar la entrega, según el ciclo configurado. Se
  // guarda aquí (no se recalcula después) para que el historial nunca cambie
  // aunque más adelante se edite el orden de colores. Los lotes de antes de
  // este sistema no lo tienen (quedan sin color, como "normal" para precios).
  color?: string;
  // Verificación cruzada: la vendedora confirma o reporta un problema con lo que llegó
  verificationStatus?: 'confirmed' | 'flagged'; // sin definir = pendiente de revisar
  verificationNote?: string; // razón cuando se marca "flagged"
  verifiedByEmail?: string;
  verifiedAt?: string;
}

// ---- Sistema de lotes por color (reemplaza la alerta verde/ámbar/rojo) ----
//
// Cada "día de cambios" (normalmente el viernes) entra un lote nuevo con un
// color fijo que se repite en ciclo (ROSADO, ROJO, AMARILLO...). El precio de
// cada prenda baja solo según cuántos días lleva en tienda ese lote: precio
// normal → primer descuento → descuento final → se saca de los estantes
// (liquidación/mayorista). Todo esto es editable desde "Ajustes de colores"
// (solo admin); las empleadas solo lo ven, no lo editan.
export type LotStage = 'normal' | 'first_discount' | 'final_discount' | 'pullout';

// Excepción manual a la fórmula de redondeo/piso (ej. Q35 normal baja a
// Q30/Q30 en vez del redondeo "de libro"), para los casos donde el cálculo
// automático no da el número exacto que se quiere usar en la tienda.
export interface ManualPriceException {
  normalPrice: number;
  firstDiscountPrice: number;
  finalDiscountPrice: number;
}

export interface LotColorSettings {
  firstLotDate: string; // YYYY-MM-DD — fecha del primer lote con color (ancla el ciclo)
  colors: string[]; // orden del ciclo, ej. ['ROSADO','ROJO','AMARILLO','PLATEADO','VERDE','AZUL']
  daysToFirstDiscount: number; // días en tienda para bajar al primer descuento (ej. 21)
  daysToFinalDiscount: number; // días en tienda para el descuento final (ej. 35)
  daysToPullout: number; // días en tienda para sacarlo de los estantes (ej. 42)
  firstDiscountPercent: number; // ej. 0.15
  finalDiscountPercent: number; // ej. 0.30
  roundTo: number; // redondear precios con descuento a múltiplos de esto (ej. 5)
  priceFloor: number; // ningún precio con descuento baja de aquí (ej. 35)
  manualExceptions: ManualPriceException[];
  // Precio plano (por prenda) al liquidar/vender por mayorista lo que sobra al
  // llegar a daysToPullout — no depende del precio normal de cada prenda.
  wholesalePrice: number;
  updatedByEmail?: string;
  updatedAt?: string;
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
  // Descuento en Quetzales aplicado a esta línea completa (ej. por desperfecto,
  // y/o el descuento automático del lote si se eligió uno — ver lotId).
  discount: number;
  // De qué lote/etiqueta específico es la prenda, cuando se eligió a mano
  // (Venta Nueva). Si no viene, el stock se descuenta por FIFO como antes
  // (ventas viejas y la venta detallada, que no pide elegir lote).
  lotId?: string;
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
  // 'wholesale' = liquidación de un lote que llegó a su día de "sacar de los
  // estantes" (sistema de lotes por color), vendido en bloque a precio de
  // mayorista. Sin este campo (o 'retail') es una venta normal de mostrador.
  saleKind?: 'retail' | 'wholesale';
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

// Precio por prenda (costo promedio de cada prenda comprada) — un solo valor
// general para todas las prendas, que reemplaza al antiguo catálogo de pacas.
// Cada vez que cambia, se agrega una entrada NUEVA al historial (nunca se edita
// ni se borra una anterior): así queda el registro de qué precio se usó y desde
// cuándo, y las ventas viejas siguen calculándose con el precio que regía ese día.
export interface GarmentPriceEntry {
  id: string;
  price: number; // Q por prenda
  effectiveDate: string; // YYYY-MM-DD — desde cuándo rige este precio
  note?: string; // ej. "Subió el precio de las pacas"
  createdByEmail: string;
  createdAt: string;
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
  // el precio por prenda, los costos por prenda, la comisión de tarjeta y el IVA).
  vendorCommissionPercent: number;
  // Costos fijos por cada prenda vendida (planchado, empaque, plástico, etc.)
  unitCosts: UnitCostItem[];
  updatedByEmail?: string;
  updatedAt?: string;
}
