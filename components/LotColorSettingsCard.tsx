import React, { useState } from 'react';
import { LotColorSettings, ManualPriceException } from '../types';
import {
  getDisplayName, formatDate, formatCurrency,
  getActiveLotColors, getLotColorForDate, getLotColorStyle,
} from '../utils';

interface LotColorSettingsCardProps {
  settings: LotColorSettings;
  aliases: Record<string, string>;
  onSave: (updates: Omit<LotColorSettings, 'updatedByEmail' | 'updatedAt'>) => void;
}

// Siempre 8 casillas de color en el formulario: las primeras (las que tengan
// texto) son el ciclo real, las que queden vacías son "reserva" para cuando
// el plazo se alargue a 7 u 8 semanas — tal como lo define el documento de
// la tienda. No se obliga a llenar las 8.
const COLOR_SLOTS = 8;

const pctToStr = (v: number) => String(Math.round((v || 0) * 10000) / 100);
const strToPct = (s: string) => (parseFloat(s) || 0) / 100;

export const LotColorSettingsCard: React.FC<LotColorSettingsCardProps> = ({ settings, aliases, onSave }) => {
  const [editing, setEditing] = useState(false);
  const [firstLotDate, setFirstLotDate] = useState(settings.firstLotDate);
  const [colors, setColors] = useState<string[]>(
    Array.from({ length: COLOR_SLOTS }, (_, i) => settings.colors?.[i] || '')
  );
  const [daysToFirstDiscount, setDaysToFirstDiscount] = useState(String(settings.daysToFirstDiscount));
  const [daysToFinalDiscount, setDaysToFinalDiscount] = useState(String(settings.daysToFinalDiscount));
  const [daysToPullout, setDaysToPullout] = useState(String(settings.daysToPullout));
  const [firstDiscountPercent, setFirstDiscountPercent] = useState(pctToStr(settings.firstDiscountPercent));
  const [finalDiscountPercent, setFinalDiscountPercent] = useState(pctToStr(settings.finalDiscountPercent));
  const [roundTo, setRoundTo] = useState(String(settings.roundTo));
  const [priceFloor, setPriceFloor] = useState(String(settings.priceFloor));
  const [wholesalePrice, setWholesalePrice] = useState(String(settings.wholesalePrice));
  const [exceptions, setExceptions] = useState<ManualPriceException[]>(settings.manualExceptions || []);
  const [error, setError] = useState('');

  const startEdit = () => {
    setFirstLotDate(settings.firstLotDate);
    setColors(Array.from({ length: COLOR_SLOTS }, (_, i) => settings.colors?.[i] || ''));
    setDaysToFirstDiscount(String(settings.daysToFirstDiscount));
    setDaysToFinalDiscount(String(settings.daysToFinalDiscount));
    setDaysToPullout(String(settings.daysToPullout));
    setFirstDiscountPercent(pctToStr(settings.firstDiscountPercent));
    setFinalDiscountPercent(pctToStr(settings.finalDiscountPercent));
    setRoundTo(String(settings.roundTo));
    setPriceFloor(String(settings.priceFloor));
    setWholesalePrice(String(settings.wholesalePrice));
    setExceptions(settings.manualExceptions || []);
    setError('');
    setEditing(true);
  };

  const updateColor = (i: number, value: string) =>
    setColors((prev) => prev.map((c, idx) => (idx === i ? value.toUpperCase() : c)));

  const addException = () => setExceptions((prev) => [...prev, { normalPrice: 0, firstDiscountPrice: 0, finalDiscountPrice: 0 }]);
  const removeException = (idx: number) => setExceptions((prev) => prev.filter((_, i) => i !== idx));
  const updateException = (idx: number, updates: Partial<ManualPriceException>) =>
    setExceptions((prev) => prev.map((e, i) => (i === idx ? { ...e, ...updates } : e)));

  const save = () => {
    const cleanColors = colors.map((c) => c.trim().toUpperCase());
    const activeColors = cleanColors.filter(Boolean);
    if (activeColors.length === 0) {
      setError('Agrega al menos un color.');
      return;
    }
    const d1 = parseInt(daysToFirstDiscount, 10);
    const d2 = parseInt(daysToFinalDiscount, 10);
    const d3 = parseInt(daysToPullout, 10);
    if ([d1, d2, d3].some((v) => isNaN(v) || v < 0)) {
      setError('Los días deben ser números válidos.');
      return;
    }
    if (!(d1 < d2 && d2 < d3)) {
      setError('Los días deben ir en orden: primer descuento < descuento final < sacar de estantes.');
      return;
    }
    const p1 = strToPct(firstDiscountPercent);
    const p2 = strToPct(finalDiscountPercent);
    if (p1 < 0 || p1 > 1 || p2 < 0 || p2 > 1) {
      setError('Los porcentajes de descuento deben estar entre 0% y 100%.');
      return;
    }
    const rt = parseFloat(roundTo);
    const pf = parseFloat(priceFloor);
    const wp = parseFloat(wholesalePrice);
    if ([rt, pf, wp].some((v) => isNaN(v) || v < 0)) {
      setError('Redondeo, piso de precio y precio mayorista deben ser números válidos.');
      return;
    }
    const cleanExceptions = exceptions.filter((e) => e.normalPrice > 0);
    if (cleanExceptions.some((e) => e.firstDiscountPrice < 0 || e.finalDiscountPrice < 0)) {
      setError('Los precios de excepción no pueden ser negativos.');
      return;
    }

    onSave({
      firstLotDate,
      colors: cleanColors,
      daysToFirstDiscount: d1,
      daysToFinalDiscount: d2,
      daysToPullout: d3,
      firstDiscountPercent: p1,
      finalDiscountPercent: p2,
      roundTo: rt,
      priceFloor: pf,
      manualExceptions: cleanExceptions,
      wholesalePrice: wp,
    });
    setEditing(false);
  };

  const activeColors = getActiveLotColors(settings);
  const todayColor = getLotColorForDate(new Date(), settings);
  const weeksNeeded = settings.daysToPullout > 0 ? Math.round(settings.daysToPullout / 7) : 0;

  if (!editing) {
    return (
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Lotes por color</p>
          <button onClick={startEdit} className="text-[10px] font-black text-[#2bb297] hover:text-[#1a8a72] uppercase">
            Editar
          </button>
        </div>

        <div className="bg-slate-50 rounded-xl p-3 mb-3 text-center">
          <p className="text-[8px] font-black text-slate-400 uppercase leading-tight mb-1.5">Color de esta semana</p>
          {todayColor ? (
            <span
              className="inline-block text-lg font-black px-3 py-1 rounded-full"
              style={{ backgroundColor: getLotColorStyle(todayColor).bg, color: getLotColorStyle(todayColor).text }}
            >
              {todayColor}
            </span>
          ) : (
            <p className="text-lg font-black text-[#1a8a72]">—</p>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5 mb-4">
          {activeColors.map((c) => {
            const style = getLotColorStyle(c);
            return (
              <span
                key={c}
                className={`text-[10px] font-black px-2 py-1 rounded-full ${c === todayColor ? 'ring-2 ring-[#2bb297] ring-offset-1' : ''}`}
                style={{ backgroundColor: style.bg, color: style.text }}
              >
                {c}
              </span>
            );
          })}
        </div>

        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="bg-slate-50 rounded-xl p-2.5 text-center">
            <p className="text-[8px] font-black text-slate-400 uppercase leading-tight">Rebajado</p>
            <p className="text-sm font-black text-[#8a6a3f] mt-1">Día {settings.daysToFirstDiscount}</p>
            <p className="text-[8px] text-slate-400 font-bold mt-0.5">-{Math.round(settings.firstDiscountPercent * 100)}%</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-2.5 text-center">
            <p className="text-[8px] font-black text-slate-400 uppercase leading-tight">Última oport.</p>
            <p className="text-sm font-black text-[#8c3a4b] mt-1">Día {settings.daysToFinalDiscount}</p>
            <p className="text-[8px] text-slate-400 font-bold mt-0.5">-{Math.round(settings.finalDiscountPercent * 100)}%</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-2.5 text-center">
            <p className="text-[8px] font-black text-slate-400 uppercase leading-tight">Sacar estantes</p>
            <p className="text-sm font-black text-slate-600 mt-1">Día {settings.daysToPullout}</p>
            <p className="text-[8px] text-slate-400 font-bold mt-0.5">{formatCurrency(settings.wholesalePrice)} mayorista</p>
          </div>
        </div>

        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Excepciones de precio</p>
        {(!settings.manualExceptions || settings.manualExceptions.length === 0) ? (
          <p className="text-[11px] text-slate-400 font-bold">Ninguna.</p>
        ) : (
          <div className="space-y-1">
            {settings.manualExceptions.map((e, i) => (
              <div key={i} className="flex items-center justify-between text-[11px] bg-slate-50 rounded-lg px-3 py-1.5">
                <span className="font-bold text-slate-600">{formatCurrency(e.normalPrice)}</span>
                <span className="font-black text-slate-700">{formatCurrency(e.firstDiscountPrice)} / {formatCurrency(e.finalDiscountPrice)}</span>
              </div>
            ))}
          </div>
        )}

        <p className="text-[9px] text-slate-400 font-bold mt-3 pt-2 border-t border-slate-100">
          Primer lote: {formatDate(settings.firstLotDate)} · redondeo Q{settings.roundTo} · piso Q{settings.priceFloor}
        </p>
        {settings.updatedAt && (
          <p className="text-[9px] text-slate-400 font-bold mt-1">
            Última actualización: {formatDate(settings.updatedAt)} · {getDisplayName(settings.updatedByEmail, aliases)}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Editar lotes por color</p>

      <div className="space-y-3 mb-4">
        <div>
          <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">
            Fecha del primer lote con color <span className="normal-case text-slate-400">— ancla el ciclo (semana 1)</span>
          </label>
          <input
            type="date"
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm font-bold"
            value={firstLotDate}
            onChange={(e) => setFirstLotDate(e.target.value)}
          />
        </div>

        <div>
          <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">
            Ciclo de colores <span className="normal-case text-slate-400">— los últimos pueden quedar vacíos, como reserva</span>
          </label>
          <div className="grid grid-cols-4 gap-2">
            {colors.map((c, i) => {
              const style = c ? getLotColorStyle(c) : null;
              return (
              <input
                key={i}
                type="text"
                className="px-2 py-1.5 border-2 rounded-lg text-xs font-black text-center uppercase"
                style={style ? { backgroundColor: style.bg, color: style.text, borderColor: style.bg } : undefined}
                placeholder={i < 6 ? `Color ${i + 1}` : `Reserva ${i + 1}`}
                value={c}
                onChange={(e) => updateColor(i, e.target.value)}
              />
              );
            })}
          </div>
          {weeksNeeded > 0 && (
            <p className="text-[9px] text-slate-400 font-bold mt-1">
              Con "sacar de estantes" en el día {settings.daysToPullout}, conviene tener {weeksNeeded} colores en uso (uno por cada semana que un lote pasa en tienda).
            </p>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Día: rebajado</label>
            <input type="number" min="0" className="w-full px-2 py-2 border border-[#c9a876]/40 rounded-lg text-sm font-black bg-[#c9a876]/10 text-center" value={daysToFirstDiscount} onChange={(e) => setDaysToFirstDiscount(e.target.value)} />
          </div>
          <div>
            <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Día: última op.</label>
            <input type="number" min="0" className="w-full px-2 py-2 border border-[#8c3a4b]/30 rounded-lg text-sm font-black bg-[#8c3a4b]/5 text-center" value={daysToFinalDiscount} onChange={(e) => setDaysToFinalDiscount(e.target.value)} />
          </div>
          <div>
            <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Día: sacar</label>
            <input type="number" min="0" className="w-full px-2 py-2 border border-slate-200 rounded-lg text-sm font-black text-center" value={daysToPullout} onChange={(e) => setDaysToPullout(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">% primer descuento</label>
            <input type="number" step="any" min="0" max="100" className="w-full px-2 py-2 border border-[#c9a876]/40 rounded-lg text-sm font-black bg-[#c9a876]/10 text-center" value={firstDiscountPercent} onChange={(e) => setFirstDiscountPercent(e.target.value)} />
          </div>
          <div>
            <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">% descuento final</label>
            <input type="number" step="any" min="0" max="100" className="w-full px-2 py-2 border border-[#8c3a4b]/30 rounded-lg text-sm font-black bg-[#8c3a4b]/5 text-center" value={finalDiscountPercent} onChange={(e) => setFinalDiscountPercent(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Redondear a Q</label>
            <input type="number" min="0" className="w-full px-2 py-2 border border-slate-200 rounded-lg text-sm font-bold text-center" value={roundTo} onChange={(e) => setRoundTo(e.target.value)} />
          </div>
          <div>
            <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Piso de precio Q</label>
            <input type="number" min="0" className="w-full px-2 py-2 border border-slate-200 rounded-lg text-sm font-bold text-center" value={priceFloor} onChange={(e) => setPriceFloor(e.target.value)} />
          </div>
          <div>
            <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Precio mayorista Q</label>
            <input type="number" min="0" className="w-full px-2 py-2 border border-slate-200 rounded-lg text-sm font-bold text-center" value={wholesalePrice} onChange={(e) => setWholesalePrice(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="border-t border-slate-100 pt-3">
        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">
          Excepciones de precio <span className="normal-case text-slate-400">(cuando el redondeo normal no cuadra, ej. Q35 y Q40)</span>
        </p>
        <div className="space-y-2">
          {exceptions.map((exc, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="flex-1">
                <input type="number" min="0" className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs font-bold text-center" placeholder="Precio normal" value={exc.normalPrice || ''} onChange={(e) => updateException(i, { normalPrice: parseFloat(e.target.value) || 0 })} />
              </div>
              <span className="text-slate-300 text-xs">→</span>
              <div className="flex-1">
                <input type="number" min="0" className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs font-bold text-center" placeholder="Rebajado" value={exc.firstDiscountPrice || ''} onChange={(e) => updateException(i, { firstDiscountPrice: parseFloat(e.target.value) || 0 })} />
              </div>
              <div className="flex-1">
                <input type="number" min="0" className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs font-bold text-center" placeholder="Última op." value={exc.finalDiscountPrice || ''} onChange={(e) => updateException(i, { finalDiscountPrice: parseFloat(e.target.value) || 0 })} />
              </div>
              <button onClick={() => removeException(i)} className="text-[#8c3a4b]/60 hover:text-[#8c3a4b] px-1">✕</button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addException}
          className="w-full mt-2 py-1.5 border-2 border-dashed border-slate-200 rounded-lg text-[10px] font-black text-slate-400 hover:border-[#2bb297] hover:text-[#1a8a72] transition uppercase"
        >
          + Agregar excepción de precio
        </button>
      </div>

      {error && <p className="text-[10px] text-[#8c3a4b] font-bold mt-3">{error}</p>}

      <div className="flex gap-2 mt-4">
        <button onClick={save} className="flex-1 bg-[#2bb297] text-white text-xs font-bold py-2 rounded-lg">Guardar todo</button>
        <button onClick={() => setEditing(false)} className="flex-1 bg-slate-200 text-slate-600 text-xs font-bold py-2 rounded-lg">Cancelar</button>
      </div>
    </div>
  );
};
