# Contexto del proyecto: Data Vestimenta GT

Pega este documento al inicio de un chat nuevo, junto con el `.zip` más reciente del proyecto y el Excel `Panorama_Data_Vestimenta.xlsx`, para que Claude retome el trabajo sin tener que releer conversaciones anteriores.

## Sobre el negocio

Tienda de ropa de **segunda mano / retorno, premium, exclusivamente para mujer**, llamada **Vestimenta GT**. Las prendas son únicas (no hay múltiples unidades idénticas), y se agrupan en el sistema por **categoría + precio** (ej. código `BLUSA25` = "todas las blusas que se venden a Q25", sin importar que cada una sea distinta físicamente). Llega mercadería nueva aproximadamente una vez por semana.

## Sobre el sistema (Data Vestimenta)

- **Nombre del proyecto**: "Data Vestimenta" (antes se llamaba "Gestor de Apartados", que era su función original).
- **Stack técnico**: React + TypeScript + Vite, estilos con Tailwind (vía CDN en `index.html`, sin build de Tailwind). Reportes con `jspdf` + `jspdf-autotable` (PDF) y `xlsx` (Excel), todo en el navegador, sin servidor.
- **Base de datos**: Firebase Firestore (tiempo real).
- **Autenticación**: Firebase Auth (correo + contraseña).
- **Hosting**: Vercel, conectado a un repositorio de GitHub.
- **Flujo de actualización**: editar archivos localmente → GitHub Desktop (Commit → Push) → Vercel republica solo.
- **3 usuarios**: 1 dueña/administradora (rol `admin`) + empleada(s) de tienda (rol `employee`). Cada usuario puede tener un **alias** corto (ej. "Ana") en vez de mostrarse su correo completo en todo el sistema.
- Hay un `ErrorBoundary` general: si algo llegara a fallar en cualquier pantalla, se muestra un aviso con botón de recargar en vez de pantalla en blanco.

## Colecciones de Firestore actuales

- `reservations` — Apartados de clientes. Estado PENDING/PAID/CANCELLED/DELETED (soft-delete). Guarda `stockAllocations` (de qué lote se descontó el stock) y, desde Fase 2.5, `creditIssued`/`creditAmount` si al liberarse (por vencido) generó saldo a favor.
- `sales` — Ventas (tanto "Venta del día" rápida como "Venta detallada"). Cada venta: `items[]` (con descuento opcional por desperfecto), `payments[]` (**lista** de pagos — una venta puede combinar varios métodos: efectivo, tarjeta, transferencia, otro, o **saldo a favor**, este último ligado a un `customerId` real de la libreta), `quickEntry` (si vino del modo rápido), `stockAllocations`, estado COMPLETED/CANCELLED, y rastro de edición (`editedAt`/`editedByEmail`) si un admin la corrigió.
- `creditLedger` — **(Fase 2.5)** Bitácora inmutable de saldo a favor: cada vez que una clienta gana saldo (apartado vencido liberado) o lo usa (pagó una venta con saldo), o un admin hace un ajuste manual, queda un registro aquí. Nunca se edita ni se borra, solo se agregan filas.
- `inventory` — Catálogo de prendas: código, nombre del grupo, categoría (opcional), precio de venta. No guarda cantidad — el stock se calcula sumando los lotes.
- `customers` — Libreta de clientes (nombre + teléfono + código). Desde Fase 2.5 incluye `creditBalance` (saldo a favor disponible).
- `lots` — Lotes de mercadería recibida (código, etiqueta de semana, fecha de entrada, cantidad ingresada/restante, verificación cruzada).
- `roles` — Un documento por usuario (ID = su UID de Firebase Auth): `role` (admin/employee), `email`, y opcionalmente `alias`. Solo editable manualmente desde la consola de Firebase.
- `editLogs` — Historial de correcciones a datos de apartados.
- `baleCosts` — **(Fase 3, visible SOLO para admin)** Historial de cálculos de costo por "paca" (paquete de ropa comprado por precio y cantidad): `balePrice`, `quantity`, `unitCost` (ya calculado), `date`, `note?`. El cálculo más reciente es el "costo vigente" que se usa para estimar la ganancia real.
- `expenses` — **(Fase 3, visible SOLO para admin)** Gastos fijos/variables del negocio: `category` (renta/planilla/servicios/empaque/otro), `frequency` (fixed/variable), `amount`, `date`, `note?`.
- `settings` — **(Fase 3, visible SOLO para admin)** Un solo documento (ID `finance`) con: `cardCommissionPercent` (% del procesador de tarjeta, ej. Visa, solo aplica a tarjeta), `invoiceTaxPercent` (% de IVA de factura, aplica a tarjeta Y transferencia/depósito), `vendorCommissionPercent` (% que recibe la vendedora sobre la ganancia neta del periodo), y `unitCosts[]` (lista editable de costos por cada prenda vendida, ej. Planchado Q5.00, Empaque Q0.08 — no son gasto mensual, se multiplican por la cantidad de prendas vendidas). Todo editable en cualquier momento.

## Reglas de seguridad ya configuradas

Solo `admin` puede: eliminar apartados (soft-delete), eliminar lotes, corregir cantidades de lotes reportados con problema, **anular una venta**, y **editar una venta ya guardada**. Cualquier usuario autenticado puede: crear/editar apartados, registrar ventas, agregar prendas al catálogo, verificar/reportar lotes, editar su libreta de clientes.

**`baleCosts`, `expenses` y `settings` (Fase 3) son de acceso exclusivo para `admin`** — a diferencia de las demás colecciones (que cualquier usuario autenticado puede leer), estas tres tienen `allow read, write` condicionado a `role == 'admin'`, para que una empleada no pueda ver costos, gastos ni rentabilidad, ni por pantalla ni forzando la base de datos por fuera.

Las reglas completas están en `GUIA_FIREBASE.md` dentro del proyecto (Paso 10 tiene el bloque completo y actualizado, incluidas las tres colecciones nuevas de Fase 3).

## Sistema de stock (descuento real, FIFO)

El stock se descuenta de verdad en cada apartado y cada venta, tomando primero el lote más antiguo de esa prenda (FIFO), dentro de una transacción de Firestore (evita que dos ventas simultáneas "vendan" la misma prenda dos veces, y valida que haya stock suficiente antes de guardar). Se devuelve automáticamente si se libera un apartado pendiente, se elimina uno que seguía pendiente, se anula una venta, o un admin edita una venta cambiando las prendas.

## Saldo a favor (Fase 2.5)

- Se genera **solo** cuando un apartado **vencido** (más de 15 días) se libera y ya tenía abono — ese abono no se devuelve en efectivo, se acredita como saldo a favor de la clienta. Si se libera antes de vencer, no genera saldo.
- Para pagar con "Saldo a Favor" en una venta, la clienta **debe** ya estar en la libreta (se busca por nombre/código en un panel lateral que muestra su saldo disponible).
- El saldo y su bitácora de movimientos se ven en la pantalla de **Clientes**; un admin puede hacer ajustes manuales ahí mismo.
- Si un admin anula o edita una venta que se pagó con saldo, ese saldo se le devuelve a la clienta.

## Pantalla de Ventas

Dos pestañas:
- **"Venta del día" (modo rápido, la que abre por defecto)**: una fila por prenda vendida (prenda, cantidad, método de pago, descuento opcional), sin necesidad de cliente. Cada fila se guarda sola en cuanto se completa. Incluye botón **"Pago combinado"** (aparte de los métodos sueltos y de "Saldo a favor") para dividir el pago de una línea entre varios métodos a la vez — no deja continuar hasta que la suma cuadre exacto con el total. Filtros de un clic arriba de la tabla: Todos / Efectivo / Tarjeta / Depósito / Otro / Saldo / Con descuento. La numeración de la columna "#" **reinicia en 1 cada día** (aunque por dentro cada venta sigue teniendo su propio correlativo global único), y las filas se muestran en orden ascendente (la más vieja del día arriba).
- **"Venta detallada"**: la forma original, con datos de clienta y varias prendas en una sola venta — útil cuando sí se necesita ligar la venta a una clienta (ej. para pagar con saldo).

Ambas pestañas permiten a un **admin editar o anular** cualquier venta ya guardada (ajustando stock y saldo automáticamente al editar).

## Reportes descargables (botón "Descargar Reporte" en Ventas)

- **Reporte del día**: PDF o Excel con cada venta del día — columnas separadas de Prenda, **Precio** (informativo, sin suma), Cantidad, Método(s), Descuento, Total, Vendió (con alias si existe). Al final hay una fila de totales alineada bajo cada columna (ej. "31 prenda(s)" bajo Cantidad), y arriba un resumen por método de pago que también cierra con su total.
- **Elegir días**: Excel con una fila resumen por cada día del rango elegido (fecha, # ventas, efectivo, tarjeta, depósito, saldo, descuentos, total), más fila de totales del rango.

## ⚠️ Corrección importante: zona horaria

Todo el sistema calculaba "hoy" usando la hora UTC en vez de la hora de Guatemala (UTC-6). Como consecuencia, las ventas hechas después de las 6:00pm quedaban fechadas como si fueran el día siguiente, y se mezclaban entre días en "Venta del día", el historial, y los reportes. **Ya está corregido en todo el sistema** (se agregó `getLocalDateStr()`/`isSameLocalDay()` en `utils.ts`, usado en vez de `toISOString()` en cualquier lugar donde se agrupa o filtra "por día"). Si en el futuro se agrega alguna pantalla nueva que filtre por día, hay que usar esas funciones y no `toISOString().split('T')[0]`.

## Paleta de colores

- Verde menta (principal): `#2bb297` / oscuro `#1a8a72`
- Fondo claro: `#e8f7f2`
- Dorado (acentos): `#c9a876`
- Vino/borgoña (alertas, eliminar): `#8c3a4b`
- Texto oscuro: `#2c3e42`

✅ Aplicada en todo el sistema. Nada pendiente aquí.

## Fases del proyecto

- ✅ **Fase 0**: Apartados (sistema original).
- ✅ **Fase 1**: Inventario + Lotes + rotación + verificación cruzada + libreta de clientes + menú lateral.
- ✅ **Fase 2**: Ventas directas + métodos de pago + descuentos por desperfecto + descuento real de stock (FIFO, transaccional).
- ✅ **Fase 2.5**: Saldo a favor por apartados vencidos, pagos combinados, "Venta del día" (modo rápido), editar/anular ventas (admin), reportes descargables (PDF/Excel), alias de usuario, y corrección de zona horaria.
- ✅ **Paleta de colores**: aplicada en todo el sistema.
- ✅ **Fase 3**: Costos + gastos fijos/variables + rentabilidad — pantalla nueva **"Finanzas"**, visible solo para `admin` (no aparece en el menú de una empleada). Incluye:
  - **Costo por paca**: como la mercadería se compra por paca (paquete) y no por prenda, se registra "Precio de paca" + "Cantidad de prendas", el sistema calcula el costo unitario solo, y queda un historial con fecha (para ver cómo ha variado el costo). El cálculo más reciente es el "costo vigente" que se usa para estimar la ganancia.
  - **Gastos fijos/variables**: categorías fijas (Renta, Planilla, Servicios, Empaque, Otro — este último con nota obligatoria), marcando si es fijo o variable. No se repiten solos cada mes, hay que registrar cada uno.
  - **Comisión de tarjeta**: % configurable en cualquier momento, oculto a empleada/clienta, usado solo para el cálculo interno de ganancia real.
  - **Costos por prenda vendida** (Planchado, Empaque, Plástico/Etiqueta, etc.): se configuran como un monto Q por cada prenda vendida (no un gasto mensual suelto), editable cuando cambien de precio — el sistema los multiplica solo por la cantidad de prendas vendidas en el rango.
  - **IVA de factura**: % separado de la comisión de tarjeta, porque aplica tanto a pagos con tarjeta como con transferencia/depósito (ambos generan factura), mientras que la comisión de tarjeta solo aplica a tarjeta.
  - **Comisión de vendedora**: % editable (puede cambiar cada mes) que se calcula sobre la **ganancia neta** del periodo (ya descontados costo de paca, costos por prenda, comisión de tarjeta e IVA). Nunca es negativa — si el periodo cierra en pérdida, la comisión es Q0.00. Se calcula **por separado para cada vendedora** según lo que ella vendió (usa `soldByEmail`/alias de cada venta), para cuando haya más de una.
  - **Resumen de rentabilidad** por rango de fechas, con la cadena completa: Ingresos → costo de paca → costos por prenda → comisión de tarjeta → IVA de factura → Ganancia neta → comisión de vendedora → gastos del periodo → Ganancia final. Incluye el desglose de comisión por cada vendedora. Todo descargable en Excel.
  - Este diseño nació de analizar el Excel manual que ya usaban (`EJEMPLO_GANANCIAS_Y_COMISION_VENDEDORA`), que calculaba lo mismo pero a mano, fila por fila, por "modalidad de pago", recontando artículos vendidos cada mes — ahora el sistema lo calcula solo a partir de las ventas reales ya registradas, sin recontar nada.
- ⏳ **Pendiente transversal**: subir el logo real de la tienda a `public/logo.png` (hoy hay un ícono de respaldo tipo "bolsa").

## Cómo prefiere trabajar la usuaria

- No tiene experiencia previa en programación — instrucciones paso a paso, asumiendo que no sabe qué es una terminal, git, etc.
- Prefiere que Claude proponga y construya directamente, explicando el resultado, en vez de preguntar demasiado (salvo decisiones de negocio genuinamente ambiguas, donde sí vale la pena confirmar antes de construir).
- Cada entrega de código debe venir como un `.zip` completo del proyecto (no archivos sueltos), con instrucciones claras de qué reemplazar y si hay que tocar las reglas de Firebase.
- Reporta bugs probando el sistema real ya en producción (Vercel) — conviene siempre verificar que el build compile limpio antes de entregar.
