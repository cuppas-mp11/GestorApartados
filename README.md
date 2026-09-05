# Gestor de Apartados - Boutique & Moda GT

Este es tu proyecto completo, ya con Firebase conectado (base de datos en la nube + login).

## Antes de correrlo por primera vez

Abre la terminal DENTRO de esta carpeta (ver guía GUIA_FIREBASE.md si no recuerdas cómo) y escribe:

```
npm install
```

Espera a que termine (puede tardar 1-2 minutos, va a descargar todo lo necesario).

## Para ver la app funcionando en tu computadora

```
npm run dev
```

Te va a mostrar un link, normalmente `http://localhost:5173` — ábrelo en tu navegador (Ctrl + clic, o cópialo y pégalo).

## El archivo `.env.local`

Ya viene con las llaves de tu proyecto de Firebase (`gestor-de-apartados-vm`) puestas. Si alguna vez cambias de proyecto de Firebase, solo reemplaza los valores ahí.

## Siguiente paso: crear tus usuarios de acceso

Antes de poder entrar a la app, necesitas crear al menos un usuario en Firebase (correo + contraseña). Ve a:
Firebase Console → tu proyecto → Authentication → Users → "Agregar usuario"

Ahí crea el usuario de la administradora y el de la dueña.

## Publicarlo en internet (para que la dueña también acceda)

Sigue el Paso 6 de `GUIA_FIREBASE.md` (usa Vercel, es gratis).
