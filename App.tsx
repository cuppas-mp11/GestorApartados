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
import { SaleForm } from './components/SaleForm';
import { SalesHistory } from './components/SalesHistory';
import { SalesStats } from './components/SalesStats';
import { Login } from './components/Login';
import { Sidebar, Page } from './components/Sidebar';
import {
  isOverdue,
  generateId,
  getTotalPrice,
  getTotalPaid,
  getNextCustomerCode,
  aggregateStockNeeds,
  getCandidateLotsForCode,
} from './utils';

const RESERVATIONS_COLLECTION = 'reservations';
const INVENTORY_COLLECTION = 'inventory';
const CUSTOMERS_COLLECTION = 'customers';
const LOTS_COLLECTION = 'lots';
const SALES_COLLECTION = 'sales';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [role, setRole] = useState<UserRole | null>(null);
  const [roleLoading, setRoleLoading] = useState(true);

  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [lots, setLots] = useState<Lot[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [filter, setFilter] = useState<'ALL' | 'OVERDUE' | 'PENDING' | 'PAID' | 'CANCELLED' | 'DELETED'>('ALL');

  const [page, setPage] = useState<Page>('inicio');
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
        const data = snapshot.docs.map((d) => d.data() as Sale);
        data.sort((a, b) => b.correlative - a.correlative);
        setSales(data);
      },
      (error) => console.error('Error leyendo ventas:', error)
    );

    return () => {
      unsubReservations();
      unsubInventory();
      unsubCustomers();
      unsubLots();
      unsubSales();
    };
  }, [user]);

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
    const needs = reservation.items.map((it) => ({ code: it.code, quantity: it.quantity }));
    const stockAllocations = await allocateAndDecrementStock(needs);

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

  const updateStatus = async (id: string, status: ReservationStatus) => {
    const label = status === ReservationStatus.PAID
      ? 'marcar este apartado como LIQUIDADO'
      : 'LIBERAR la prenda (cancelar este apartado)';
    if (!confirm(`¿Confirmas que deseas ${label}?`)) return;

    const res = reservations.find((r) => r.id === id);

    // Al liberar (cancelar) un apartado, la prenda vuelve a estar disponible:
    // se devuelve el stock que se había descontado al crearlo.
    if (status === ReservationStatus.CANCELLED && res && !res.stockRestored && res.stockAllocations?.length) {
      try {
        await restoreStock(res.stockAllocations);
        await updateDoc(doc(db, RESERVATIONS_COLLECTION, id), { status, stockRestored: true });
        return;
      } catch (err) {
        console.error('Error devolviendo stock al liberar el apartado:', err);
      }
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
    if (!confirm('¿Estás seguro de que deseas eliminar este registro? Pasará al historial de eliminados.')) return;

    const res = reservations.find((r) => r.id === id);
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
      } catch (err) {
        console.error('Error devolviendo stock al eliminar el apartado:', err);
      }
    }

    await updateDoc(doc(db, RESERVATIONS_COLLECTION, id), updates);
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

  // Registra una venta directa (mostrador): descuenta stock igual que un
  // apartado, pero de una vez (no hay saldo pendiente ni abonos).
  const addSale = async (
    saleDraft: Omit<Sale, 'id' | 'correlative' | 'soldByEmail' | 'status' | 'stockAllocations'>
  ) => {
    const needs = saleDraft.items.map((it) => ({ code: it.code, quantity: it.quantity }));
    const stockAllocations = await allocateAndDecrementStock(needs);

    const newSale: Sale = {
      ...saleDraft,
      id: generateId(),
      correlative: nextSaleCorrelative,
      soldByEmail: user?.email || 'desconocido',
      status: SaleStatus.COMPLETED,
      stockAllocations,
    };

    await setDoc(doc(db, SALES_COLLECTION, newSale.id), newSale);
  };

  const cancelSale = async (id: string) => {
    if (role !== 'admin') {
      alert('Solo un administrador puede anular una venta.');
      return;
    }
    if (!confirm('¿Confirmas que deseas anular esta venta? El stock vendido regresará al inventario.')) return;

    const sale = sales.find((s) => s.id === id);
    if (!sale || sale.status === SaleStatus.CANCELLED) return;

    try {
      await restoreStock(sale.stockAllocations);
    } catch (err) {
      console.error('Error devolviendo stock de la venta anulada:', err);
    }

    await updateDoc(doc(db, SALES_COLLECTION, id), {
      status: SaleStatus.CANCELLED,
      cancelledAt: new Date().toISOString(),
      cancelledByEmail: user?.email || 'desconocido',
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
  const activeReservationsCount = reservations.filter((r) => r.status === ReservationStatus.PENDING).length;
  const pendingLotsCount = lots.filter((l) => l.verificationStatus !== 'confirmed' && l.verificationStatus !== 'flagged').length;
  const flaggedLotsCount = lots.filter((l) => l.verificationStatus === 'flagged').length;
  const todayStr = new Date().toISOString().split('T')[0];
  const salesToday = sales.filter((s) => s.status === SaleStatus.COMPLETED && s.date.startsWith(todayStr));

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
    ventas: 'Ventas',
    inventario: 'Inventario',
    clientes: 'Clientes',
  };

  return (
    <div className="min-h-screen bg-[#e8f7f2] lg:flex">
      <Sidebar page={page} setPage={setPage} role={role} isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

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
              <Stats reservations={reservations} />

              <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-3 mt-8">Accesos rápidos</h2>
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
                  role={role}
                />
              </div>
            </div>
          )}

          {/* ---------------- PÁGINA: VENTAS ---------------- */}
          {page === 'ventas' && (
            <div>
              <SalesStats sales={sales} />
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 mt-6">
                <div className="lg:col-span-1 space-y-4">
                  <SaleForm onAdd={addSale} inventory={inventory} lots={lots} nextCorrelative={nextSaleCorrelative} customers={customers} />
                </div>
                <div className="lg:col-span-3">
                  <SalesHistory sales={sales} onCancel={cancelSale} role={role} />
                </div>
              </div>
            </div>
          )}

          {/* ---------------- PÁGINA: INVENTARIO ---------------- */}
          {page === 'inventario' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
              <InventoryManager items={inventory} lots={lots} onUpdate={handleInventoryUpdate} />
              {role === 'admin' && (
                <StockEntryForm inventory={inventory} onSubmit={addStockEntry} />
              )}
              <LotsPanel
                inventory={inventory}
                lots={lots}
                role={role}
                onDeleteLot={deleteLot}
                onVerifyLot={verifyLot}
                onCorrectQuantity={correctLotQuantity}
              />
            </div>
          )}

          {/* ---------------- PÁGINA: CLIENTES ---------------- */}
          {page === 'clientes' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl">
              <CustomerManager customers={customers} onUpdate={updateCustomer} onDelete={deleteCustomer} />
              <CustomerBalances reservations={reservations} />
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default App;
