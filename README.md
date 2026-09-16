# Hackhaton - Proyecto Ciberdefensa

Frontend de **Aduana**, una interfaz para inspeccionar repositorios y paquetes antes de que sean consumidos por un agente. Permite crear escaneos, seguir una inspección en curso, revisar el historial y visualizar el informe final.

## Estructura

- `frontend/`: aplicación web hecha con Vite, React, TypeScript, Tailwind CSS y TanStack Query.

## Requisitos

- Node.js LTS reciente
- npm

## Configuración

```bash
cd frontend
npm install
```

Creá un archivo `.env` a partir de `frontend/.env.example`.

- `VITE_USE_MOCKS=true`: corre la interfaz con datos de demostración, sin backend.
- `VITE_USE_MOCKS=false` o variable ausente: usa la API real bajo `/api`.

Cuando corre contra backend, Vite proxifica `/api` hacia `http://localhost:3000`.

## Scripts disponibles

Desde `frontend/`:

```bash
npm run dev      # levanta el servidor de desarrollo
npm run build    # typecheck + build de producción
npm run lint     # oxlint
npm test         # pruebas de seguridad
npm run preview  # sirve el build generado
```

## Rutas principales

- `/`: creación de una nueva inspección.
- `/escaneos/:id`: estado del escaneo e informe final.
- `/historial`: listado de inspecciones anteriores.
- `/agente`: vista relacionada con el agente.

## Verificación rápida

```bash
cd frontend
npm run lint
npm run build
```
