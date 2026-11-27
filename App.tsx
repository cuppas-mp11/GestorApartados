import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  updateDoc,
  runTransaction,
  arrayUnion,
  getDocs,
  writeBatch,
} from 'firebase/firestore';
import { auth, db } from './firebase';
import {
  Reservation,
  ReservationStatus,
  InventoryItem,
  Payment,
  UserRole,
  EditLogEntry,
  Customer,
  Lot,
  Sale,
  SaleStatus,
  StockAllocation,
  CreditTransaction,
  DailyClosing,
  CashPurchase,
  ReservationRenewal,
  ReservationRenewalLine,
  GarmentPriceEntry,
  Expense,
  ExpenseCategoryItem,
  ExpenseFrequency,
  ExpenseTemplate,
  FinanceSettings,
  LotColorSettings,
} from './types';
import { ReservationForm } from './components/ReservationForm';
import { ReservationTable } from './components/ReservationTable';
import { Stats } from './components/Stats';
import { InventoryManager } from './components/InventoryManager';
import { StockEntryForm } from './components/StockEntryForm';
import { LotsPanel } from './components/LotsPanel';
import { CustomerManager } from './components/CustomerManager';
import { CustomerBalances } from './components/CustomerBalances';
import { ExportMenu } from './components/ExportMenu';
import { GarmentPriceCard } from './components/GarmentPriceCard';
import { ConfirmHost, confirmDialog, infoDialog } from './components/ConfirmDialog';
import { DailyClosingButton } from './components/DailyClosingButton';
import { AbonosApartadosCard } from './components/AbonosApartadosCard';
import { RenewalNotice } from './components/RenewalNotice';
import { RenewedItemsPanel } from './components/RenewedItemsPanel';
import { ReservationAlerts } from './components/ReservationAlerts';
import { PurchasesPanel } from './components/PurchasesPanel';
import { ClosingsPanel } from './components/ClosingsPanel';
import { ExpensesPanel } from './components/ExpensesPanel';
import { FinanceSettingsCard } from './components/FinanceSettingsCard';
import { ProfitabilitySummary } from './components/ProfitabilitySummary';
import { DataResetPanel } from './components/DataResetPanel';
import { LotColorSettingsCard } from './components/LotColorSettingsCard';
import { InventoryCatalogTable } from './components/InventoryCatalogTable';
import { QuickSaleForm } from './components/QuickSaleForm';
import { EditSaleModal } from './components/EditSaleModal';
import { SalesHistory } from './components/SalesHistory';
import { SalesStats } from './components/SalesStats';
import { TodaySalesHistory } from './components/TodaySalesHistory';
import { SalesExportMenu } from './components/SalesExportMenu';
import { Login } from './components/Login';
import { Sidebar, Page } from './components/Sidebar';
import {
  isOverdue,
  generateId,
  getTotalPrice,
  getTotalPaid,
  getBalance,
  getNextCustomerCode,
  getDayClosingTotals,
  getPreviousClosing,
  getCashSalesSince,
  getPurchasesSince,
  getReservationCashSince,
  getLatestLot,
  getReservationAlerts,
  getEffectivePriceForLot,
  getLotStage,
  getStageInfo,
  getPettyCashSnapshot,
  aggregateStockNeeds,
  getCandidateLotsForCode,
  formatCurrency,
  normalizeSale,
  getLocalDateStr,
  isSameLocalDay,
  DEFAULT_LOT_COLOR_SETTINGS,
} from './utils';

const RESERVATIONS_COLLECTION = 'reservations';
const INVENTORY_COLLECTION = 'inventory';
const CUSTOMERS_COLLECTION = 'customers';
const LOTS_COLLECTION = 'lots';
const SALES_COLLECTION = 'sales';
const CREDIT_LEDGER_COLLECTION = 'creditLedger';
const DAILY_CLOSINGS_COLLECTION = 'dailyClosings';
const CASH_PURCHASES_COLLECTION = 'cashPurchases';
const LOT_COLOR_SETTINGS_COLLECTION = 'lotColorSettings';
const LOT_COLOR_SETTINGS_DOC_ID = 'config';
const GARMENT_PRICE_DOC_ID = 'garmentPrice'; // settings/garmentPrice: historial de Precio por prenda
const EXPENSE_CATEGORIES_COLLECTION = 'expenseCategories';
const EXPENSE_TEMPLATES_COLLECTION = 'expenseTemplates';
const EXPENSES_COLLECTION = 'expenses';
const SETTINGS_COLLECTION = 'settings';
const FINANCE_SETTINGS_DOC_ID = 'finance';
const DEFAULT_FINANCE_SETTINGS: FinanceSettings = {
  cardCommissionPercent: 0,
  invoiceTaxPercent: 0,
  vendorCommissionPercent: 0,
  unitCosts: [],
};

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [role, setRole] = useState<UserRole | null>(null);
  const [roleLoading, setRoleLoading] = useState(true);

  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [lots, setLots] = useState<Lot[]>([]);
  const [lotColorSettings, setLotColorSettings] = useState<LotColorSettings>(DEFAULT_LOT_COLOR_SETTINGS);
  const [sales, setSales] = useState<Sale[]>([]);
  const [creditLedger, setCreditLedger] = useState<CreditTransaction[]>([]);
  const [closings, setClosings] = useState<DailyClosing[]>([]);
  const [renewalNotice, setRenewalNotice] = useState<{ res: Reservation; renewal: ReservationRenewal } | null>(null);
  const [purchases, setPurchases] = useState<CashPurchase[]>([]);
  const [garmentPrices, setGarmentPrices] = useState<GarmentPriceEntry[]>([]);
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategoryItem[]>([]);
  const [expenseTemplates, setExpenseTemplates] = useState<ExpenseTemplate[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [financeSettings, setFinanceSettings] = useState<FinanceSettings>(DEFAULT_FINANCE_SETTINGS);
  const [dataLoading, setDataLoading] = useState(true);
  const [filter, setFilter] = useState<'ALL' | 'OVERDUE' | 'PENDING' | 'PAID' | 'CANCELLED' | 'DELETED'>('ALL');

  const [page, setPage] = useState<Page>('inicio');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [saleMode, setSaleMode] = useState<'quick' | 'history'>('quick');
  // Para la vendedora el Resumen del día va hasta abajo y oculto por
  // seguridad (su pantalla puede estar a la vista de otras personas) — el
  // admin siempre lo ve, así que este estado solo aplica a su vista.
  const [showSalesStatsForEmployee, setShowSalesStatsForEmployee] = useState(false);
  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  const [aliases, setAliases] = useState<Record<string, string>>({});
  const [resetBusy, setResetBusy] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Leer el rol del usuario actual (admin / employee) desde la colección "roles"
  useEffect(() => {
    if (!user) {
      setRole(null);
      return;
    }
    setRoleLoading(true);
    const unsubRole = onSnapshot(
      doc(db, 'roles', user.uid),
      (snap) => {
        if (snap.exists()) {
          setRole((snap.data().role as UserRole) || 'employee');
        } else {
          setRole('employee');
        }
        setRoleLoading(false);
      },
      () => {
        setRole('employee');
        setRoleLoading(false);
      }
    );
    return () => unsubRole();
  }, [user]);

  // Alias de cada correo (asignados a mano en Firebase, colección "roles"), para
  // mostrar "Vendió: Ana" en vez del correo completo en toda la app.
  useEffect(() => {
    if (!user) return;
    const unsubAliases = onSnapshot(
      collection(db, 'roles'),
      (snapshot) => {
        const map: Record<string, string> = {};
        snapshot.docs.forEach((d) => {
          const data = d.data() as { email?: string; alias?: string; Alias?: string };
          // Acepta "alias" o "Alias" (por si en Firebase se escribió con mayúscula),
          // para que no dependa de cómo se haya tecleado el nombre del campo.
          const aliasValue = data.alias || data.Alias;
          if (data.email && aliasValue) map[data.email] = aliasValue;
        });
        setAliases(map);
      },
      (error) => console.error('Error leyendo alias:', error)
    );
    return () => unsubAliases();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    setDataLoading(true);

    const unsubReservations = onSnapshot(
      collection(db, RESERVATIONS_COLLECTION),
      (snapshot) => {
        const data = snapshot.docs.map((d) => d.data() as Reservation);
        data.sort((a, b) => b.correlative - a.correlative);
        setReservations(data);
        setDataLoading(false);
      },
      (error) => {
        console.error('Error leyendo reservaciones:', error);
        setDataLoading(false);
      }
    );

    const unsubInventory = onSnapshot(
      collection(db, INVENTORY_COLLECTION),
      (snapshot) => {
        setInventory(snapshot.docs.map((d) => d.data() as InventoryItem));
      },
      (error) => console.error('Error leyendo inventario:', error)
    );

    const unsubCustomers = onSnapshot(
      collection(db, CUSTOMERS_COLLECTION),
      (snapshot) => {
        setCustomers(snapshot.docs.map((d) => d.data() as Customer));
      },
      (error) => console.error('Error leyendo clientes:', error)
    );

    const unsubLots = onSnapshot(
      collection(db, LOTS_COLLECTION),
      (snapshot) => {
        setLots(snapshot.docs.map((d) => d.data() as Lot));
      },
      (error) => console.error('Error leyendo lotes:', error)
    );

    const unsubSales = onSnapshot(
      collection(db, SALES_COLLECTION),
      (snapshot) => {
        const data = snapshot.docs.map((d) => normalizeSale(d.data()));
        data.sort((a, b) => b.correlative - a.correlative);
        setSales(data);
      },
      (error) => console.error('Error leyendo ventas:', error)
    );

    const unsubCreditLedger = onSnapshot(
      collection(db, CREDIT_LEDGER_COLLECTION),
      (snapshot) => {
        const data = snapshot.docs.map((d) => d.data() as CreditTransaction);
        data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setCreditLedger(data);
      },
      (error) => console.error('Error leyendo saldos:', error)
    );

    const unsubClosings = onSnapshot(
      collection(db, DAILY_CLOSINGS_COLLECTION),
      (snapshot) => setClosings(snapshot.docs.map((d) => d.data() as DailyClosing)),
      (error) => console.error('Error leyendo cierres del día:', error)
    );

    const unsubPurchases = onSnapshot(
      collection(db, CASH_PURCHASES_COLLECTION),
      (snapshot) => {
        const data = snapshot.docs.map((d) => d.data() as CashPurchase);
        data.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
        setPurchases(data);
      },
      (error) => console.error('Error leyendo compras:', error)
    );

    // Configuración de colores de lotes: cualquier usuario autenticado la lee
    // (la vendedora la necesita para saber a qué precio vender), pero solo un
    // admin puede cambiarla (ver GUIA_FIREBASE.md).
    const unsubLotColorSettings = onSnapshot(
      doc(db, LOT_COLOR_SETTINGS_COLLECTION, LOT_COLOR_SETTINGS_DOC_ID),
      (snap) => setLotColorSettings(snap.exists() ? (snap.data() as LotColorSettings) : DEFAULT_LOT_COLOR_SETTINGS),
      (error) => console.error('Error leyendo configuración de colores de lotes:', error)
    );

    return () => {
      unsubReservations();
      unsubPurchases();
      unsubInventory();
      unsubCustomers();
      unsubLots();
      unsubSales();
      unsubCreditLedger();
      unsubClosings();
      unsubLotColorSettings();
    };
  }, [user]);

  // Fase 3 — Costos, gastos y rentabilidad: colecciones visibles SOLO para admin.
  // Las reglas de Firestore ya lo exigen (ver GUIA_FIREBASE.md); aquí además
  // evitamos intentar suscribirse si el usuario no es admin, para no generar
  // errores de "permiso denegado" en la consola de una empleada.
  useEffect(() => {
    if (!user || role !== 'admin') {
      setGarmentPrices([]);
      setExpenseCategories([]);
      setExpenseTemplates([]);
      setExpenses([]);
      setFinanceSettings(DEFAULT_FINANCE_SETTINGS);
      return;
    }

    const unsubGarmentPrices = onSnapshot(
      doc(db, SETTINGS_COLLECTION, GARMENT_PRICE_DOC_ID),
      (snap) => setGarmentPrices(snap.exists() ? ((snap.data().entries || []) as GarmentPriceEntry[]) : []),
      (error) => console.error('Error leyendo precio por prenda:', error)
    );

    const unsubExpenseCategories = onSnapshot(
      collection(db, EXPENSE_CATEGORIES_COLLECTION),
      (snapshot) => setExpenseCategories(snapshot.docs.map((d) => d.data() as ExpenseCategoryItem)),
      (error) => console.error('Error leyendo categorías de gasto:', error)
    );

    const unsubExpenseTemplates = onSnapshot(
      collection(db, EXPENSE_TEMPLATES_COLLECTION),
      (snapshot) => setExpenseTemplates(snapshot.docs.map((d) => d.data() as ExpenseTemplate)),
      (error) => console.error('Error leyendo plantillas de gasto:', error)
    );

    const unsubExpenses = onSnapshot(
      collection(db, EXPENSES_COLLECTION),
      (snapshot) => setExpenses(snapshot.docs.map((d) => d.data() as Expense)),
      (error) => console.error('Error leyendo gastos:', error)
    );

    const unsubSettings = onSnapshot(
      doc(db, SETTINGS_COLLECTION, FINANCE_SETTINGS_DOC_ID),
      (snap) => setFinanceSettings(snap.exists() ? (snap.data() as FinanceSettings) : DEFAULT_FINANCE_SETTINGS),
      (error) => console.error('Error leyendo configuración financiera:', error)
    );

    return () => {
      unsubGarmentPrices();
      unsubExpenseCategories();
      unsubExpenseTemplates();
      unsubExpenses();
      unsubSettings();
    };
  }, [user, role]);

  // ---- Motor de stock (Fase 2) ----
  // Descuenta stock de los lotes más antiguos primero (FIFO), dentro de una
  // transacción de Firestore para que dos ventas/apartados simultáneos no
  // puedan "vender" la misma prenda dos veces. Si no alcanza, no escribe nada
  // y lanza un error con el mensaje para mostrarle a quien está vendiendo.
  const allocateAndDecrementStock = async (
    needs: { code: string; quantity: number }[]
  ): Promise<StockAllocation[]> => {
    const aggregated = aggregateStockNeeds(needs);
    let allocations: StockAllocation[] = [];

    await runTransaction(db, async (transaction) => {
      allocations = [];
      const updates: { ref: ReturnType<typeof doc>; newRemaining: number }[] = [];

      for (const need of aggregated) {
        const candidates = getCandidateLotsForCode(need.code, lots);
        let remaining = need.quantity;

        for (const lot of candidates) {
          if (remaining <= 0) break;
          const ref = doc(db, LOTS_COLLECTION, lot.id);
          const snap = await transaction.get(ref);
          if (!snap.exists()) continue;
          const fresh = snap.data() as Lot;
          const take = Math.min(fresh.quantityRemaining, remaining);
          if (take > 0) {
            updates.push({ ref, newRemaining: fresh.quantityRemaining - take });
            allocations.push({ lotId: lot.id, code: need.code, quantity: take });
            remaining -= take;
          }
        }

        if (remaining > 0) {
          const item = inventory.find((i) => i.code === need.code);
          const available = need.quantity - remaining;
          throw new Error(
            `No hay suficiente stock de "${item?.name || need.code}". Disponible: ${available}, se necesitaban ${need.quantity}.`
          );
        }
      }

      for (const u of updates) {
        transaction.update(u.ref, { quantityRemaining: u.newRemaining });
      }
    });

    return allocations;
  };

  // Descuenta stock de lotes ELEGIDOS a mano (apartados con lote). Una sola
  // transacción: si algún lote ya no tiene suficiente, no se descuenta nada.
  const allocateFromChosenLots = async (
    needs: { lotId: string; code: string; quantity: number }[]
  ): Promise<StockAllocation[]> => {
    const byLot = new Map<string, { code: string; quantity: number }>();
    for (const n of needs) {
      const cur = byLot.get(n.lotId) || { code: n.code, quantity: 0 };
      cur.quantity += n.quantity;
      byLot.set(n.lotId, cur);
    }
    const allocations: StockAllocation[] = [];
    await runTransaction(db, async (transaction) => {
      allocations.length = 0;
      const writes: { ref: ReturnType<typeof doc>; newRemaining: number }[] = [];
      for (const [lotId, need] of byLot) {
        const ref = doc(db, LOTS_COLLECTION, lotId);
        const snap = await transaction.get(ref);
        if (!snap.exists()) throw new Error('El lote elegido ya no existe. Vuelve a elegir el lote.');
        const lot = snap.data() as Lot;
        if (lot.quantityRemaining < need.quantity) {
          throw new Error(`No hay suficiente stock en el lote ${lot.label}. Disponible: ${lot.quantityRemaining}, se necesitaban ${need.quantity}.`);
        }
        writes.push({ ref, newRemaining: lot.quantityRemaining - need.quantity });
        allocations.push({ lotId, code: need.code, quantity: need.quantity });
      }
      for (const w of writes) transaction.update(w.ref, { quantityRemaining: w.newRemaining });
    });
    return allocations;
  };

  // Devuelve stock a los lotes de origen (al liberar/eliminar un apartado o
  // anular una venta). Si algún lote ya no existe (fue borrado por un admin),
  // simplemente se omite esa porción.
  const restoreStock = async (allocations?: StockAllocation[]) => {
    if (!allocations || allocations.length === 0) return;
    await runTransaction(db, async (transaction) => {
      const refs = allocations.map((a) => doc(db, LOTS_COLLECTION, a.lotId));
      const snaps = await Promise.all(refs.map((r) => transaction.get(r)));
      snaps.forEach((snap, idx) => {
        if (!snap.exists()) return;
        const fresh = snap.data() as Lot;
        transaction.update(refs[idx], { quantityRemaining: fresh.quantityRemaining + allocations[idx].quantity });
      });
    });
  };

  // Antes de guardar el apartado, asegura que exista un perfil de cliente
  // (o lo actualiza si el teléfono cambió), y le asigna el código correcto.
  const addReservation = async (reservation: Reservation) => {
    const trimmedName = reservation.customerName.trim();
    const existing = customers.find(
      (c) => c.name.trim().toLowerCase() === trimmedName.toLowerCase()
    );

    let customerCode: string;
    if (existing) {
      customerCode = existing.code;
      if (existing.phone !== reservation.phoneNumber) {
        await updateDoc(doc(db, CUSTOMERS_COLLECTION, existing.id), { phone: reservation.phoneNumber });
      }
    } else {
      customerCode = getNextCustomerCode(customers);
      const newCustomer: Customer = {
        id: generateId(),
        code: customerCode,
        name: trimmedName,
        phone: reservation.phoneNumber,
      };
      await setDoc(doc(db, CUSTOMERS_COLLECTION, newCustomer.id), newCustomer);
    }

    // Descuenta el stock de las prendas apartadas (lanza error si no alcanza,
    // y en ese caso no se guarda el apartado — ReservationForm muestra el aviso).
    // Las prendas con lote elegido salen de ESE lote; las que no traen lote
    // (datos viejos) siguen el FIFO de siempre.
    const chosen = reservation.items.filter((it) => it.lotId);
    const noLot = reservation.items.filter((it) => !it.lotId);
    const stockAllocations: StockAllocation[] = [];
    if (chosen.length > 0) {
      stockAllocations.push(
        ...(await allocateFromChosenLots(chosen.map((it) => ({ lotId: it.lotId as string, code: it.code, quantity: it.quantity }))))
      );
    }
    if (noLot.length > 0) {
      try {
        stockAllocations.push(...(await allocateAndDecrementStock(noLot.map((it) => ({ code: it.code, quantity: it.quantity })))));
      } catch (err) {
        await restoreStock(stockAllocations); // no dejar stock descontado si el apartado no se guarda
        throw err;
      }
    }

    await setDoc(doc(db, RESERVATIONS_COLLECTION, reservation.id), {
      ...reservation,
      customerName: trimmedName,
      customerCode,
      stockAllocations,
    });
  };

  const updateCustomer = async (id: string, updates: { name?: string; phone?: string }) => {
    await updateDoc(doc(db, CUSTOMERS_COLLECTION, id), updates);
  };

  const deleteCustomer = async (id: string) => {
    await deleteDoc(doc(db, CUSTOMERS_COLLECTION, id));
  };

  const addStockEntry = async (newLots: Lot[]) => {
    for (const lot of newLots) {
      await setDoc(doc(db, LOTS_COLLECTION, lot.id), lot);
    }
  };

  const deleteLot = async (id: string) => {
    if (role !== 'admin') {
      alert('Solo un administrador puede eliminar lotes.');
      return;
    }
    await deleteDoc(doc(db, LOTS_COLLECTION, id));
  };

  const verifyLot = async (id: string, status: 'confirmed' | 'flagged' | 'pending', note?: string) => {
    await updateDoc(doc(db, LOTS_COLLECTION, id), {
      verificationStatus: status,
      verificationNote: status === 'flagged' ? (note || '') : '',
      verifiedByEmail: user?.email || 'desconocido',
      verifiedAt: new Date().toISOString(),
    });
  };

  const correctLotQuantity = async (id: string, newQuantityIn: number, newQuantityRemaining: number) => {
    if (role !== 'admin') {
      alert('Solo un administrador puede corregir cantidades.');
      return;
    }
    await updateDoc(doc(db, LOTS_COLLECTION, id), {
      quantityIn: newQuantityIn,
      quantityRemaining: newQuantityRemaining,
      verificationStatus: 'confirmed',
      verificationNote: '',
      verifiedByEmail: user?.email || 'desconocido',
      verifiedAt: new Date().toISOString(),
    });
  };

  // Libera un apartado (lo cancela).
  // - Si estaba VENCIDO, las prendas NO vuelven a su lote original: pasan al lote
  //   más reciente (segunda oportunidad desde cero, al precio de ese lote) y queda
  //   un registro en el apartado (`renewal`) para que la vendedora cambie la etiqueta.
  // - Si no estaba vencido (la clienta canceló antes), el stock vuelve a su lote de origen.
  // - Si estaba VENCIDO y ya tenía algo abonado, ese abono se acredita como saldo a
  //   favor de la clienta (no se devuelve en efectivo).
  // Todo en una sola transacción para que nunca quede "a medias".
  const releaseReservation = async (res: Reservation): Promise<ReservationRenewal | null> => {
    const wasOverdue = isOverdue(res.date);
    const totalPaid = getTotalPaid(res);
    const shouldCredit = wasOverdue && totalPaid > 0;
    const customerMatch = shouldCredit ? customers.find((c) => c.code === res.customerCode) : undefined;
    const customerRef = customerMatch ? doc(db, CUSTOMERS_COLLECTION, customerMatch.id) : null;
    const hasStock = !res.stockRestored && !!res.stockAllocations?.length;
    const allocations = hasStock ? res.stockAllocations! : [];
    const latest = wasOverdue && hasStock ? getLatestLot(lots) : undefined;
    let renewal = null as ReservationRenewal | null;

    await runTransaction(db, async (transaction) => {
      renewal = null;
      // ---- lecturas ----
      const lotIds = Array.from(new Set([...allocations.map((a) => a.lotId), ...(latest ? [latest.id] : [])]));
      const fresh = new Map<string, Lot>();
      for (const id of lotIds) {
        const snap = await transaction.get(doc(db, LOTS_COLLECTION, id));
        if (snap.exists()) fresh.set(id, snap.data() as Lot);
      }
      let freshCustomer: Customer | null = null;
      if (customerRef) {
        const snap = await transaction.get(customerRef);
        if (snap.exists()) freshCustomer = snap.data() as Customer;
      }

      // ---- escrituras ----
      const reservationUpdates: Record<string, unknown> = { status: ReservationStatus.CANCELLED };

      const delta = new Map<string, { remaining: number; qtyIn: number }>();
      const bump = (id: string, remaining: number, qtyIn: number) => {
        const cur = delta.get(id) || { remaining: 0, qtyIn: 0 };
        cur.remaining += remaining;
        cur.qtyIn += qtyIn;
        delta.set(id, cur);
      };
      const latestFresh = latest ? fresh.get(latest.id) : undefined;
      let movedQty = 0;
      for (const a of allocations) {
        if (!fresh.has(a.lotId)) continue; // el lote de origen ya no existe
        if (latestFresh && a.lotId !== latestFresh.id) {
          bump(a.lotId, 0, -a.quantity); // la prenda deja de contar en su lote de origen...
          movedQty += a.quantity;
        } else {
          bump(a.lotId, a.quantity, 0); // ...o vuelve a su lote normalmente
        }
      }
      if (latestFresh && movedQty > 0) {
        bump(latestFresh.id, movedQty, movedQty); // ...y pasa al lote más reciente
        const stage = latestFresh.color ? getLotStage(latestFresh.entryDate, lotColorSettings) : 'normal';
        const lines: ReservationRenewalLine[] = res.items
          .filter((it) => it.lotId !== latestFresh.id)
          .map((it) => {
            const base = inventory.find((g) => g.id === it.garmentId)?.basePrice ?? it.basePrice ?? it.pricePerUnit;
            return {
              code: it.code,
              name: it.name,
              quantity: it.quantity,
              ...(it.lotLabel ? { fromLotLabel: it.lotLabel } : {}),
              newPrice: getEffectivePriceForLot(latestFresh, base, lotColorSettings),
            };
          });
        renewal = {
          at: new Date().toISOString(),
          byEmail: user?.email || 'desconocido',
          toLotId: latestFresh.id,
          toLotLabel: latestFresh.label,
          ...(latestFresh.color ? { toLotColor: latestFresh.color } : {}),
          toLotStageLabel: latestFresh.color ? getStageInfo(stage).label : 'Precio normal',
          toLotIsFresh: stage === 'normal',
          lines,
        };
        reservationUpdates.renewal = renewal;
      }
      for (const [id, d] of delta) {
        const f = fresh.get(id)!;
        transaction.update(doc(db, LOTS_COLLECTION, id), {
          quantityRemaining: f.quantityRemaining + d.remaining,
          ...(d.qtyIn !== 0 ? { quantityIn: f.quantityIn + d.qtyIn } : {}),
        });
      }
      if (hasStock) reservationUpdates.stockRestored = true;

      if (customerRef && freshCustomer && customerMatch) {
        const newBalance = (freshCustomer.creditBalance || 0) + totalPaid;
        transaction.update(customerRef, { creditBalance: newBalance });

        const ledgerRef = doc(db, CREDIT_LEDGER_COLLECTION, generateId());
        const ledgerEntry: CreditTransaction = {
          id: ledgerRef.id,
          customerId: customerMatch.id,
          customerName: customerMatch.name,
          type: 'EARNED_EXPIRED_RESERVATION',
          amount: totalPaid,
          date: new Date().toISOString(),
          reservationId: res.id,
          note: `Apartado #${res.correlative} venció y se liberó`,
          createdByEmail: user?.email || 'desconocido',
        };
        transaction.set(ledgerRef, ledgerEntry);

        reservationUpdates.creditIssued = true;
        reservationUpdates.creditAmount = totalPaid;
      }

      transaction.update(doc(db, RESERVATIONS_COLLECTION, res.id), reservationUpdates);
    });
    return renewal;
  };

  // La vendedora confirma que ya cambió la etiqueta física de las prendas renovadas.
  const markLabelsDone = async (resId: string) => {
    await updateDoc(doc(db, RESERVATIONS_COLLECTION, resId), {
      'renewal.labelsDone': true,
      'renewal.labelsDoneAt': new Date().toISOString(),
      'renewal.labelsDoneByEmail': user?.email || 'desconocido',
    });
  };

  // Nombres de los lotes de donde salió el stock de un apartado (para avisar a dónde vuelve).
  const originLotNames = (res: Reservation): string =>
    Array.from(new Set((res.stockAllocations || []).map((a) => lots.find((l) => l.id === a.lotId)?.label || a.code))).join(', ');

  const updateStatus = async (id: string, status: ReservationStatus) => {
    const res = reservations.find((r) => r.id === id);
    const pendingBalance = res ? getBalance(res) : 0;

    let label = status === ReservationStatus.PAID
      ? (pendingBalance > 0.005
          ? `LIQUIDAR este apartado.\n\nSe registrará el pago del saldo pendiente (${formatCurrency(pendingBalance)}, en efectivo) y quedará en la caja del día`
          : 'marcar este apartado como LIQUIDADO')
      : 'LIBERAR la prenda (cancelar este apartado)';

    if (status === ReservationStatus.CANCELLED && res) {
      const wasOverdue = isOverdue(res.date);
      const totalPaid = getTotalPaid(res);
      if (wasOverdue && totalPaid > 0) {
        label += `.\n\nComo el apartado ya venció y la clienta había abonado ${formatCurrency(totalPaid)}, ese monto se le acreditará como SALDO A FAVOR (no se devuelve en efectivo)`;
      }
      if (wasOverdue && res.stockAllocations?.length && !res.stockRestored) {
        label += `.\n\nComo el apartado venció, las prendas pasarán al LOTE MÁS RECIENTE para tener una segunda oportunidad (se te dirá a cuál y qué etiqueta cambiar)`;
      }
    }

    if (!(await confirmDialog(`¿Confirmas que deseas ${label}?`, { danger: status === ReservationStatus.CANCELLED }))) return;

    if (status === ReservationStatus.CANCELLED && res) {
      try {
        const hadStock = !res.stockRestored && !!res.stockAllocations?.length;
        const renewal = await releaseReservation(res);
        if (renewal) setRenewalNotice({ res, renewal });
        else if (hadStock) {
          await infoDialog(`Apartado #${res.correlative} liberado.\n\nComo todavía no estaba vencido, las prendas volvieron a su lote de origen: ${originLotNames(res)}.\nNo hay que cambiar etiquetas.`, { title: 'Prenda liberada' });
        } else {
          await infoDialog(`Apartado #${res.correlative} liberado.\n\nEste apartado es antiguo y no tenía lote registrado, así que no se movió stock.`, { title: 'Prenda liberada' });
        }
      } catch (err) {
        console.error('Error liberando el apartado:', err);
        alert('No se pudo liberar el apartado. Intenta de nuevo.');
      }
      return;
    }

    // Liquidar = registrar el pago del saldo pendiente (así entra a la caja y el saldo queda en 0).
    if (status === ReservationStatus.PAID && res && pendingBalance > 0.005) {
      await addPayment(id, pendingBalance, 'Liquidación');
      return;
    }

    await updateDoc(doc(db, RESERVATIONS_COLLECTION, id), { status });
  };

  const addPayment = async (id: string, amount: number, note: string = 'Abono extra') => {
    const res = reservations.find((r) => r.id === id);
    if (!res) return;

    const newPayment: Payment = { id: generateId(), date: new Date().toISOString(), amount, note };
    const updatedPayments = [...(res.payments || []), newPayment];

    const totalItemsPrice = getTotalPrice(res);
    const totalPaid = updatedPayments.reduce((acc, p) => acc + p.amount, 0);

    await updateDoc(doc(db, RESERVATIONS_COLLECTION, id), {
      payments: updatedPayments,
      status: totalPaid >= totalItemsPrice ? ReservationStatus.PAID : res.status,
    });
  };

  const deleteReservation = async (id: string) => {
    if (role !== 'admin') {
      alert('Solo un administrador puede eliminar registros.');
      return;
    }
    if (!(await confirmDialog('¿Estás seguro de que deseas eliminar este registro? Pasará al historial de eliminados.', { danger: true, confirmLabel: 'Eliminar' }))) return;

    const res = reservations.find((r) => r.id === id);
    let restoredTo = '';
    const updates: Record<string, unknown> = {
      status: ReservationStatus.DELETED,
      deletedAt: new Date().toISOString(),
      deletedByEmail: user?.email || 'desconocido',
    };

    // Solo se devuelve el stock si la prenda seguía físicamente en la tienda
    // (apartado aún PENDIENTE). Si ya estaba LIQUIDADO, la prenda ya salió de
    // la tienda con la clienta y no debe volver a aparecer como disponible.
    if (res && res.status === ReservationStatus.PENDING && !res.stockRestored && res.stockAllocations?.length) {
      try {
        await restoreStock(res.stockAllocations);
        updates.stockRestored = true;
        restoredTo = originLotNames(res);
      } catch (err) {
        console.error('Error devolviendo stock al eliminar el apartado:', err);
      }
    }

    await updateDoc(doc(db, RESERVATIONS_COLLECTION, id), updates);
    if (restoredTo) {
      await infoDialog(`Apartado #${res!.correlative} eliminado (archivado).\n\nLas prendas volvieron a su lote de origen: ${restoredTo}.`, { title: 'Registro eliminado' });
    }
  };

  const editReservationField = async (
    id: string,
    field: 'customerName' | 'phoneNumber',
    newValue: string
  ) => {
    const res = reservations.find((r) => r.id === id);
    if (!res) return;
    const oldValue = res[field];
    if (oldValue === newValue) return;

    const now = new Date().toISOString();
    const editorEmail = user?.email || 'desconocido';

    await updateDoc(doc(db, RESERVATIONS_COLLECTION, id), {
      [field]: newValue,
      lastEditedAt: now,
      lastEditedByEmail: editorEmail,
    });

    const logEntry: EditLogEntry = {
      id: generateId(),
      reservationId: id,
      field,
      oldValue: oldValue || '',
      newValue,
      editedByEmail: editorEmail,
      editedAt: now,
    };
    await setDoc(doc(db, 'editLogs', logEntry.id), logEntry);
  };

  // Cierre del día: guarda los totales de HOY (calculados con las ventas
  // actuales) y el efectivo contado por la vendedora. Un cierre por día; si se
  // vuelve a enviar, se actualiza y la administradora lo vuelve a ver como nuevo.
  const sendDailyClosing = async (input: {
    openingCash: number;
    countedCash: number;
    sentToAdmin: number;
    note: string;
  }): Promise<DailyClosing> => {
    const date = getLocalDateStr();
    const t = getDayClosingTotals(sales, date);
    const previous = getPreviousClosing(closings, date);
    const cashSales = getCashSalesSince(sales, previous, date);
    const reservationCash = getReservationCashSince(reservations, previous, date);
    const purchasesTotal = getPurchasesSince(purchases, previous, date);
    const expectedCash = input.openingCash + cashSales + reservationCash - purchasesTotal;
    const closing: DailyClosing = {
      id: date,
      date,
      closedByEmail: user?.email || 'desconocido',
      closedAt: new Date().toISOString(),
      salesCount: t.salesCount,
      itemsCount: t.itemsCount,
      totalSold: t.totalSold,
      discountTotal: t.discountTotal,
      cancelledCount: t.cancelledCount,
      byMethod: t.byMethod,
      openingCash: input.openingCash,
      cashSales,
      reservationCash,
      purchasesTotal,
      expectedCash,
      countedCash: input.countedCash,
      difference: input.countedCash - expectedCash,
      sentToAdmin: input.sentToAdmin,
      keptInBox: input.countedCash - input.sentToAdmin,
      ...(input.note ? { note: input.note } : {}),
    };
    await setDoc(doc(db, DAILY_CLOSINGS_COLLECTION, date), closing);
    return closing;
  };

  // Compras pagadas de la caja chica. Una compra mal registrada no se borra: se anula.
  const addPurchase = async (input: { date: string; description: string; amount: number; note: string }) => {
    const id = `cp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const purchase: CashPurchase = {
      id,
      date: input.date,
      description: input.description,
      amount: input.amount,
      ...(input.note ? { note: input.note } : {}),
      status: 'ACTIVE',
      createdByEmail: user?.email || 'desconocido',
      createdByUid: user?.uid || '',
      createdAt: new Date().toISOString(),
    };
    await setDoc(doc(db, CASH_PURCHASES_COLLECTION, id), purchase);
  };

  const voidPurchase = async (purchase: CashPurchase) => {
    await updateDoc(doc(db, CASH_PURCHASES_COLLECTION, purchase.id), {
      status: 'VOIDED',
      voidedByEmail: user?.email || 'desconocido',
      voidedAt: new Date().toISOString(),
    });
  };

  // Dar de baja el saldo a favor de una clienta que no vuelve: sale del saldo y
  // queda en la bitácora como WRITTEN_OFF (en Finanzas cuenta como ingreso).
  const writeOffCredit = async (customer: Customer, note: string) => {
    if (role !== 'admin') return;
    await runTransaction(db, async (transaction) => {
      const ref = doc(db, CUSTOMERS_COLLECTION, customer.id);
      const snap = await transaction.get(ref);
      if (!snap.exists()) throw new Error('La clienta ya no existe.');
      const balance = (snap.data() as Customer).creditBalance || 0;
      if (balance <= 0) return;
      transaction.update(ref, { creditBalance: 0 });
      const ledgerRef = doc(db, CREDIT_LEDGER_COLLECTION, generateId());
      const entry: CreditTransaction = {
        id: ledgerRef.id,
        customerId: customer.id,
        customerName: customer.name,
        type: 'WRITTEN_OFF',
        amount: -balance,
        date: new Date().toISOString(),
        note,
        createdByEmail: user?.email || 'desconocido',
      };
      transaction.set(ledgerRef, entry);
    });
  };

  const markClosingSeen = async (closing: DailyClosing) => {
    if (role !== 'admin') return;
    await updateDoc(doc(db, DAILY_CLOSINGS_COLLECTION, closing.id), {
      seenByEmail: user?.email || 'desconocido',
      seenAt: new Date().toISOString(),
    });
  };

  // Corrección manual (solo admin) del precio congelado de una prenda de un
  // apartado — por ejemplo si hubo un error al apartar. Queda en el historial de
  // ediciones con el precio anterior y el nuevo.
  const editReservationItemPrice = async (reservationId: string, itemId: string, newPrice: number) => {
    if (role !== 'admin') {
      alert('Solo un administrador puede corregir el precio de un apartado.');
      return;
    }
    const res = reservations.find((r) => r.id === reservationId);
    const item = res?.items.find((i) => i.id === itemId);
    if (!res || !item || item.pricePerUnit === newPrice) return;
    const now = new Date().toISOString();
    const editorEmail = user?.email || 'desconocido';
    await updateDoc(doc(db, RESERVATIONS_COLLECTION, reservationId), {
      items: res.items.map((i) => (i.id === itemId ? { ...i, pricePerUnit: newPrice, priceNote: 'Precio corregido por administración' } : i)),
      lastEditedAt: now,
      lastEditedByEmail: editorEmail,
    });
    const logEntry: EditLogEntry = {
      id: generateId(),
      reservationId,
      field: `precio de ${item.code}`,
      oldValue: String(item.pricePerUnit),
      newValue: String(newPrice),
      editedByEmail: editorEmail,
      editedAt: now,
    };
    await setDoc(doc(db, 'editLogs', logEntry.id), logEntry);
  };

  // Registra una venta (del modo detallado o del modo rápido "Venta del día").
  // Todo en una sola transacción: descuenta stock, y si alguno de los pagos es
  // "Saldo", verifica y descuenta el saldo de esa clienta — si algo falla
  // (no hay stock, o no hay suficiente saldo), no se guarda nada.
  const addSale = async (
    saleDraft: Omit<Sale, 'id' | 'correlative' | 'soldByEmail' | 'status' | 'stockAllocations'>
  ) => {
    // Prendas con lote elegido a mano (Venta Nueva) se descuentan de ESE lote
    // exacto; las que no traen lote (venta detallada, o datos viejos) siguen
    // el FIFO de siempre (el lote más antiguo con stock primero).
    const directNeeds = new Map<string, { code: string; quantity: number }>();
    const fifoNeedsRaw: { code: string; quantity: number }[] = [];
    for (const it of saleDraft.items) {
      if (it.lotId) {
        const cur = directNeeds.get(it.lotId) || { code: it.code, quantity: 0 };
        cur.quantity += it.quantity;
        directNeeds.set(it.lotId, cur);
      } else {
        fifoNeedsRaw.push({ code: it.code, quantity: it.quantity });
      }
    }
    const aggregated = aggregateStockNeeds(fifoNeedsRaw);
    const balancePayment = saleDraft.payments.find((p) => p.method === 'balance');

    const saleId = generateId();
    const saleRef = doc(db, SALES_COLLECTION, saleId);
    const customerRef = balancePayment?.customerId ? doc(db, CUSTOMERS_COLLECTION, balancePayment.customerId) : null;

    await runTransaction(db, async (transaction) => {
      // ---- 1. lecturas: lotes candidatos para descontar stock ----
      const stockUpdates: { ref: ReturnType<typeof doc>; newRemaining: number }[] = [];
      const stockAllocations: StockAllocation[] = [];

      // 1a. Lotes elegidos a mano: se descuentan exactamente de ahí.
      for (const [lotId, need] of directNeeds) {
        const ref = doc(db, LOTS_COLLECTION, lotId);
        const snap = await transaction.get(ref);
        if (!snap.exists()) {
          const item = inventory.find((i) => i.code === need.code);
          throw new Error(`El lote elegido para "${item?.name || need.code}" ya no existe. Vuelve a intentar la venta.`);
        }
        const fresh = snap.data() as Lot;
        if (fresh.quantityRemaining < need.quantity) {
          const item = inventory.find((i) => i.code === need.code);
          throw new Error(`El lote elegido para "${item?.name || need.code}" ya no tiene suficiente stock. Vuelve a intentar la venta eligiendo otro lote.`);
        }
        stockUpdates.push({ ref, newRemaining: fresh.quantityRemaining - need.quantity });
        stockAllocations.push({ lotId, code: need.code, quantity: need.quantity });
      }

      // 1b. Sin lote elegido (venta detallada / datos viejos): FIFO de siempre,
      // sin tocar los lotes que ya se asignaron directo arriba.
      for (const need of aggregated) {
        const candidates = getCandidateLotsForCode(need.code, lots).filter((l) => !directNeeds.has(l.id));
        let remaining = need.quantity;
        for (const lot of candidates) {
          if (remaining <= 0) break;
          const ref = doc(db, LOTS_COLLECTION, lot.id);
          const snap = await transaction.get(ref);
          if (!snap.exists()) continue;
          const fresh = snap.data() as Lot;
          const take = Math.min(fresh.quantityRemaining, remaining);
          if (take > 0) {
            stockUpdates.push({ ref, newRemaining: fresh.quantityRemaining - take });
            stockAllocations.push({ lotId: lot.id, code: need.code, quantity: take });
            remaining -= take;
          }
        }
        if (remaining > 0) {
          const item = inventory.find((i) => i.code === need.code);
          throw new Error(`No hay suficiente stock de "${item?.name || need.code}".`);
        }
      }

      // ---- 2. lectura del saldo de la clienta, si el pago incluye "Saldo" ----
      let freshCustomer: Customer | null = null;
      if (balancePayment && customerRef) {
        const snap = await transaction.get(customerRef);
        if (!snap.exists()) throw new Error('La clienta seleccionada ya no existe en la libreta.');
        freshCustomer = snap.data() as Customer;
        const available = freshCustomer.creditBalance || 0;
        if (balancePayment.amount > available + 0.01) {
          throw new Error(`Saldo insuficiente de ${freshCustomer.name}. Disponible: ${formatCurrency(available)}.`);
        }
      }

      // ---- 3. escrituras ----
      stockUpdates.forEach((u) => transaction.update(u.ref, { quantityRemaining: u.newRemaining }));

      if (balancePayment && customerRef && freshCustomer) {
        transaction.update(customerRef, { creditBalance: (freshCustomer.creditBalance || 0) - balancePayment.amount });
        const ledgerRef = doc(db, CREDIT_LEDGER_COLLECTION, generateId());
        const ledgerEntry: CreditTransaction = {
          id: ledgerRef.id,
          customerId: customerRef.id,
          customerName: freshCustomer.name,
          type: 'USED_IN_SALE',
          amount: -balancePayment.amount,
          date: new Date().toISOString(),
          saleId,
          note: `Usado en venta #${nextSaleCorrelative}`,
          createdByEmail: user?.email || 'desconocido',
        };
        transaction.set(ledgerRef, ledgerEntry);
      }

      const newSale: Sale = {
        ...saleDraft,
        id: saleId,
        correlative: nextSaleCorrelative,
        soldByEmail: user?.email || 'desconocido',
        status: SaleStatus.COMPLETED,
        stockAllocations,
      };
      transaction.set(saleRef, newSale);
    });
  };

  const cancelSale = async (id: string) => {
    if (role !== 'admin') {
      alert('Solo un administrador puede anular una venta.');
      return;
    }
    if (!(await confirmDialog('¿Confirmas que deseas anular esta venta? El stock vendido regresará al inventario y, si se pagó con saldo, se le devolverá a la clienta.', { danger: true, confirmLabel: 'Anular venta' }))) return;

    const sale = sales.find((s) => s.id === id);
    if (!sale || sale.status === SaleStatus.CANCELLED) return;

    const balancePayment = sale.payments.find((p) => p.method === 'balance');
    const customerRef = balancePayment?.customerId ? doc(db, CUSTOMERS_COLLECTION, balancePayment.customerId) : null;

    try {
      await runTransaction(db, async (transaction) => {
        const lotRefs = sale.stockAllocations.map((a) => doc(db, LOTS_COLLECTION, a.lotId));
        const lotSnaps = lotRefs.length > 0 ? await Promise.all(lotRefs.map((r) => transaction.get(r))) : [];

        let freshCustomer: Customer | null = null;
        if (customerRef) {
          const snap = await transaction.get(customerRef);
          if (snap.exists()) freshCustomer = snap.data() as Customer;
        }

        lotSnaps.forEach((snap, idx) => {
          if (!snap.exists()) return;
          const fresh = snap.data() as Lot;
          transaction.update(lotRefs[idx], { quantityRemaining: fresh.quantityRemaining + sale.stockAllocations[idx].quantity });
        });

        if (customerRef && freshCustomer && balancePayment) {
          transaction.update(customerRef, { creditBalance: (freshCustomer.creditBalance || 0) + balancePayment.amount });
          const ledgerRef = doc(db, CREDIT_LEDGER_COLLECTION, generateId());
          const ledgerEntry: CreditTransaction = {
            id: ledgerRef.id,
            customerId: customerRef.id,
            customerName: freshCustomer.name,
            type: 'REFUND_CANCELLED_SALE',
            amount: balancePayment.amount,
            date: new Date().toISOString(),
            saleId: sale.id,
            note: `Venta #${sale.correlative} anulada — saldo devuelto`,
            createdByEmail: user?.email || 'desconocido',
          };
          transaction.set(ledgerRef, ledgerEntry);
        }

        transaction.update(doc(db, SALES_COLLECTION, id), {
          status: SaleStatus.CANCELLED,
          cancelledAt: new Date().toISOString(),
          cancelledByEmail: user?.email || 'desconocido',
        });
      });
    } catch (err) {
      console.error('Error anulando la venta:', err);
      alert('No se pudo anular la venta. Intenta de nuevo.');
    }
  };

  // Corrección manual de saldo (solo admin) — para arreglar errores sin tener
  // que entrar a la consola de Firebase.
  const adjustCustomerCredit = async (customerId: string, delta: number, note: string) => {
    if (role !== 'admin') {
      alert('Solo un administrador puede ajustar saldos manualmente.');
      return;
    }
    const customer = customers.find((c) => c.id === customerId);
    if (!customer) return;

    await runTransaction(db, async (transaction) => {
      const ref = doc(db, CUSTOMERS_COLLECTION, customerId);
      const snap = await transaction.get(ref);
      if (!snap.exists()) throw new Error('La clienta ya no existe.');
      const fresh = snap.data() as Customer;
      const newBalance = (fresh.creditBalance || 0) + delta;
      if (newBalance < -0.01) throw new Error('El ajuste dejaría el saldo en negativo.');

      transaction.update(ref, { creditBalance: newBalance });
      const ledgerRef = doc(db, CREDIT_LEDGER_COLLECTION, generateId());
      const ledgerEntry: CreditTransaction = {
        id: ledgerRef.id,
        customerId,
        customerName: fresh.name,
        type: 'MANUAL_ADJUSTMENT',
        amount: delta,
        date: new Date().toISOString(),
        note: note || 'Ajuste manual',
        createdByEmail: user?.email || 'desconocido',
      };
      transaction.set(ledgerRef, ledgerEntry);
    });
  };

  // Corrige una venta ya guardada (solo admin): en una sola transacción,
  // devuelve el stock y el saldo que esa venta tenía asignados, y vuelve a
  // asignar los nuevos — así nunca queda a medias, sin importar qué haya cambiado.
  const editSale = async (
    original: Sale,
    updatedDraft: Omit<Sale, 'id' | 'correlative' | 'soldByEmail' | 'status' | 'stockAllocations'>
  ) => {
    if (role !== 'admin') {
      alert('Solo un administrador puede editar una venta.');
      return;
    }
    if (original.status === SaleStatus.CANCELLED) {
      alert('Esta venta ya está anulada.');
      return;
    }

    const needs = updatedDraft.items.map((it) => ({ code: it.code, quantity: it.quantity }));
    const aggregated = aggregateStockNeeds(needs);
    const oldBalancePayment = original.payments.find((p) => p.method === 'balance');
    const newBalancePayment = updatedDraft.payments.find((p) => p.method === 'balance');
    const sameCustomer = !!(oldBalancePayment && newBalancePayment && oldBalancePayment.customerId === newBalancePayment.customerId);

    const saleRef = doc(db, SALES_COLLECTION, original.id);
    const oldCustomerRef = oldBalancePayment?.customerId ? doc(db, CUSTOMERS_COLLECTION, oldBalancePayment.customerId) : null;
    const newCustomerRef = newBalancePayment?.customerId ? doc(db, CUSTOMERS_COLLECTION, newBalancePayment.customerId) : null;

    await runTransaction(db, async (transaction) => {
      // ---- 1. lecturas ----
      const oldLotRefs = original.stockAllocations.map((a) => doc(db, LOTS_COLLECTION, a.lotId));
      const oldLotSnaps = oldLotRefs.length > 0 ? await Promise.all(oldLotRefs.map((r) => transaction.get(r))) : [];

      let freshOldCustomer: Customer | null = null;
      if (oldCustomerRef) {
        const snap = await transaction.get(oldCustomerRef);
        if (snap.exists()) freshOldCustomer = snap.data() as Customer;
      }
      let freshNewCustomer: Customer | null = null;
      if (newCustomerRef) {
        if (sameCustomer) {
          freshNewCustomer = freshOldCustomer;
        } else {
          const snap = await transaction.get(newCustomerRef);
          if (snap.exists()) freshNewCustomer = snap.data() as Customer;
        }
      }

      // Mapa de trabajo del stock: primero se "devuelve" lo que esta venta ya tenía,
      // para poder reasignarlo sin ir y venir si reutiliza la misma prenda.
      const lotWorkingRemaining = new Map<string, number>();
      oldLotSnaps.forEach((snap, idx) => {
        if (!snap.exists()) return;
        const fresh = snap.data() as Lot;
        const alloc = original.stockAllocations[idx];
        lotWorkingRemaining.set(alloc.lotId, fresh.quantityRemaining + alloc.quantity);
      });

      const newAllocations: StockAllocation[] = [];
      for (const need of aggregated) {
        const candidates = getCandidateLotsForCode(need.code, lots);
        let remaining = need.quantity;
        for (const lot of candidates) {
          if (remaining <= 0) break;
          let currentRemaining = lotWorkingRemaining.get(lot.id);
          if (currentRemaining === undefined) {
            const ref = doc(db, LOTS_COLLECTION, lot.id);
            const snap = await transaction.get(ref);
            if (!snap.exists()) continue;
            currentRemaining = (snap.data() as Lot).quantityRemaining;
            lotWorkingRemaining.set(lot.id, currentRemaining);
          }
          const take = Math.min(currentRemaining, remaining);
          if (take > 0) {
            lotWorkingRemaining.set(lot.id, currentRemaining - take);
            newAllocations.push({ lotId: lot.id, code: need.code, quantity: take });
            remaining -= take;
          }
        }
        if (remaining > 0) {
          const item = inventory.find((i) => i.code === need.code);
          throw new Error(`No hay suficiente stock de "${item?.name || need.code}" para esta edición.`);
        }
      }

      // Saldo disponible de la clienta nueva, contando lo que se le devolvería si es la misma persona
      if (newBalancePayment) {
        if (!freshNewCustomer) throw new Error('La clienta seleccionada para el saldo ya no existe.');
        const base = (freshNewCustomer.creditBalance || 0) + (sameCustomer && oldBalancePayment ? oldBalancePayment.amount : 0);
        if (newBalancePayment.amount > base + 0.01) {
          throw new Error(`Saldo insuficiente de ${freshNewCustomer.name}. Disponible: ${formatCurrency(base)}.`);
        }
      }

      // ---- 2. escrituras ----
      lotWorkingRemaining.forEach((newRemaining, lotId) => {
        transaction.update(doc(db, LOTS_COLLECTION, lotId), { quantityRemaining: newRemaining });
      });

      if (oldBalancePayment && oldCustomerRef && freshOldCustomer && !sameCustomer) {
        transaction.update(oldCustomerRef, { creditBalance: (freshOldCustomer.creditBalance || 0) + oldBalancePayment.amount });
        const ledgerRef = doc(db, CREDIT_LEDGER_COLLECTION, generateId());
        const entry: CreditTransaction = {
          id: ledgerRef.id, customerId: oldCustomerRef.id, customerName: freshOldCustomer.name,
          type: 'REFUND_CANCELLED_SALE', amount: oldBalancePayment.amount, date: new Date().toISOString(),
          saleId: original.id, note: `Venta #${original.correlative} editada — saldo anterior devuelto`,
          createdByEmail: user?.email || 'desconocido',
        };
        transaction.set(ledgerRef, entry);
      }

      if (newBalancePayment && newCustomerRef && freshNewCustomer) {
        const base = (freshNewCustomer.creditBalance || 0) + (sameCustomer && oldBalancePayment ? oldBalancePayment.amount : 0);
        transaction.update(newCustomerRef, { creditBalance: base - newBalancePayment.amount });
        const ledgerRef = doc(db, CREDIT_LEDGER_COLLECTION, generateId());
        const entry: CreditTransaction = {
          id: ledgerRef.id, customerId: newCustomerRef.id, customerName: freshNewCustomer.name,
          type: 'USED_IN_SALE', amount: -newBalancePayment.amount, date: new Date().toISOString(),
          saleId: original.id, note: `Venta #${original.correlative} editada — saldo aplicado`,
          createdByEmail: user?.email || 'desconocido',
        };
        transaction.set(ledgerRef, entry);
      }

      transaction.update(saleRef, {
        items: updatedDraft.items,
        payments: updatedDraft.payments,
        customerName: updatedDraft.customerName,
        customerId: newBalancePayment?.customerId,
        note: updatedDraft.note,
        stockAllocations: newAllocations,
        editedAt: new Date().toISOString(),
        editedByEmail: user?.email || 'desconocido',
      });
    });
  };

  const handleInventoryUpdate = async (newItems: InventoryItem[]) => {
    const existingIds = new Set(inventory.map((i) => i.id));
    const added = newItems.filter((i) => !existingIds.has(i.id));
    for (const item of added) {
      await setDoc(doc(db, INVENTORY_COLLECTION, item.id), item);
    }
    const newIds = new Set(newItems.map((i) => i.id));
    const removed = inventory.filter((i) => !newIds.has(i.id));
    for (const item of removed) {
      await deleteDoc(doc(db, INVENTORY_COLLECTION, item.id));
    }
  };

  // ---- Fase 3: Costos, gastos y rentabilidad (solo admin) ----

  // Registra un nuevo Precio por prenda (con la fecha desde la que rige). Siempre
  // se AGREGA al historial — nunca se edita ni se borra una entrada anterior.
  const addGarmentPrice = async (price: number, effectiveDate: string, note: string) => {
    if (role !== 'admin') {
      alert('Solo un administrador puede cambiar el precio por prenda.');
      return;
    }
    const entry: GarmentPriceEntry = {
      id: generateId(),
      price,
      effectiveDate,
      ...(note ? { note } : {}),
      createdByEmail: user?.email || 'desconocido',
      createdAt: new Date().toISOString(),
    };
    await setDoc(doc(db, SETTINGS_COLLECTION, GARMENT_PRICE_DOC_ID), { entries: arrayUnion(entry) }, { merge: true });
  };

  const addExpenseCategory = async (id: string, label: string) => {
    if (role !== 'admin') return;
    const category: ExpenseCategoryItem = {
      id,
      label,
      createdByEmail: user?.email || 'desconocido',
      createdAt: new Date().toISOString(),
    };
    await setDoc(doc(db, EXPENSE_CATEGORIES_COLLECTION, id), category);
  };

  const addExpense = async (
    categoryId: string,
    frequency: ExpenseFrequency,
    amount: number,
    date: string,
    note: string,
    templateId?: string
  ) => {
    if (role !== 'admin') {
      alert('Solo un administrador puede registrar gastos.');
      return;
    }
    const expense: Expense = {
      id: generateId(),
      date,
      categoryId,
      frequency,
      amount,
      note: note || undefined,
      templateId,
      createdByEmail: user?.email || 'desconocido',
      createdAt: new Date().toISOString(),
    };
    await setDoc(doc(db, EXPENSES_COLLECTION, expense.id), expense);
  };

  const editExpense = async (
    id: string,
    updates: { categoryId: string; frequency: ExpenseFrequency; amount: number; date: string; note: string }
  ) => {
    if (role !== 'admin') {
      alert('Solo un administrador puede editar gastos.');
      return;
    }
    await updateDoc(doc(db, EXPENSES_COLLECTION, id), {
      ...updates,
      note: updates.note || undefined,
      editedAt: new Date().toISOString(),
      editedByEmail: user?.email || 'desconocido',
    });
  };

  const deleteExpense = async (id: string) => {
    if (role !== 'admin') {
      alert('Solo un administrador puede eliminar gastos.');
      return;
    }
    await deleteDoc(doc(db, EXPENSES_COLLECTION, id));
  };

  const addExpenseTemplate = async (categoryId: string, defaultAmount: number, note: string) => {
    if (role !== 'admin') return;
    const template: ExpenseTemplate = {
      id: generateId(),
      categoryId,
      defaultAmount,
      note: note || undefined,
      active: true,
      createdByEmail: user?.email || 'desconocido',
      createdAt: new Date().toISOString(),
    };
    await setDoc(doc(db, EXPENSE_TEMPLATES_COLLECTION, template.id), template);
  };

  const toggleExpenseTemplateActive = async (id: string, active: boolean) => {
    if (role !== 'admin') return;
    await updateDoc(doc(db, EXPENSE_TEMPLATES_COLLECTION, id), { active });
  };

  const deleteExpenseTemplate = async (id: string) => {
    if (role !== 'admin') return;
    await deleteDoc(doc(db, EXPENSE_TEMPLATES_COLLECTION, id));
  };

  const saveFinanceSettings = async (updates: {
    cardCommissionPercent: number;
    invoiceTaxPercent: number;
    vendorCommissionPercent: number;
    unitCosts: FinanceSettings['unitCosts'];
  }) => {
    if (role !== 'admin') {
      alert('Solo un administrador puede cambiar esta configuración.');
      return;
    }
    const updated: FinanceSettings = {
      ...updates,
      updatedByEmail: user?.email || 'desconocido',
      updatedAt: new Date().toISOString(),
    };
    await setDoc(doc(db, SETTINGS_COLLECTION, FINANCE_SETTINGS_DOC_ID), updated);
  };

  const saveLotColorSettings = async (updates: Omit<LotColorSettings, 'updatedByEmail' | 'updatedAt'>) => {
    if (role !== 'admin') {
      alert('Solo un administrador puede cambiar esta configuración.');
      return;
    }
    const updated: LotColorSettings = {
      ...updates,
      updatedByEmail: user?.email || 'desconocido',
      updatedAt: new Date().toISOString(),
    };
    await setDoc(doc(db, LOT_COLOR_SETTINGS_COLLECTION, LOT_COLOR_SETTINGS_DOC_ID), updated);
  };

  // Borra por completo las colecciones de "movimiento" que el admin elija
  // (ventas, apartados, lotes, etc.) para arrancar una nueva etapa de pruebas
  // o pasar a producción. Nunca toca inventario, roles, settings ni las
  // categorías/plantillas de gasto — esas colecciones ni siquiera se ofrecen
  // como opción en DataResetPanel.
  const resetTestData = async (collectionsToWipe: string[]) => {
    if (role !== 'admin') {
      alert('Solo un administrador puede reiniciar los datos.');
      return;
    }
    setResetBusy(true);
    try {
      for (const colName of collectionsToWipe) {
        const snap = await getDocs(collection(db, colName));
        const docsToDelete = snap.docs;
        for (let i = 0; i < docsToDelete.length; i += 450) {
          const chunk = docsToDelete.slice(i, i + 450);
          const batch = writeBatch(db);
          chunk.forEach((d) => batch.delete(d.ref));
          await batch.commit();
        }
      }
      alert('Listo. Se borró la información seleccionada.');
    } catch (err) {
      console.error('Error al reiniciar datos:', err);
      alert('Hubo un error al borrar los datos. Revisa tu conexión e intenta de nuevo.');
    } finally {
      setResetBusy(false);
    }
  };

  const filteredReservations = reservations.filter((res) => {
    if (filter === 'OVERDUE') return res.status === ReservationStatus.PENDING && isOverdue(res.date);
    if (filter === 'PENDING') return res.status === ReservationStatus.PENDING;
    if (filter === 'PAID') return res.status === ReservationStatus.PAID;
    if (filter === 'CANCELLED') return res.status === ReservationStatus.CANCELLED;
    if (filter === 'DELETED') return res.status === ReservationStatus.DELETED;
    return res.status !== ReservationStatus.DELETED;
  });

  const nextCorrelative = reservations.length > 0 ? Math.max(...reservations.map((r) => r.correlative)) + 1 : 1;
  const nextSaleCorrelative = sales.length > 0 ? Math.max(...sales.map((s) => s.correlative)) + 1 : 1;
  const overdueCount = reservations.filter((r) => r.status === ReservationStatus.PENDING && isOverdue(r.date)).length;
  const pendingLabelsCount = reservations.filter((r) => r.renewal && !r.renewal.labelsDone).length;
  const activeReservationsCount = reservations.filter((r) => r.status === ReservationStatus.PENDING).length;
  const pendingLotsCount = lots.filter((l) => l.verificationStatus !== 'confirmed' && l.verificationStatus !== 'flagged').length;
  const flaggedLotsCount = lots.filter((l) => l.verificationStatus === 'flagged').length;
  const todayStr = getLocalDateStr();
  const salesToday = sales.filter((s) => s.status === SaleStatus.COMPLETED && isSameLocalDay(s.date));

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#e8f7f2]">
        <p className="text-slate-400 font-bold text-sm">Cargando...</p>
      </div>
    );
  }

  if (!user) return <Login />;

  if (dataLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#e8f7f2]">
        <p className="text-slate-400 font-bold text-sm">Cargando datos del negocio...</p>
      </div>
    );
  }

  const pageTitles: Record<Page, string> = {
    inicio: 'Inicio',
    apartados: 'Apartados',
    compras: 'Compras',
    ventas: 'Ventas',
    inventario: 'Inventario',
    clientes: 'Clientes',
    finanzas: 'Finanzas',
    ajustes: 'Ajustes',
  };

  return (
    <div className="min-h-screen bg-[#e8f7f2] lg:flex">
      <ConfirmHost />
      {renewalNotice && (
        <RenewalNotice res={renewalNotice.res} renewal={renewalNotice.renewal} onLabelsDone={() => markLabelsDone(renewalNotice.res.id)} onClose={() => setRenewalNotice(null)} />
      )}
      <Sidebar page={page} setPage={setPage} role={role} isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} badges={{ apartados: overdueCount, inventario: pendingLabelsCount, ...(role === 'admin' ? { ventas: closings.filter((c) => !c.seenAt).length } : {}) }} />

      <div className="flex-1 min-w-0">
        {/* Barra superior */}
        <header className="bg-white border-b border-slate-100 px-4 sm:px-6 py-4 flex items-center justify-between gap-3 sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-slate-500 hover:text-slate-700">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <h1 className="text-lg font-black text-slate-900">{pageTitles[page]}</h1>
          </div>

          <div className="flex items-center gap-3">
            {overdueCount > 0 && (
              <div className="hidden sm:flex bg-[#8c3a4b]/15 border border-[#8c3a4b]/30 px-3 py-1.5 rounded-xl items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-[#8c3a4b]"></div>
                <p className="text-[#6f2d3a] text-xs font-black">{overdueCount} VENCIDOS</p>
              </div>
            )}
            <span
              className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border ${
                role === 'admin'
                  ? 'bg-[#8c3a4b]/10 text-[#8c3a4b] border-[#8c3a4b]/30'
                  : 'bg-[#2bb297]/10 text-[#1a8a72] border-[#2bb297]/30'
              }`}
            >
              {role === 'admin' ? 'Admin' : 'Tienda'}
            </span>
            <button
              onClick={() => signOut(auth)}
              className="text-xs font-black text-slate-400 hover:text-slate-600 uppercase tracking-widest px-2 py-2"
              title={user.email || ''}
            >
              Cerrar sesión
            </button>
          </div>
        </header>

        <main className="p-4 sm:p-6 lg:p-8">
          {/* ---------------- PÁGINA: INICIO ---------------- */}
          {page === 'inicio' && (
            <div>
              <ReservationAlerts reservations={reservations} pendingLabels={pendingLabelsCount} onGoApartados={() => setPage('apartados')} onGoInventario={() => setPage('inventario')} />
              <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-3">Accesos rápidos</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <button
                  onClick={() => setPage('apartados')}
                  className="relative bg-white p-5 rounded-2xl border border-slate-200 text-left hover:shadow-md hover:border-[#2bb297]/40 transition"
                >
                  <div className="bg-[#2bb297]/10 w-10 h-10 rounded-xl flex items-center justify-center mb-3">
                    <svg className="w-5 h-5 text-[#1a8a72]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                    </svg>
                  </div>
                  <p className="font-black text-slate-800">Apartados</p>
                  <p className="text-xs text-slate-400 font-bold mt-1">{activeReservationsCount} activo(s)</p>
                  {overdueCount > 0 && (
                    <span className="absolute top-4 right-4 bg-[#8c3a4b] text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center">{overdueCount}</span>
                  )}
                </button>

                <button
                  onClick={() => setPage('ventas')}
                  className="relative bg-white p-5 rounded-2xl border border-slate-200 text-left hover:shadow-md hover:border-[#2bb297]/40 transition"
                >
                  <div className="bg-[#c9a876]/15 w-10 h-10 rounded-xl flex items-center justify-center mb-3">
                    <svg className="w-5 h-5 text-[#8a6a3f]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h5M5 6h14a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2z" />
                    </svg>
                  </div>
                  <p className="font-black text-slate-800">Ventas</p>
                  <p className="text-xs text-slate-400 font-bold mt-1">{salesToday.length} hoy</p>
                </button>

                <button
                  onClick={() => setPage('inventario')}
                  className="relative bg-white p-5 rounded-2xl border border-slate-200 text-left hover:shadow-md hover:border-[#2bb297]/40 transition"
                >
                  <div className="bg-[#2bb297]/10 w-10 h-10 rounded-xl flex items-center justify-center mb-3">
                    <svg className="w-5 h-5 text-[#1a8a72]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                  </div>
                  <p className="font-black text-slate-800">Inventario</p>
                  <p className="text-xs text-slate-400 font-bold mt-1">{inventory.length} prenda(s) en catálogo</p>
                  {role === 'admin' && flaggedLotsCount > 0 && (
                    <span className="absolute top-4 right-4 bg-[#8c3a4b] text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center">{flaggedLotsCount}</span>
                  )}
                  {role !== 'admin' && pendingLotsCount > 0 && (
                    <span className="absolute top-4 right-4 bg-[#c9a876] text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center">{pendingLotsCount}</span>
                  )}
                </button>

                <button
                  onClick={() => setPage('clientes')}
                  className="bg-white p-5 rounded-2xl border border-slate-200 text-left hover:shadow-md hover:border-[#2bb297]/40 transition"
                >
                  <div className="bg-[#2bb297]/10 w-10 h-10 rounded-xl flex items-center justify-center mb-3">
                    <svg className="w-5 h-5 text-[#1a8a72]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4 4 4 0 004 4zm6 0a4 4 0 10-4-4" />
                    </svg>
                  </div>
                  <p className="font-black text-slate-800">Clientes</p>
                  <p className="text-xs text-slate-400 font-bold mt-1">{customers.length} registrado(s)</p>
                </button>
              </div>

              <div className="mt-8">
                <Stats reservations={reservations} />
              </div>
            </div>
          )}

          {/* ---------------- PÁGINA: APARTADOS ---------------- */}
          {page === 'apartados' && (
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
              <div className="lg:col-span-1 space-y-4">
                <ReservationForm
                  onAdd={addReservation}
                  inventory={inventory}
                  lots={lots}
                  nextCorrelative={nextCorrelative}
                  customers={customers}
                  lotColorSettings={lotColorSettings}
                />
              </div>

              <div className="lg:col-span-3">
                <div className="mb-6 flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-2 rounded-2xl shadow-sm border border-slate-100">
                  <div className="flex flex-wrap p-1 bg-slate-50 rounded-xl w-full sm:w-auto gap-1">
                    <button onClick={() => setFilter('ALL')} className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-black tracking-widest uppercase transition ${filter === 'ALL' ? 'bg-white text-[#1a8a72] shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>TODOS</button>
                    <button onClick={() => setFilter('PENDING')} className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-black tracking-widest uppercase transition ${filter === 'PENDING' ? 'bg-white text-[#1a8a72] shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>PENDIENTES</button>
                    <button onClick={() => setFilter('OVERDUE')} className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-black tracking-widest uppercase transition ${filter === 'OVERDUE' ? 'bg-[#8c3a4b] text-white shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>VENCIDOS</button>
                    <button onClick={() => setFilter('PAID')} className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-black tracking-widest uppercase transition ${filter === 'PAID' ? 'bg-[#1a8a72] text-white shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>LIQUIDADOS</button>
                    <button onClick={() => setFilter('CANCELLED')} className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-black tracking-widest uppercase transition ${filter === 'CANCELLED' ? 'bg-slate-500 text-white shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>LIBERADOS</button>
                    <button onClick={() => setFilter('DELETED')} className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-black tracking-widest uppercase transition ${filter === 'DELETED' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>ELIMINADOS</button>
                  </div>
                  <div className="flex items-center gap-3">
                    <ExportMenu reservations={reservations} />
                  </div>
                </div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
                  Mostrando {filteredReservations.length} de {reservations.length} registros
                </p>

                <ReservationTable
                  reservations={filteredReservations}
                  onUpdateStatus={updateStatus}
                  onDelete={deleteReservation}
                  onAddPayment={addPayment}
                  onEditField={editReservationField}
                  onEditItemPrice={editReservationItemPrice}
                  role={role}
                  aliases={aliases}
                />
              </div>
            </div>
          )}

          {/* ---------------- PÁGINA: VENTAS ---------------- */}
          {page === 'ventas' && (() => {
            const resumenBlock = (
              <div>
                <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
                  <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest">Resumen</h2>
                  <SalesExportMenu sales={sales} aliases={aliases} />
                </div>
                <ClosingsPanel closings={closings} sales={sales} aliases={aliases} role={role} onMarkSeen={markClosingSeen} />
                <SalesStats sales={sales} />
                <TodaySalesHistory sales={sales} role={role} onCancelSale={cancelSale} onEditSale={setEditingSale} />
              </div>
            );

            const ventasBlock = (
              <div>
                <div className="mb-4 flex p-1 bg-slate-50 rounded-xl w-fit gap-1 border border-slate-200">
                  <button
                    onClick={() => setSaleMode('quick')}
                    className={`px-4 py-2 rounded-lg text-xs font-black tracking-widest uppercase transition ${saleMode === 'quick' ? 'bg-white text-[#1a8a72] shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                  >
                    Venta del día
                  </button>
                  <button
                    onClick={() => setSaleMode('history')}
                    className={`px-4 py-2 rounded-lg text-xs font-black tracking-widest uppercase transition ${saleMode === 'history' ? 'bg-white text-[#1a8a72] shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                  >
                    Historial de ventas
                  </button>
                </div>

                {saleMode === 'quick' ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <QuickSaleForm onAdd={addSale} inventory={inventory} lots={lots} customers={customers} lotColorSettings={lotColorSettings} />
                    <DailyClosingButton sales={sales} closings={closings} purchases={purchases} reservations={reservations} aliases={aliases} onSend={sendDailyClosing} />
                  </div>
                ) : (
                  <SalesHistory sales={sales} onCancel={cancelSale} onEditSale={setEditingSale} role={role} aliases={aliases} />
                )}
              </div>
            );

            // Admin: igual que siempre (Resumen arriba). Vendedora: la venta
            // va primero y el Resumen pasa hasta abajo, oculto por defecto,
            // ya que su pantalla puede estar a la vista de otras personas.
            if (role === 'admin') {
              return (
                <div>
                  {resumenBlock}
                  <div className="mt-6">{ventasBlock}</div>
                </div>
              );
            }

            return (
              <div>
                {ventasBlock}
                <div className="mt-8 border-t border-slate-200 pt-4">
                  <button
                    onClick={() => setShowSalesStatsForEmployee((v) => !v)}
                    className="flex items-center gap-2 text-xs font-black text-slate-400 hover:text-slate-600 uppercase tracking-widest transition"
                  >
                    <svg className={`w-4 h-4 transition-transform ${showSalesStatsForEmployee ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                    {showSalesStatsForEmployee ? 'Ocultar resumen del día' : 'Ver resumen del día'}
                  </button>
                  {showSalesStatsForEmployee && <div className="mt-4">{resumenBlock}</div>}
                </div>
              </div>
            );
          })()}

          {editingSale && (
            <EditSaleModal
              sale={editingSale}
              inventory={inventory}
              lots={lots}
              customers={customers}
              onSave={editSale}
              onClose={() => setEditingSale(null)}
            />
          )}

          {/* ---------------- PÁGINA: INVENTARIO ---------------- */}
          {page === 'inventario' && (
            <div className="space-y-6">
              <div className="max-w-2xl">
                <RenewedItemsPanel reservations={reservations} aliases={aliases} onLabelsDone={markLabelsDone} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
                <InventoryManager items={inventory} lots={lots} reservations={reservations} onUpdate={handleInventoryUpdate} />
                {role === 'admin' && (
                  <StockEntryForm inventory={inventory} onSubmit={addStockEntry} lotColorSettings={lotColorSettings} />
                )}
                <LotsPanel
                  inventory={inventory}
                  lots={lots}
                  role={role}
                  onDeleteLot={deleteLot}
                  onVerifyLot={verifyLot}
                  onCorrectQuantity={correctLotQuantity}
                  aliases={aliases}
                  lotColorSettings={lotColorSettings}
                />
                {role === 'admin' && (
                  <LotColorSettingsCard settings={lotColorSettings} aliases={aliases} onSave={saveLotColorSettings} />
                )}
              </div>

              <InventoryCatalogTable items={inventory} lots={lots} reservations={reservations} />
            </div>
          )}

          {/* ---------------- PÁGINA: COMPRAS (caja chica) ---------------- */}
          {page === 'compras' && (
            <PurchasesPanel
              purchases={purchases}
              snapshot={getPettyCashSnapshot(closings, sales, reservations, purchases, getLocalDateStr())}
              role={role}
              currentUid={user?.uid || ''}
              aliases={aliases}
              onAdd={addPurchase}
              onVoid={voidPurchase}
            />
          )}

          {/* ---------------- PÁGINA: CLIENTES ---------------- */}
          {page === 'clientes' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl">
              <CustomerManager
                customers={customers}
                creditLedger={creditLedger}
                role={role}
                onUpdate={updateCustomer}
                onDelete={deleteCustomer}
                onAdjustCredit={adjustCustomerCredit}
              />
              <div className="space-y-6">
                <CustomerBalances reservations={reservations} />
              </div>
            </div>
          )}

          {/* ---------------- PÁGINA: FINANZAS (solo admin) ---------------- */}
          {page === 'finanzas' && (
            role !== 'admin' ? (
              <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center">
                <p className="text-sm font-bold text-slate-400">Esta sección es solo para administradores.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                  <ProfitabilitySummary
                    sales={sales}
                    expenses={expenses}
                    purchases={purchases}
                    writeOffs={creditLedger}
                    categories={expenseCategories}
                    garmentPrices={garmentPrices}
                    settings={financeSettings}
                    aliases={aliases}
                  />
                  <ExpensesPanel
                    expenses={expenses}
                    categories={expenseCategories}
                    templates={expenseTemplates}
                    aliases={aliases}
                    onAddCategory={addExpenseCategory}
                    onAddExpense={addExpense}
                    onEditExpense={editExpense}
                    onDeleteExpense={deleteExpense}
                    onAddTemplate={addExpenseTemplate}
                    onToggleTemplateActive={toggleExpenseTemplateActive}
                    onDeleteTemplate={deleteExpenseTemplate}
                  />
                </div>
                <div className="space-y-6">
                  <FinanceSettingsCard settings={financeSettings} aliases={aliases} onSave={saveFinanceSettings} />
                  <AbonosApartadosCard customers={customers} creditLedger={creditLedger} reservations={reservations} onWriteOff={writeOffCredit} />
                  <GarmentPriceCard entries={garmentPrices} aliases={aliases} onAdd={addGarmentPrice} />
                </div>
              </div>
            )
          )}

          {page === 'ajustes' && (
            role !== 'admin' ? (
              <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center">
                <p className="text-sm font-bold text-slate-400">Esta sección es solo para administradores.</p>
              </div>
            ) : (
              <div className="max-w-xl">
                <DataResetPanel busy={resetBusy} onReset={resetTestData} />
              </div>
            )
          )}
        </main>
      </div>
    </div>
  );
};

export default App;
