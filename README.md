# Aduana - Frontend

Proyecto desarrollado en el marco del **Hackathon Nacional de Ciberdefensa**.

Frontend de **Aduana**, una interfaz para inspeccionar repositorios y paquetes antes de que sean consumidos por un agente. Permite crear escaneos, seguir una inspección en curso, revisar el historial y visualizar el informe final.

## Objetivo

Brindar un punto de control previo y visual para evaluar el riesgo de incorporar código externo en flujos asistidos por agentes, facilitando la detección temprana de instrucciones ocultas, caracteres invisibles, dependencias sospechosas y secretos expuestos.

## Alcance del sistema

- La interfaz permite ingresar objetivos de inspección, consultar el estado del análisis, revisar hallazgos y presentar el informe final.
- El frontend consume la API bajo `/api` para crear escaneos, obtener el historial, consultar un escaneo puntual y suscribirse a eventos de progreso.
- El procesamiento, almacenamiento y ejecución de las reglas de análisis corresponden al backend/servicio de inspección.
- El modo `VITE_USE_MOCKS=true` permite demostrar el flujo completo de la interfaz sin depender del backend.
- El frontend no ejecuta el código inspeccionado: solo muestra evidencia, métricas y resultados devueltos por la capa de análisis.

## Funcionalidades

- Creación de inspecciones a partir de una URL de repositorio o un paquete con prefijo `npm:` / `pypi:`.
- Detección automática del tipo de objetivo ingresado.
- Listado de los últimos elementos inspeccionados y acceso al historial completo.
- Seguimiento de escaneos en curso mediante eventos y actualización periódica.
- Visualización del informe final con veredicto, severidad, módulo, evidencia, remediación y contexto de CVEs cuando corresponde.
- Comparación entre texto visual aparente y texto interpretado para hallazgos Unicode/invisibles.
- Impresión del documento desde la vista del reporte.
- Modo demostración con mocks para correr la interfaz sin backend.

## Casos de uso

- Control previo de seguridad antes de habilitar código o dependencias para agentes autónomos.
- Revisión de riesgos de cadena de suministro: instrucciones ocultas, caracteres invisibles, dependencias alucinadas y secretos expuestos.
- Triage visual de hallazgos por severidad y módulo para priorizar remediaciones.
- Demostración funcional del producto durante el hackathon sin necesidad de levantar servicios externos.
- Generación de una vista formal del informe para revisión técnica u operativa.

## Frameworks y librerías

- React 18
- TypeScript
- Vite
- Tailwind CSS 4
- TanStack Query
- React Router
- Zod
- Oxlint
- Fontsource: Atkinson Hyperlegible y JetBrains Mono

## Estructura

- `frontend/`: aplicación web principal.
- `frontend/src/pages/`: pantallas de inicio, historial, escaneo y agente.
- `frontend/src/components/`: componentes de layout, inspección y reporte.
- `frontend/src/lib/`: cliente API, mocks, schemas y utilidades de presentación.
- `frontend/tests/`: pruebas auxiliares del proyecto.

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
