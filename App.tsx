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
import { Reservation, ReservationStatus, InventoryItem, Payment, UserRole, EditLogEntry, Customer } from './types';
import { ReservationForm } from './components/ReservationForm';
import { ReservationTable } from './components/ReservationTable';
import { Stats } from './components/Stats';
import { InventoryManager } from './components/InventoryManager';
import { CustomerManager } from './components/CustomerManager';
import { CustomerBalances } from './components/CustomerBalances';
import { ExportMenu } from './components/ExportMenu';
import { Login } from './components/Login';
import { isOverdue, generateId, getTotalPrice, getTotalPaid, getNextCustomerCode } from './utils';

const RESERVATIONS_COLLECTION = 'reservations';
const INVENTORY_COLLECTION = 'inventory';
const CUSTOMERS_COLLECTION = 'customers';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [role, setRole] = useState<UserRole | null>(null);
  const [roleLoading, setRoleLoading] = useState(true);

  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [filter, setFilter] = useState<'ALL' | 'OVERDUE' | 'PENDING' | 'PAID' | 'CANCELLED' | 'DELETED'>('ALL');
  const [logoFailed, setLogoFailed] = useState(false);

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
          // Si no tiene un rol asignado todavía, se trata como "employee" (el más restringido) por seguridad
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

    return () => {
      unsubReservations();
      unsubInventory();
      unsubCustomers();
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

  // Antes borraba el documento para siempre. Ahora lo "archiva" (soft-delete):
  // el registro sigue existiendo y aparece en la pestaña "Eliminados" del historial.
  // Las reglas de Firebase (ver GUIA_FIREBASE.md) impiden que alguien sin rol
  // "admin" pueda completar esta acción, aunque intente saltarse el botón.
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

  // Corrige un dato de un apartado (ej. nombre o teléfono mal escritos) y deja
  // constancia de quién hizo el cambio y cuándo, tanto en el registro como en
  // una colección aparte de historial de ediciones.
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
    // 'ALL' (Todos): todo excepto lo archivado/eliminado, para mantener limpia la vista principal
    return res.status !== ReservationStatus.DELETED;
  });

  const nextCorrelative = reservations.length > 0 ? Math.max(...reservations.map((r) => r.correlative)) + 1 : 1;
  const overdueCount = reservations.filter((r) => r.status === ReservationStatus.PENDING && isOverdue(r.date)).length;

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

  return (
    <div className="min-h-screen bg-[#f8fafc] py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="bg-[#2bb297] text-black p-3 rounded-2xl shadow-xl shadow-[#2bb297]/30 w-14 h-14 flex items-center justify-center overflow-hidden">
              {!logoFailed ? (
                <img
                  src="/logo.png"
                  alt="Logo"
                  className="w-full h-full object-contain"
                  onError={() => setLogoFailed(true)}
                />
              ) : (
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"></path>
                </svg>
              )}
            </div>
            <div>
              <h1 className="text-3xl font-black text-slate-900 tracking-tight leading-none">Gestor de Apartados</h1>
              <p className="mt-1 text-slate-500 font-medium">Vestimenta GT</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <ExportMenu reservations={reservations} />
            {overdueCount > 0 && (
              <div className="bg-rose-100 border border-rose-200 px-4 py-2 rounded-xl flex items-center gap-3 animate-pulse">
                <div className="h-2 w-2 rounded-full bg-rose-600"></div>
                <p className="text-rose-700 text-sm font-black">{overdueCount} ALERTAS DE VENCIMIENTO</p>
              </div>
            )}
            <button
              onClick={() => signOut(auth)}
              className="text-xs font-black text-slate-400 hover:text-slate-600 uppercase tracking-widest px-3 py-2"
              title={user.email || ''}
            >
              Cerrar sesión
            </button>
          </div>
        </header>

        <Stats reservations={reservations} />

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          <div className="lg:col-span-1 space-y-4">
            <InventoryManager items={inventory} onUpdate={handleInventoryUpdate} />
            <CustomerManager customers={customers} onUpdate={updateCustomer} onDelete={deleteCustomer} />
            <CustomerBalances reservations={reservations} />
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
                <button
                  onClick={() => setFilter('ALL')}
                  className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-black tracking-widest uppercase transition ${filter === 'ALL' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  TODOS
                </button>
                <button
                  onClick={() => setFilter('PENDING')}
                  className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-black tracking-widest uppercase transition ${filter === 'PENDING' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  PENDIENTES
                </button>
                <button
                  onClick={() => setFilter('OVERDUE')}
                  className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-black tracking-widest uppercase transition ${filter === 'OVERDUE' ? 'bg-rose-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  VENCIDOS
                </button>
                <button
                  onClick={() => setFilter('PAID')}
                  className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-black tracking-widest uppercase transition ${filter === 'PAID' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  LIQUIDADOS
                </button>
                <button
                  onClick={() => setFilter('CANCELLED')}
                  className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-black tracking-widest uppercase transition ${filter === 'CANCELLED' ? 'bg-slate-500 text-white shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  LIBERADOS
                </button>
                <button
                  onClick={() => setFilter('DELETED')}
                  className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-black tracking-widest uppercase transition ${filter === 'DELETED' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  ELIMINADOS
                </button>
              </div>
              <div className="px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                Mostrando {filteredReservations.length} de {reservations.length} registros
              </div>
            </div>

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
      </div>
    </div>
  );
};

export default App;
