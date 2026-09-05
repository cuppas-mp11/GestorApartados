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
import { Reservation, ReservationStatus, InventoryItem, Payment } from './types';
import { ReservationForm } from './components/ReservationForm';
import { ReservationTable } from './components/ReservationTable';
import { Stats } from './components/Stats';
import { InventoryManager } from './components/InventoryManager';
import { CustomerBalances } from './components/CustomerBalances';
import { ExportMenu } from './components/ExportMenu';
import { Login } from './components/Login';
import { isOverdue, generateId, getTotalPrice, getTotalPaid } from './utils';

const RESERVATIONS_COLLECTION = 'reservations';
const INVENTORY_COLLECTION = 'inventory';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [filter, setFilter] = useState<'ALL' | 'OVERDUE' | 'PENDING'>('ALL');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

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

    return () => {
      unsubReservations();
      unsubInventory();
    };
  }, [user]);

  const addReservation = async (reservation: Reservation) => {
    await setDoc(doc(db, RESERVATIONS_COLLECTION, reservation.id), reservation);
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
    if (confirm('¿Estás seguro de que deseas eliminar este registro? Esta acción no se puede deshacer.')) {
      await deleteDoc(doc(db, RESERVATIONS_COLLECTION, id));
    }
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
    return true;
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
            <div className="bg-blue-600 text-white p-3 rounded-2xl shadow-xl shadow-blue-200">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"></path>
              </svg>
            </div>
            <div>
              <h1 className="text-3xl font-black text-slate-900 tracking-tight leading-none">Gestor de Apartados</h1>
              <p className="mt-1 text-slate-500 font-medium">Boutique &amp; Moda GT</p>
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
            <CustomerBalances reservations={reservations} />
            <ReservationForm
              onAdd={addReservation}
              inventory={inventory}
              nextCorrelative={nextCorrelative}
              existingReservations={reservations}
            />
          </div>

          <div className="lg:col-span-3">
            <div className="mb-6 flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-2 rounded-2xl shadow-sm border border-slate-100">
              <div className="flex p-1 bg-slate-50 rounded-xl w-full sm:w-auto">
                <button
                  onClick={() => setFilter('ALL')}
                  className={`flex-1 sm:flex-none px-6 py-2 rounded-lg text-xs font-black tracking-widest uppercase transition ${filter === 'ALL' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  TODOS
                </button>
                <button
                  onClick={() => setFilter('PENDING')}
                  className={`flex-1 sm:flex-none px-6 py-2 rounded-lg text-xs font-black tracking-widest uppercase transition ${filter === 'PENDING' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  PENDIENTES
                </button>
                <button
                  onClick={() => setFilter('OVERDUE')}
                  className={`flex-1 sm:flex-none px-6 py-2 rounded-lg text-xs font-black tracking-widest uppercase transition ${filter === 'OVERDUE' ? 'bg-rose-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  VENCIDOS
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
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
