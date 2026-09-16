import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  updateDoc,
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { Reservation, ReservationStatus, InventoryItem, Payment, UserRole, EditLogEntry, Customer, Lot } from './types';
import { ReservationForm } from './components/ReservationForm';
import { ReservationTable } from './components/ReservationTable';
import { Stats } from './components/Stats';
import { InventoryManager } from './components/InventoryManager';
import { StockEntryForm } from './components/StockEntryForm';
import { LotsPanel } from './components/LotsPanel';
import { CustomerManager } from './components/CustomerManager';
import { CustomerBalances } from './components/CustomerBalances';
import { ExportMenu } from './components/ExportMenu';
import { Login } from './components/Login';
import { Sidebar, Page } from './components/Sidebar';
import { isOverdue, generateId, getTotalPrice, getTotalPaid, getNextCustomerCode } from './utils';

const RESERVATIONS_COLLECTION = 'reservations';
const INVENTORY_COLLECTION = 'inventory';
const CUSTOMERS_COLLECTION = 'customers';
const LOTS_COLLECTION = 'lots';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [role, setRole] = useState<UserRole | null>(null);
  const [roleLoading, setRoleLoading] = useState(true);

  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [lots, setLots] = useState<Lot[]>([]);
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

    return () => {
      unsubReservations();
      unsubInventory();
      unsubCustomers();
      unsubLots();
    };
  }, [user]);

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

    await setDoc(doc(db, RESERVATIONS_COLLECTION, reservation.id), {
      ...reservation,
      customerName: trimmedName,
      customerCode,
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
    if (confirm('¿Estás seguro de que deseas eliminar este registro? Pasará al historial de eliminados.')) {
      await updateDoc(doc(db, RESERVATIONS_COLLECTION, id), {
        status: ReservationStatus.DELETED,
        deletedAt: new Date().toISOString(),
        deletedByEmail: user?.email || 'desconocido',
      });
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
  const overdueCount = reservations.filter((r) => r.status === ReservationStatus.PENDING && isOverdue(r.date)).length;
  const activeReservationsCount = reservations.filter((r) => r.status === ReservationStatus.PENDING).length;
  const pendingLotsCount = lots.filter((l) => l.verificationStatus !== 'confirmed' && l.verificationStatus !== 'flagged').length;
  const flaggedLotsCount = lots.filter((l) => l.verificationStatus === 'flagged').length;

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8fafc]">
        <p className="text-slate-400 font-bold text-sm">Cargando...</p>
      </div>
    );
  }

  if (!user) return <Login />;

  if (dataLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8fafc]">
        <p className="text-slate-400 font-bold text-sm">Cargando datos del negocio...</p>
      </div>
    );
  }

  const pageTitles: Record<Page, string> = {
    inicio: 'Inicio',
    apartados: 'Apartados',
    inventario: 'Inventario',
    clientes: 'Clientes',
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] lg:flex">
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
              <div className="hidden sm:flex bg-rose-100 border border-rose-200 px-3 py-1.5 rounded-xl items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-rose-600"></div>
                <p className="text-rose-700 text-xs font-black">{overdueCount} VENCIDOS</p>
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
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                    <span className="absolute top-4 right-4 bg-rose-600 text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center">{overdueCount}</span>
                  )}
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
                    <span className="absolute top-4 right-4 bg-amber-500 text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center">{pendingLotsCount}</span>
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
                  nextCorrelative={nextCorrelative}
                  customers={customers}
                />
              </div>

              <div className="lg:col-span-3">
                <div className="mb-6 flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-2 rounded-2xl shadow-sm border border-slate-100">
                  <div className="flex flex-wrap p-1 bg-slate-50 rounded-xl w-full sm:w-auto gap-1">
                    <button onClick={() => setFilter('ALL')} className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-black tracking-widest uppercase transition ${filter === 'ALL' ? 'bg-white text-[#1a8a72] shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>TODOS</button>
                    <button onClick={() => setFilter('PENDING')} className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-black tracking-widest uppercase transition ${filter === 'PENDING' ? 'bg-white text-[#1a8a72] shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>PENDIENTES</button>
                    <button onClick={() => setFilter('OVERDUE')} className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-black tracking-widest uppercase transition ${filter === 'OVERDUE' ? 'bg-rose-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>VENCIDOS</button>
                    <button onClick={() => setFilter('PAID')} className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-black tracking-widest uppercase transition ${filter === 'PAID' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>LIQUIDADOS</button>
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
