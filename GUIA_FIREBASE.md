# Guía: migrar el Gestor de Apartados a Firebase

Esta guía cubre la parte que solo tú puedes hacer (crear el proyecto en Firebase, activar la base de datos y crear los usuarios). Después de esto, copias los archivos de código que te dejo junto a esta guía.

---

## Paso 1: Crear el proyecto en Firebase

1. Entra a **https://console.firebase.google.com** con tu cuenta de Google.
2. Clic en **"Agregar proyecto"**.
3. Ponle un nombre, por ejemplo `gestor-apartados-boutique`.
4. Puedes desactivar Google Analytics (no lo necesitas para esto). Clic en **"Crear proyecto"**.

## Paso 2: Activar Firestore (la base de datos)

1. En el menú izquierdo, ve a **Compilación (Build) → Firestore Database**.
2. Clic en **"Crear base de datos"**.
3. Selecciona **"Iniciar en modo de producción"**.
4. Elige la ubicación del servidor. Cualquiera de EE.UU. (`us-central`, `us-east`) funciona bien y es la más cercana/rápida para Guatemala.
5. Cuando termine de crearse, ve a la pestaña **"Reglas"** (Rules) y reemplaza el contenido por esto (permite acceso solo a usuarios que iniciaron sesión):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

Clic en **"Publicar"**.

## Paso 3: Activar el login (Authentication)

1. En el menú izquierdo: **Compilación → Authentication**.
2. Clic en **"Comenzar"**.
3. En la lista de proveedores, elige **"Correo electrónico/contraseña"** y actívalo (el primer interruptor). Guardar.
4. Ve a la pestaña **"Users"** (Usuarios) y clic en **"Agregar usuario"**.
   - Crea un usuario para la administradora (ej. `administradora@tunegocio.com` + una contraseña).
   - Crea otro usuario para la dueña (ej. `duena@tunegocio.com` + otra contraseña).
   - Ambos podrán entrar al sistema; los dos ven y pueden usar la app (no hay roles distintos en esta primera versión — lo puedes agregar después si quieres que la dueña solo pueda "ver").

## Paso 4: Obtener las llaves de configuración

1. Clic en el ícono de engranaje (arriba, junto a "Project Overview") → **"Configuración del proyecto"**.
2. Baja hasta **"Tus apps"** y clic en el ícono `</>` (Web).
3. Ponle un apodo (ej. "gestor-web") y clic en **"Registrar app"**. NO marques "Firebase Hosting" (usaremos Vercel).
4. Te va a mostrar un bloque de código con valores como `apiKey`, `authDomain`, etc. **Cópialos**, los vas a necesitar en el Paso 5.

## Paso 5: Configurar tu proyecto local

1. Instala el paquete de Firebase en tu proyecto (en la terminal, dentro de la carpeta del proyecto):
   ```
   npm install firebase
   ```
2. Abre tu archivo `.env.local` y agrega estas líneas, reemplazando cada valor con lo que copiaste en el Paso 4:
   ```
   VITE_FIREBASE_API_KEY=tu_api_key_aqui
   VITE_FIREBASE_AUTH_DOMAIN=tu_proyecto.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=tu_proyecto_id
   VITE_FIREBASE_STORAGE_BUCKET=tu_proyecto.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
   VITE_FIREBASE_APP_ID=tu_app_id
   ```
   ⚠️ Este archivo nunca se debe compartir ni subir a GitHub (ya está en tu `.gitignore`, revisa que siga ahí).

3. Copia los archivos de código que te dejé:
   - `firebase.ts` → colócalo en la raíz de tu proyecto (junto a `App.tsx`)
   - `Login.tsx` → colócalo dentro de `components/`
   - `App.tsx` (el nuevo) → **reemplaza** tu `App.tsx` actual

4. Corre tu proyecto normalmente (`npm run dev`) y prueba iniciar sesión con uno de los usuarios que creaste en el Paso 3.

## Paso 6: Publicarlo gratis en internet (Vercel)

1. Sube tu proyecto a GitHub (si no sabes cómo, dime y te explico ese paso también).
2. Entra a **https://vercel.com**, crea cuenta gratis con tu GitHub.
3. Clic en **"Add New Project"**, selecciona tu repositorio.
4. En **"Environment Variables"**, agrega las mismas 6 variables del Paso 5 (las de `VITE_FIREBASE_...`).
5. Clic en **"Deploy"**. En un par de minutos te da un link tipo `gestor-apartados.vercel.app` que puedes compartir con la dueña.

---

Cuando tengas listo el Paso 1-4, avísame y revisamos juntos que todo esté conectado antes de publicarlo.
