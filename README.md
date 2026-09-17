# Aduana

**Control de seguridad local para agentes de IA que programan.**

Proyecto presentado en el **Hackathon Nacional de Ciberdefensa CYBER.AR 2026** — *"La Ciberdefensa necesita de todos"* — dentro del **Eje 2: Inteligencia artificial para la defensa de redes e infraestructura**.

---

## El problema

Los asistentes de IA para programar (Cursor, Claude Code, Copilot, agentes MCP) instalan paquetes y clonan repositorios de terceros sin que un humano revise el contenido antes. Eso abre una superficie de ataque nueva y poco vigilada:

- **Prompt injection oculta.** Instrucciones invisibles (caracteres Unicode Tags, comentarios HTML, bloques base64) escondidas en un `README.md` o `.cursorrules` que intentan manipular al agente para que filtre secretos o ejecute comandos.
- **Typosquatting y dependencias maliciosas.** Paquetes con nombres confundibles o scripts `postinstall` que ejecutan código al instalar.
- **Secretos filtrados.** Tokens y credenciales versionados en el historial de un repo que el agente termina leyendo y, potencialmente, reenviando.

## La solución

**Aduana** se para como una aduana real entre el mundo exterior y el agente de IA: antes de que un repo o un paquete llegue al asistente, lo descarga en un entorno aislado, lo analiza (sin ejecutar nada de su contenido) y emite un veredicto:

🟢 **liberado** · 🟡 **revisar** · 🔴 **retenido**

El agente consulta a Aduana por MCP (`check_package`, `check_repo`) antes de instalar o abrir algo, y una persona puede seguir el análisis en vivo desde la API, la CLI o la interfaz web.

### Motores de detección (deterministas + IA)

| Módulo | Qué detecta |
|---|---|
| **Unicode** | Caracteres invisibles, Unicode Tags (mensajes ocultos), controles bidireccionales, ancho-cero |
| **Instrucciones** | Patrones de manipulación dirigidos a agentes de IA en archivos sensibles (README, `.cursorrules`, etc.) |
| **Dependencias** | Typosquatting, paquetes inexistentes o recién creados, scripts de instalación sospechosos |
| **Secretos** | Tokens y credenciales en el árbol y en el historial de git (vía `gitleaks`) |
| **Triage con IA** *(opcional, local)* | Un modelo servido por **Ollama** ayuda a clasificar candidatos ambiguos — nunca puede bajar la severidad de un hallazgo determinista |

## Por qué encaja en el Eje 2 y en la soberanía tecnológica

- **Ejecuta 100% en infraestructura propia.** El servidor escucha solo en `127.0.0.1`, nunca en `0.0.0.0`. El triage por IA usa **Ollama local**; si no está disponible, el sistema sigue funcionando en modo *fail-safe* (los hallazgos deterministas ya alcanzan para el veredicto).
- **No depende de servicios externos** para analizar: las únicas conexiones salientes son a los registros públicos de paquetes (npm/PyPI) y a hosts de repos permitidos (GitHub/GitLab), sobre una allowlist explícita.
- **Nunca ejecuta código del contenido analizado.** Todo lo descargado vive en cuarentena (`/tmp/aduana/<id>`) y se borra al terminar, se haya usado o no.
- **Adopción real:** se integra al flujo existente de cualquier agente de IA vía MCP (protocolo estándar), sin cambiar cómo la persona ya trabaja.

## Estado del proyecto

| Componente | Estado |
|---|---|
| **Motor de análisis** (`src/motor/`) | ✅ Completo — 4 analizadores + SAST + triage IA + scoring + InformeEjecutivo |
| **Plataforma** (`src/plataforma/`) — API, ingesta, cola, SSE, DB, CLI, MCP | ✅ Completo |
| **Integración Motor + Plataforma** | ✅ Mergeada, typecheck/build/tests en verde (136/136) |
| **Frontend** (`frontend/`) | ✅ Rediseño UI/UX — build y lint en verde |

## Arquitectura

```
src/
├── shared/contrato.ts     # Contrato congelado: tipos compartidos entre motor, plataforma y front
├── motor/                 # Analizadores deterministas + triage IA + veredicto
│   ├── analizadores/      # unicode, instrucciones, dependencias, secretos
│   ├── llm/ollama.ts       # Cliente del modelo local
│   ├── registro/cliente.ts # Verificación de paquetes en npm/PyPI (allowlist de hosts)
│   └── pipeline.ts         # Orquesta los analizadores y calcula el veredicto
└── plataforma/             # API HTTP, ingesta, persistencia, MCP, CLI
    ├── api/                # /scans, /agente, /health
    ├── ingesta/            # Clonado de repos y descarga de paquetes (cuarentena)
    ├── db.ts                # SQLite (WAL)
    ├── mcp.ts               # Servidor MCP por stdio (check_package, check_repo)
    ├── cli.ts               # CLI `aduana scan <objetivo>`
    └── server.ts            # Express en 127.0.0.1

frontend/
├── src/pages/             # Inicio, historial, escaneo y agente
├── src/components/        # Layout, inspección en curso y reporte
├── src/lib/               # Cliente API, mocks, schemas y utilidades
└── tests/                 # Pruebas auxiliares del frontend
```

## Frontend

### Objetivo del frontend

Brindar un punto de control previo y visual para evaluar el riesgo de incorporar código externo en flujos asistidos por agentes, facilitando la detección temprana de instrucciones ocultas, caracteres invisibles, dependencias sospechosas y secretos expuestos.

### Alcance del sistema

- La interfaz permite ingresar objetivos de inspección, consultar el estado del análisis, revisar hallazgos y presentar el informe final.
- El frontend consume la API bajo `/api` para crear escaneos, obtener el historial, consultar un escaneo puntual y suscribirse a eventos de progreso.
- El procesamiento, almacenamiento y ejecución de las reglas de análisis corresponden al backend/servicio de inspección.
- El modo `VITE_USE_MOCKS=true` permite demostrar el flujo completo de la interfaz sin depender del backend.
- El frontend no ejecuta el código inspeccionado: solo muestra evidencia, métricas y resultados devueltos por la capa de análisis.

### Funcionalidades

- Creación de inspecciones a partir de una URL de repositorio o un paquete con prefijo `npm:` / `pypi:`.
- Detección automática del tipo de objetivo ingresado.
- Listado de los últimos elementos inspeccionados y acceso al historial completo.
- Seguimiento de escaneos en curso mediante eventos y actualización periódica.
- Visualización del informe final con veredicto, severidad, módulo, evidencia, remediación y contexto de CVEs cuando corresponde.
- Comparación entre texto visual aparente y texto interpretado para hallazgos Unicode/invisibles.
- Impresión del documento desde la vista del reporte.
- Modo demostración con mocks para correr la interfaz sin backend.

### Casos de uso

- Control previo de seguridad antes de habilitar código o dependencias para agentes autónomos.
- Revisión de riesgos de cadena de suministro: instrucciones ocultas, caracteres invisibles, dependencias alucinadas y secretos expuestos.
- Triage visual de hallazgos por severidad y módulo para priorizar remediaciones.
- Demostración funcional del producto durante el hackathon sin necesidad de levantar servicios externos.
- Generación de una vista formal del informe para revisión técnica u operativa.

### Frameworks y librerías del frontend

- React 18
- TypeScript
- Vite
- Tailwind CSS 4
- TanStack Query
- React Router
- Zod
- Oxlint
- Fontsource: Atkinson Hyperlegible y JetBrains Mono

### Configuración del frontend

```bash
cd frontend
npm install
```

Creá un archivo `.env` a partir de `frontend/.env.example`.

- `VITE_USE_MOCKS=true`: corre la interfaz con datos de demostración, sin backend.
- `VITE_USE_MOCKS=false` o variable ausente: usa la API real bajo `/api`.

Cuando corre contra backend, Vite proxifica `/api` hacia `http://localhost:3000`.

### Scripts del frontend

Desde `frontend/`:

```bash
npm run dev      # levanta el servidor de desarrollo
npm run build    # typecheck + build de producción
npm run lint     # oxlint
npm test         # pruebas de seguridad
npm run preview  # sirve el build generado
```

### Rutas principales del frontend

- `/`: creación de una nueva inspección.
- `/escaneos/:id`: estado del escaneo e informe final.
- `/historial`: listado de inspecciones anteriores.
- `/agente`: vista relacionada con el agente.

## Uso rápido del backend

```bash
npm install

# Levantar la API (motor real)
npm run server
# … o con un motor de prueba, sin el análisis real:
npm run server:stub

# Analizar un directorio local directamente con el motor (sin pasar por HTTP)
npm run motor -- ./algun-directorio

# CLI end-to-end contra la API
npm run cli -- scan npm:picocolors
npm run cli -- scan https://github.com/owner/repo

# Servidor MCP por stdio (para conectar un agente de IA)
npm run mcp

# Base de datos de demo
npm run db:reset && npm run db:seed
```

### API HTTP (resumen)

| Método | Ruta | Qué hace |
|---|---|---|
| `POST` | `/api/scans` | Crea un escaneo (`{ objetivo: "npm:<n>" \| "pypi:<n>" \| "https://github.com/<owner>/<repo>" }`), responde `201 { id }` |
| `GET` | `/api/scans/:id/events` | Stream SSE del escaneo: `etapa` → `hallazgo` → `veredicto` (incluye `informeEjecutivo`) |
| `GET` | `/api/scans/:id` | Escaneo completo con objeto `Scan` e `informeEjecutivo` |
| `GET` | `/api/scans/:id/reporte-defensa` | Reporte estructurado de cumplimiento normativo (NIST, ISO 27001/31000, MITRE ATLAS) |
| `GET` | `/api/health` | Estado de Ollama, gitleaks y modo offline |
| `POST` | `/api/agente/check-package` | Usado por el MCP para chequear un paquete antes de instalarlo |
| `POST` | `/api/agente/check-repo` | Usado por el MCP para escanear un repo antes de abrirlo |

## Testing

Backend:

```bash
npm run typecheck   # TypeScript estricto, 0 errores
npm run build       # Compilación completa a dist/
npm test            # Vitest — 136 tests pasados (motor + plataforma + integración)
```

Frontend:

```bash
cd frontend
npm run lint        # Oxlint
npm run build       # TypeScript + Vite build
npm test            # Pruebas de seguridad del frontend
```

Requiere [`gitleaks`](https://github.com/gitleaks/gitleaks) instalado en el sistema (o en `bin/`) para que el módulo de secretos detecte hallazgos reales; si no está disponible, el motor degrada en modo *fail-safe* sin hallazgos de ese módulo, sin romper el resto del análisis.

## Condiciones del hackathon cumplidas

- **Solo datos simulados o públicos.** Los fixtures de demo (`repo-limpio`, `repo-malicioso`) son sintéticos; el análisis de paquetes reales solo consulta metadata pública de npm/PyPI, nunca ejecuta su contenido.
- **Demostración funcional.** Flujo completo probado de punta a punta: creación de escaneo → eventos en vivo por SSE → veredicto → limpieza de cuarentena → consulta MCP desde un agente → visualización en el frontend.
- **Soberanía tecnológica.** Todo el análisis corre local, sin enviar datos a terceros.
