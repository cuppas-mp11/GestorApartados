import React, { useState } from 'react';

export interface ResetCollectionOption {
  key: string;
  label: string;
  hint?: string;
  defaultChecked: boolean;
}

// Solo colecciones de "movimiento" — nunca catálogo, usuarios ni configuración.
// Eso se controla desde aquí mismo, no en App.tsx, para que quede claro y en
// un solo lugar qué se puede borrar y qué nunca aparece como opción.
export const RESET_OPTIONS: ResetCollectionOption[] = [
  { key: 'sales', label: 'Ventas', defaultChecked: true },
  { key: 'reservations', label: 'Apartados', defaultChecked: true },
  { key: 'lots', label: 'Lotes de mercadería', defaultChecked: true },
  { key: 'creditLedger', label: 'Bitácora de saldo a favor', defaultChecked: true },
  { key: 'editLogs', label: 'Historial de ediciones', defaultChecked: true },
  { key: 'expenses', label: 'Gastos registrados', defaultChecked: true },
  { key: 'pacas', label: 'Catálogo de pacas', defaultChecked: true },
  { key: 'pacaReconciliations', label: 'Costeos por sticker', defaultChecked: true },
  {
    key: 'customers',
    label: 'Clientas (libreta)',
    hint: 'Déjalo sin marcar si alguna clienta ya es real y quieres conservarla.',
    defaultChecked: false,
  },
];

const CONFIRM_WORD = 'BORRAR';

interface DataResetPanelProps {
  busy: boolean;
  onReset: (collections: string[]) => void;
}

export const DataResetPanel: React.FC<DataResetPanelProps> = ({ busy, onReset }) => {
  const [checked, setChecked] = useState<Record<string, boolean>>(
    Object.fromEntries(RESET_OPTIONS.map((o) => [o.key, o.defaultChecked]))
  );
  const [confirmText, setConfirmText] = useState('');
  const [open, setOpen] = useState(false);

  const selected = RESET_OPTIONS.filter((o) => checked[o.key]).map((o) => o.key);
  const canSubmit = selected.length > 0 && confirmText.trim().toUpperCase() === CONFIRM_WORD && !busy;

  const toggle = (key: string) => setChecked((prev) => ({ ...prev, [key]: !prev[key] }));

  const handleSubmit = () => {
    if (!canSubmit) return;
    const names = RESET_OPTIONS.filter((o) => selected.includes(o.key)).map((o) => o.label).join(', ');
    const ok = confirm(
      `Vas a borrar PERMANENTEMENTE: ${names}.\n\nEsto no se puede deshacer. ¿Seguro que quieres continuar?`
    );
    if (!ok) return;
    onReset(selected);
    setConfirmText('');
    setOpen(false);
  };

  return (
    <div className="bg-white p-5 rounded-2xl shadow-sm border border-[#8c3a4b]/20">
      <p className="text-[10px] font-black text-[#8c3a4b] uppercase tracking-widest mb-1">Reiniciar datos de prueba</p>
      <p className="text-[10px] text-slate-400 font-bold mb-4">
        Borra la información de movimiento (ventas, apartados, lotes, gastos, etc.) para empezar de cero, por ejemplo al pasar de una etapa de prueba a otra. Tu catálogo de prendas, usuarios y configuración financiera (comisiones, costos por prenda, categorías de gasto) **nunca** se tocan aquí.
      </p>

      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="w-full py-2.5 border-2 border-dashed border-[#8c3a4b]/30 rounded-lg text-[11px] font-black text-[#8c3a4b] hover:bg-[#8c3a4b]/5 transition uppercase tracking-widest"
        >
          Abrir opciones de reinicio
        </button>
      ) : (
        <div className="space-y-3">
          <div className="space-y-2">
            {RESET_OPTIONS.map((opt) => (
              <label key={opt.key} className="flex items-start gap-2.5 bg-slate-50 rounded-lg px-3 py-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5 accent-[#8c3a4b]"
                  checked={!!checked[opt.key]}
                  onChange={() => toggle(opt.key)}
                />
                <span>
                  <span className="block text-xs font-bold text-slate-700">{opt.label}</span>
                  {opt.hint && <span className="block text-[10px] text-slate-400 font-bold">{opt.hint}</span>}
                </span>
              </label>
            ))}
          </div>

          <div className="bg-[#8c3a4b]/5 border border-[#8c3a4b]/20 rounded-lg px-3 py-2.5">
            <p className="text-[11px] font-bold text-[#8c3a4b] mb-2">
              Para confirmar, escribe <span className="font-black">{CONFIRM_WORD}</span> abajo:
            </p>
            <input
              type="text"
              className="w-full px-3 py-2 border border-[#8c3a4b]/30 rounded-lg text-sm font-bold"
              placeholder={CONFIRM_WORD}
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="flex-1 bg-[#8c3a4b] hover:bg-[#7a2f3e] disabled:opacity-40 disabled:cursor-not-allowed text-white font-black py-2.5 rounded-lg text-xs uppercase tracking-widest transition"
            >
              {busy ? 'Borrando...' : `Borrar lo seleccionado (${selected.length})`}
            </button>
            <button
              onClick={() => { setOpen(false); setConfirmText(''); }}
              disabled={busy}
              className="px-4 bg-slate-200 text-slate-600 rounded-lg text-xs font-bold"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
