import React, { useEffect, useState } from 'react';

// Ventana de confirmación con el diseño del sistema: centrada, con sombra y
// borde negro, siempre por encima de cualquier otra ventana (como la de Venta
// Nueva). Reemplaza al cuadro feo del navegador ("... dice").
//
// Uso (desde cualquier lugar, dentro de una función async):
//   if (!(await confirmDialog('¿Eliminar este gasto?', { danger: true }))) return;

interface ConfirmOptions {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean; // botón rojo (para borrar, anular, descartar)
  hideCancel?: boolean; // ventana informativa: solo botón de aceptar
}

interface ConfirmRequest extends ConfirmOptions {
  message: string;
  resolve: (value: boolean) => void;
}

let showRequest: ((req: ConfirmRequest) => void) | null = null;

export const confirmDialog = (message: string, options: ConfirmOptions = {}): Promise<boolean> =>
  new Promise((resolve) => {
    // Si por alguna razón la ventana aún no está montada, se usa la del navegador.
    if (!showRequest) {
      resolve(window.confirm(message));
      return;
    }
    showRequest({ message, ...options, resolve });
  });

// Se monta UNA sola vez en App.tsx.
// Ventana informativa (solo "Entendido"), con el mismo diseño.
export const infoDialog = (message: string, options: ConfirmOptions = {}): Promise<boolean> =>
  confirmDialog(message, { title: 'Aviso', confirmLabel: 'Entendido', hideCancel: true, ...options });

export const ConfirmHost: React.FC = () => {
  const [req, setReq] = useState<ConfirmRequest | null>(null);

  useEffect(() => {
    showRequest = (r) => setReq(r);
    return () => { showRequest = null; };
  }, []);

  const close = (value: boolean) => {
    req?.resolve(value);
    setReq(null);
  };

  useEffect(() => {
    if (!req) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req]);

  if (!req) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={() => close(false)}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        className="bg-white w-full max-w-sm rounded-2xl border-2 border-slate-900 shadow-[0_25px_60px_-10px_rgba(0,0,0,0.55)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-6 pb-4">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{req.title || 'Confirmar'}</p>
          <p className="text-sm font-bold text-slate-800 leading-relaxed whitespace-pre-line">{req.message}</p>
        </div>
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex gap-3 justify-end">
          {!req.hideCancel && (
            <button
              autoFocus
              onClick={() => close(false)}
              className="px-5 py-2.5 bg-white border border-slate-300 text-slate-600 hover:bg-slate-100 text-xs font-black rounded-xl uppercase tracking-wide transition"
            >
              {req.cancelLabel || 'Cancelar'}
            </button>
          )}
          <button
            onClick={() => close(true)}
            className={`px-5 py-2.5 text-white text-xs font-black rounded-xl uppercase tracking-wide transition shadow-sm ${req.danger ? 'bg-[#8c3a4b] hover:bg-[#6f2d3a]' : 'bg-[#2bb297] hover:bg-[#1a8a72]'}`}
          >
            {req.confirmLabel || 'Aceptar'}
          </button>
        </div>
      </div>
    </div>
  );
};
