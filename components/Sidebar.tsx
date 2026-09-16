import React, { useState } from 'react';
import { UserRole } from '../types';

export type Page = 'inicio' | 'apartados' | 'inventario' | 'clientes';

interface NavItem {
  id: Page;
  label: string;
  icon: React.ReactNode;
}

interface SidebarProps {
  page: Page;
  setPage: (p: Page) => void;
  role: UserRole | null;
  isOpen: boolean;
  onClose: () => void;
}

const navItems: NavItem[] = [
  {
    id: 'inicio',
    label: 'Inicio',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    id: 'apartados',
    label: 'Apartados',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
      </svg>
    ),
  },
  {
    id: 'inventario',
    label: 'Inventario',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    ),
  },
  {
    id: 'clientes',
    label: 'Clientes',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4 4 4 0 004 4zm6 0a4 4 0 10-4-4" />
      </svg>
    ),
  },
];

export const Sidebar: React.FC<SidebarProps> = ({ page, setPage, role, isOpen, onClose }) => {
  const [logoFailed, setLogoFailed] = useState(false);

  const handleNavigate = (p: Page) => {
    setPage(p);
    onClose();
  };

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={onClose}></div>
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-100 flex flex-col transform transition-transform duration-200 lg:translate-x-0 lg:static lg:z-auto ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-5 flex items-center gap-3 border-b border-slate-100">
          <div className="bg-[#2bb297] rounded-xl shadow-md shadow-[#2bb297]/30 w-11 h-11 flex items-center justify-center overflow-hidden shrink-0">
            {!logoFailed ? (
              <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" onError={() => setLogoFailed(true)} />
            ) : (
              <svg className="w-6 h-6 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"></path>
              </svg>
            )}
          </div>
          <div>
            <p className="text-sm font-black text-slate-900 leading-tight">Data Vestimenta</p>
            <p className="text-[10px] text-slate-400 font-bold">Vestimenta GT</p>
          </div>
          <button onClick={onClose} className="ml-auto text-slate-400 hover:text-slate-600 lg:hidden">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => handleNavigate(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold transition ${
                page === item.id
                  ? 'bg-[#2bb297]/10 text-[#1a8a72]'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>

        <div className="p-3 border-t border-slate-100">
          <span
            className={`block w-full text-center text-[10px] font-black uppercase tracking-widest px-2.5 py-1.5 rounded-full ${
              role === 'admin'
                ? 'bg-[#8c3a4b]/10 text-[#8c3a4b] border border-[#8c3a4b]/30'
                : 'bg-[#2bb297]/10 text-[#1a8a72] border border-[#2bb297]/30'
            }`}
          >
            {role === 'admin' ? 'Admin' : 'Tienda'}
          </span>
        </div>
      </aside>
    </>
  );
};
