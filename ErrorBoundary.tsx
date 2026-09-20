import React from 'react';

interface State {
  error: Error | null;
}

// Sin esto, cualquier error de JavaScript en cualquier pantalla deja TODA la
// app en blanco, sin ninguna pista de qué pasó ni cómo salir de ahí. Con esto,
// se muestra un aviso claro y un botón para recargar.
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Error atrapado por ErrorBoundary:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-[#e8f7f2] flex items-center justify-center p-6">
          <div className="bg-white max-w-md w-full rounded-2xl shadow-xl border border-[#8c3a4b]/20 p-6 text-center">
            <div className="w-14 h-14 rounded-full bg-[#8c3a4b]/10 flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-[#8c3a4b]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            </div>
            <h1 className="text-lg font-black text-slate-800 mb-2">Algo salió mal</h1>
            <p className="text-sm text-slate-500 mb-1">
              Ocurrió un error inesperado y esta pantalla no pudo cargar.
            </p>
            <p className="text-[11px] text-slate-400 font-mono bg-slate-50 rounded-lg p-2 mb-4 break-words">
              {this.state.error.message}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="w-full bg-[#2bb297] hover:bg-[#1a8a72] text-white font-black py-3 rounded-xl transition text-xs uppercase tracking-widest"
            >
              Recargar la página
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
