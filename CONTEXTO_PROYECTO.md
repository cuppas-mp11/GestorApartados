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
- `lots` — Lotes de mercadería recibida (código, etiqueta, fecha de entrada, cantidad ingresada/restante, verificación cruzada, y desde el **sistema de lotes por color**, `color?` — el color del ciclo asignado al registrar la entrega, ej. "ROSADO"; los lotes de antes de este sistema no lo tienen y siguen vendiéndose a precio normal).
- `lotColorSettings` — Documento único (ID `config`) con la configuración del **sistema de lotes por color**: `firstLotDate` (ancla el ciclo), `colors[]` (6 en uso + 2 de reserva, ej. ROSADO/ROJO/AMARILLO/PLATEADO/VERDE/AZUL), `daysToFirstDiscount`/`daysToFinalDiscount`/`daysToPullout` (días en tienda para cada etapa: normal → rebajado -15% → última oportunidad -30% → sacar de estantes), `roundTo`/`priceFloor` (redondeo a Q5, piso de Q35), `manualExceptions[]` (casos donde el redondeo normal no cuadra, ej. Q35 y Q40), `wholesalePrice`. **Cualquier usuario autenticado la puede leer** (la vendedora la necesita para que el precio con descuento salga automático al vender), pero solo `admin` puede cambiarla.
- `roles` — Un documento por usuario (ID = su UID de Firebase Auth): `role` (admin/employee), `email`, y opcionalmente `alias`. Solo editable manualmente desde la consola de Firebase.
- `editLogs` — Historial de correcciones a datos de apartados.
- `settings/garmentPrice` — **(visible SOLO para admin, dentro de la colección `settings`; no requiere reglas nuevas)** Historial de **Precio por prenda**: `entries[]` con `{id, price, effectiveDate, note?, createdByEmail, createdAt}`. Es UN precio general para todas las prendas; cada cambio se **agrega** como entrada nueva (nunca se edita ni borra). El costo de una venta usa el precio vigente en la fecha de esa venta (la entrada más reciente con `effectiveDate` ≤ fecha; si la venta es anterior a todas, se usa la más antigua).
- `expenseCategories` — **(Fase 3, visible SOLO para admin)** Catálogo de categorías de gasto, totalmente personalizable (ya no es una lista fija) — la usuaria puede crear una categoría nueva (ej. "Sticker") directamente desde el formulario de gastos, igual que se agrega una prenda nueva al inventario.
- `expenseTemplates` — **(Fase 3, visible SOLO para admin)** Plantillas de gastos recurrentes (ej. "Renta" todos los meses por un monto fijo). Cada mes el sistema muestra un botón **"Confirmar mes"** para registrar ese gasto con su monto (editable) y fecha, en vez de que se repita solo sin avisar o que se le olvide registrarlo a mano.
- `expenses` — **(Fase 3, visible SOLO para admin)** Gastos fijos/variables del negocio: `categoryId` (referencia a `expenseCategories`), `frequency` (fixed/variable), `amount`, `date`, `note?`, `templateId?` (si vino de confirmar una plantilla). Se pueden **editar** después de creados, no solo borrar y volver a crear.
- `settings` — **(Fase 3, visible SOLO para admin)** Un solo documento (ID `finance`) con: `cardCommissionPercent` (% del procesador de tarjeta, ej. Visa, solo aplica a tarjeta), `invoiceTaxPercent` (% de IVA de factura, aplica a tarjeta Y transferencia/depósito), `vendorCommissionPercent` (% que recibe la vendedora sobre la ganancia neta del periodo), y `unitCosts[]` (lista editable de costos por cada prenda vendida, ej. Planchado Q5.00, Empaque Q0.08 — no son gasto mensual, se multiplican por la cantidad de prendas vendidas). Todo editable en cualquier momento.

## Reglas de seguridad ya configuradas

Solo `admin` puede: eliminar apartados (soft-delete), eliminar lotes, corregir cantidades de lotes reportados con problema, **anular una venta**, y **editar una venta ya guardada**. Cualquier usuario autenticado puede: crear/editar apartados, registrar ventas, agregar prendas al catálogo, verificar/reportar lotes, editar su libreta de clientes.

**`expenseCategories`, `expenseTemplates`, `expenses` y `settings` (Fase 3) son de acceso exclusivo para `admin`** — a diferencia de las demás colecciones (que cualquier usuario autenticado puede leer), estas tienen `allow read, write` condicionado a `role == 'admin'`, para que una empleada no pueda ver costos, gastos ni rentabilidad, ni por pantalla ni forzando la base de datos por fuera.

`lotColorSettings` es la única colección "mixta": lectura abierta a cualquier usuario autenticado, escritura solo para `admin` — porque el precio con descuento se aplica también cuando vende la empleada.

Las reglas completas están en `GUIA_FIREBASE.md` dentro del proyecto (**Paso 14** tiene el bloque completo y más actualizado, con todas las colecciones hasta la fecha, incluyendo `lotColorSettings`; reemplaza la colección anterior `baleCosts`, que ya no se usa).

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
- **Historial de ventas** (antes "Venta detallada"): el formulario detallado se eliminó — ya no se registra el nombre de clienta en ventas de mostrador (solo en Apartados). Esa pestaña ahora es el historial completo, con filtro por rango de fechas (Desde/Hasta + atajos Hoy, Ayer, Esta semana, Este mes), total del rango y descarga a Excel. Editar/Anular sigue solo para admin.

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
  - **Precio por prenda (reemplaza al catálogo de pacas y al costeo por sticker)**: el admin registra un precio general por prenda con la fecha desde la que rige; cada cambio queda en un historial (precio, fecha, quién, nota). El Resumen de rentabilidad multiplica ese precio por las prendas vendidas, usando el precio vigente el día de cada venta. Si aún no hay precio, el resumen avisa y no descuenta costo. Las colecciones antiguas `pacas` y `pacaReconciliations` ya no se leen (los datos viejos quedan en Firebase, se pueden borrar desde Ajustes).
  - **Gastos con categorías personalizables**: ya no hay una lista fija de categorías — se puede crear una categoría nueva (ej. "Sticker") directamente desde el formulario de gastos, igual que se agrega una prenda nueva al inventario. Cada gasto se marca como fijo o variable, y **se puede editar** después de creado (antes solo se podía borrar y volver a capturar).
  - **Plantillas de gastos recurrentes**: para gastos que se repiten cada mes (ej. Renta), se crea una plantilla una sola vez; cada mes aparece un botón **"Confirmar mes"** que registra ese gasto con su monto (editable, por si cambia) y la fecha — evita que se le olvide registrarlo o que se duplique solo sin que la usuaria se dé cuenta.
  - **Comisión de tarjeta**: % configurable en cualquier momento, oculto a empleada/clienta, usado solo para el cálculo interno de ganancia real.
  - **Preparación y empaque por prenda vendida** (Planchado, Empaque, Plástico/Etiqueta, etc.): se configuran como un monto Q por cada prenda vendida (no un gasto mensual suelto), editable cuando cambien de precio — el sistema los multiplica solo por la cantidad de prendas vendidas en el rango.
  - **IVA de factura**: % separado de la comisión de tarjeta, porque aplica tanto a pagos con tarjeta como con transferencia/depósito (ambos generan factura), mientras que la comisión de tarjeta solo aplica a tarjeta.
  - **Comisión de vendedora**: % editable (puede cambiar cada mes) que se calcula sobre la **ganancia neta** del periodo (ya descontados precio por prenda, costos por prenda, comisión de tarjeta e IVA). Nunca es negativa — si el periodo cierra en pérdida, la comisión es Q0.00. Se calcula **por separado para cada vendedora** según lo que ella vendió (usa `soldByEmail`/alias de cada venta), para cuando haya más de una.
  - **Resumen de rentabilidad** por rango de fechas, con la cadena completa: Ingresos → costo de la ropa (precio por prenda vigente × prendas vendidas) → preparación y empaque por prenda → comisión de tarjeta → IVA de factura → Ganancia neta → comisión de vendedora → gastos del periodo → Ganancia final. Incluye el desglose de comisión por cada vendedora. Todo descargable en Excel.
  - Este diseño nació de analizar el Excel manual que ya usaban (`EJEMPLO_GANANCIAS_Y_COMISION_VENDEDORA`), que calculaba lo mismo pero a mano, fila por fila, por "modalidad de pago", recontando artículos vendidos cada mes — y de una segunda vuelta de análisis sobre cómo se mezclan pacas distintas en un mismo lote semanal (identificadas con stickers de colores en la etiqueta física), que llevó a reemplazar la idea inicial de un solo "costo vigente" por el catálogo de pacas + costeo manual por rango de fechas descrito arriba. Queda pendiente, a futuro, automatizar este costeo con lector de código de barras (no es parte de esta fase).
- ✅ **Ajustes (reinicio de datos de prueba)**: pantalla nueva **"Ajustes"**, visible solo para `admin`, con un botón para borrar de un solo paso la información de movimiento (ventas, apartados, lotes, gastos, pacas, costeos por sticker, bitácora de saldo a favor, historial de ediciones, y opcionalmente clientas) sin tener que entrar a la consola de Firebase. Nunca ofrece borrar el catálogo de inventario, los usuarios/roles, ni la configuración financiera (settings, categorías/plantillas de gasto) — esas colecciones ni aparecen como opción. Pide escribir "BORRAR" más una confirmación extra antes de ejecutar. Pensado para repetirse: una vez al pasar de datos ficticios a un mes real de prueba, y otra vez al pasar de esa prueba a uso diario real. **Sí requirió actualizar las reglas de Firebase** (Paso 13 en `GUIA_FIREBASE.md`): `reservations`, `sales`, `editLogs` y `creditLedger` tenían `allow delete: if false` a propósito (para que nadie borrara una venta/apartado sin pasar por "anular"), así que se amplió a "false para todos, excepto admin" — el botón de Ajustes es, en la práctica, el único que usa ese permiso nuevo.
- ✅ **Lotes por color (rebajas automáticas por ciclo de colores)**: armado junto con la administradora en otra conversación de Claude, usando un Excel propio (`descuentos_tienda_final.xlsx`) como fuente de verdad del diseño. Reemplaza el viejo etiquetado "ENE03" por un ciclo de 6 colores (ROSADO, ROJO, AMARILLO, PLATEADO, VERDE, AZUL — con 2 espacios de reserva para el futuro) asignado automáticamente según la fecha de entrega. Cada lote pasa por 4 etapas según cuántos días lleva en tienda: normal (días 0-20) → "Precio rebajado" -15% (día 21) → "Última oportunidad" -30% (día 35) → "Sacar de los estantes" (día 42, solo un aviso visual — el admin decide a mano qué hacer con lo que sobra: mayorista, liquidación o donación). Los precios se redondean a múltiplos de Q5, nunca bajan de un piso de Q35, y hay excepciones manuales para los casos donde ese redondeo no cuadra (Q35 y Q40) — la tabla completa de precios (Q35 a Q200) del Excel de la administradora se verificó contra la lógica del sistema y coincide exactamente. En "Venta detallada" el precio con descuento se sigue aplicando **automático** (FIFO: el lote más antiguo con stock). En "Venta Nueva" (venta rápida) pasó a ser **manual** — ver el bullet de "Selección manual de lote" más abajo. Pantalla de configuración "Lotes por color" dentro de Inventario, solo para admin. Los lotes de antes de esta función no tienen color asignado y se siguen vendiendo a precio normal (sin rebaja automática) hasta que se registren de nuevo. **Sí requirió actualizar las reglas de Firebase** (Paso 14 en `GUIA_FIREBASE.md`): la colección nueva `lotColorSettings` es de lectura abierta a cualquier usuario autenticado (la vendedora la necesita para vender al precio correcto) pero de escritura exclusiva para admin — el único caso "mixto" entre todas las reglas del sistema.
- ✅ **Selección manual de lote en "Venta Nueva"**: en vez de que el sistema adivine por FIFO cuál lote se está vendiendo (lo cual puede no coincidir con la prenda física real, si hay lotes revueltos en el estante), ahora la vendedora elige a mano el lote/etiqueta de cada prenda (ej. "ROSADO 23/10"), comparándolo con la etiqueta física. Si el código solo tiene un lote con stock, se auto-selecciona solo (no le pide elegir algo obvio); si tiene varios, debe elegir uno antes de poder guardar la venta. El precio y el descuento automático se calculan según los días que lleve ESE lote elegido (no el más antiguo del sistema). El descuento automático del lote se muestra aparte del "Descuento adicional" manual (para desperfectos u otros casos), para no confundirlos ni borrar uno sin querer. El stock se descuenta exactamente del lote elegido, no por FIFO — `SaleItem` ahora tiene un campo opcional `lotId`; si no viene (ventas viejas o "Venta detallada", que sigue sin pedir lote), el descuento de stock sigue siendo FIFO como siempre. No requirió cambios en las reglas de Firebase (es un campo nuevo dentro de un documento que ya se podía escribir).
- ✅ **Mejoras de ventas y apartados (nov 2026)**:
  - **Venta Nueva**: el botón muestra un puntito "N pendiente(s)" si hay una venta a medias, y la ventana tiene "Descartar venta" (con confirmación). El Resumen muestra la fecha de hoy bajo "Ventas de Hoy" (ej. "Miércoles 25-Nov-26").
  - **Apartados con lote y precio congelado**: igual que en Venta Nueva, se elige el lote (automático si hay uno solo) y el precio se calcula con el descuento que tenga ese lote ESE día y se guarda en el apartado (`ReservationItem.pricePerUnit`, más `lotId`, `lotLabel`, `lotColor`, `basePrice`, `priceNote`). No se recalcula nunca: si el lote entra en descuento después, la clienta paga el precio congelado. El stock se descuenta del lote exacto y, si el apartado se libera, vuelve a ese mismo lote. Apartados viejos (sin lote) no se tocan. El admin puede corregir el precio congelado de un apartado pendiente ("✎ precio"); queda en `editLogs` con precio anterior y nuevo. No requiere cambios en reglas de Firebase.
  - **Menú**: orden Inicio, Ventas, Apartados, Inventario, Clientes (+ Finanzas y Ajustes para admin). La etiqueta Admin/Tienda pasó a la barra superior, junto a "Cerrar sesión".
- ⏳ **Pendiente transversal**: subir el logo real de la tienda a `public/logo.png` (hoy hay un ícono de respaldo tipo "bolsa").

## Cómo prefiere trabajar la usuaria

- No tiene experiencia previa en programación — instrucciones paso a paso, asumiendo que no sabe qué es una terminal, git, etc.
- Prefiere que Claude proponga y construya directamente, explicando el resultado, en vez de preguntar demasiado (salvo decisiones de negocio genuinamente ambiguas, donde sí vale la pena confirmar antes de construir).
- Cada entrega de código debe venir como un `.zip` completo del proyecto (no archivos sueltos), con instrucciones claras de qué reemplazar y si hay que tocar las reglas de Firebase.
- Reporta bugs probando el sistema real ya en producción (Vercel) — conviene siempre verificar que el build compile limpio antes de entregar.

- ✅ **Excel con estilo (nov 2026)**: todos los Excel (reporte del día con hojas "Resumen" y "Detalle", reporte por rango, historial de ventas, rentabilidad con hojas por vendedora y gastos, apartados) se generan con una plantilla compartida en `excelStyle.ts` (librería ExcelJS, descargada solo al pedir un Excel): logo `public/logo.png` arriba a la izquierda, título en 3 niveles, encabezados verdes, filas alternadas, total en verde claro, montos con formato Q (numéricos). Para cambiar colores o tamaño del logo se edita solo ese archivo. La importación de inventario sigue usando la librería `xlsx` (solo lectura).
