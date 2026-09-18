import React, { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase';

export const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // Al iniciar sesión con éxito, App.tsx detecta el cambio automáticamente
    } catch (err) {
      setError('Correo o contraseña incorrectos. Verifica tus datos.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#e8f7f2] flex items-center justify-center px-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl border border-slate-200 w-full max-w-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-[#2bb297] rounded-xl shadow-lg shadow-[#2bb297]/30 w-11 h-11 flex items-center justify-center overflow-hidden">
            {!logoFailed ? (
              <img
                src="/logo.png"
                alt="Logo"
                className="w-full h-full object-contain"
                onError={() => setLogoFailed(true)}
              />
            ) : (
              <svg className="w-6 h-6 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"></path>
              </svg>
            )}
          </div>
          <div>
            <h1 className="text-lg font-black text-slate-900 leading-none">Data Vestimenta</h1>
            <p className="text-xs text-slate-400 font-medium">Vestimenta GT</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase mb-1 ml-1 tracking-widest">Correo</label>
            <input
              type="email"
              required
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#2bb297] bg-slate-50"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tucorreo@ejemplo.com"
            />
          </div>
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase mb-1 ml-1 tracking-widest">Contraseña</label>
            <input
              type="password"
              required
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#2bb297] bg-slate-50"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          {error && <p className="text-xs text-[#8c3a4b] font-bold">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#2bb297] hover:bg-[#1a8a72] disabled:bg-slate-300 text-white font-black py-3 rounded-xl transition shadow-lg shadow-[#2bb297]/10 uppercase tracking-widest text-xs"
          >
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  );
};
