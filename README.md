<div align="center">

# 🏆 HACKATHON CYBER.AR 2026

### Hackathon Nacional de Ciberdefensa — *"La Ciberdefensa depende de todos"*

<img src="frontend/public/logo.png" alt="SIAR" width="140" />

## Eje 2 — Inteligencia artificial para la defensa de redes e infraestructura

> Desarrollar herramientas basadas en inteligencia artificial que permitan **detectar, priorizar y responder** ante ataques, con capacidad de **ejecución local** y **resistencia frente a intentos de manipulación**.

</div>

---

# 🛂 SIAR

**Sistema de Inspección de Archivos y Repositorios** — control de seguridad local para agentes de IA que programan.

SIAR se para como una aduana real entre el mundo exterior y el agente de IA: antes de que un repositorio o un paquete llegue al asistente, lo descarga en un entorno aislado, lo analiza (sin ejecutar nada de su contenido) y emite un veredicto vinculante:

### 🟢 LIBERADO · 🟡 REVISAR · 🔴 RETENIDO

El agente consulta a SIAR por **MCP** (`check_package`, `check_repo`) antes de instalar o abrir algo, y una persona puede seguir el análisis en vivo desde la API, la CLI o la interfaz web, que genera un **informe ejecutivo formal imprimible** con sustentación normativa.

---

## ⚠️ El problema

Los asistentes de IA para programar (Cursor, Claude Code, Copilot, agentes MCP) instalan paquetes y clonan repositorios de terceros sin que un humano revise el contenido antes. Eso abre una superficie de ataque nueva y poco vigilada:

- **Prompt injection oculta** — instrucciones invisibles (caracteres Unicode Tags, comentarios HTML, bloques base64) escondidas en un `README.md` o `.cursorrules` que intentan manipular al agente para que filtre secretos o ejecute comandos.
- **Typosquatting y dependencias maliciosas** — paquetes con nombres confundibles o scripts `postinstall` que ejecutan código al instalar.
- **Secretos filtrados** — tokens y credenciales versionados en el historial de un repo que el agente termina leyendo y, potencialmente, reenviando.

## 🔍 Módulos de detección (deterministas + IA soberana)

| Módulo | Qué detecta |
|---|---|
| **Instrucciones** | Patrones de manipulación dirigidos a agentes de IA en archivos sensibles (README, `.cursorrules`, etc.) |
| **Unicode oculto** | Caracteres invisibles, Unicode Tags (mensajes encubiertos), controles bidireccionales, ancho-cero — con vista "rayos X" del texto aparente vs. interpretado |
| **Dependencias** | Typosquatting, paquetes inexistentes o recién creados, scripts de instalación sospechosos |
| **Credenciales** | Tokens y secretos en el árbol y en el historial de git (vía `gitleaks`) |
| **Triage con IA** *(opcional, 100% local)* | Un modelo servido por **Ollama** clasifica candidatos ambiguos — **nunca puede bajar la severidad de un hallazgo determinista** |

## ⚖️ Marco normativo y de amenazas

El informe ejecutivo se emite con sustentación normativa **determinista** (las citas legales nunca las genera el LLM — están fuera de su alcance estructuralmente):

| Marco | Rol |
|---|---|
| **MITRE ATLAS** | Framework técnico de amenazas contra sistemas con IA: `AML.T0051` (LLM Prompt Injection), `AML.T0010` (AI Supply Chain Compromise), evasión por ofuscación. SIAR es una mitigación de frontera que intercepta el kill-chain en el punto de ingesta. |
| **Res. 1380/2019 — MinDefensa, Art. 1°** | Ciberdefensa = *anticipar y prevenir* ciberataques y ciberexplotación: la evaluación en cuarentena antes de la ingesta es anticipación por diseño. |
| **Ley 23.554 · Decreto 703/18 · Res. 829/19 · Res. 1523/19** | Defensa Nacional, DPDN, Estrategia Nacional de Ciberseguridad e Infraestructuras Críticas de Información. |

## 🇦🇷 Por qué encaja en el Eje 2

| Requisito del eje | Cómo lo cumple SIAR |
|---|---|
| **Detectar** | 4 analizadores deterministas + SAST + triage semántico con LLM local |
| **Priorizar** | Severidades, Índice de Confianza con penalizaciones ponderadas y techos por veredicto |
| **Responder** | Respuesta preventiva: el veredicto vinculante retiene el artefacto *antes* del daño, con remediación obligatoria por hallazgo |
| **Ejecución local** | Solo `127.0.0.1`, Ollama local, cuarentena aislada con limpieza garantizada, egreso por allowlist explícita |
| **Resistencia a manipulación** | Doble capa: detecta prompt injection contra el agente **y** el propio sistema es resistente — el LLM nunca puede degradar hallazgos deterministas, el input va en delimitador `<contenido_no_confiable>` neutralizado con cap anti Model-DoS |
| **Control de datos** | Nada sale de la máquina; sin Ollama el sistema sigue dando veredicto (*fail-safe*) |

## 📊 Estado del proyecto

| Componente | Estado |
|---|---|
| **Motor de análisis** (`src/motor/`) | ✅ 4 analizadores + SAST + triage IA + scoring + InformeEjecutivo |
| **Plataforma** (`src/plataforma/`) | ✅ API, ingesta, cola, SSE, DB, CLI, MCP |
| **Integración Motor + Plataforma** | ✅ Typecheck/build/tests en verde (136/136) |
| **Frontend** (`frontend/`) | ✅ UI/UX completa — informe imprimible con carátula formal |

## 🏗️ Arquitectura

```
src/
├── shared/contrato.ts      # Contrato congelado: tipos compartidos entre motor, plataforma y front
├── motor/                  # Analizadores deterministas + triage IA + veredicto
│   ├── analizadores/       # unicode, instrucciones, dependencias, secretos
│   ├── llm/ollama.ts       # Cliente del modelo local + sustentación normativa determinista
│   ├── registro/cliente.ts # Verificación de paquetes en npm/PyPI (allowlist de hosts)
│   └── pipeline.ts         # Orquesta los analizadores y calcula el veredicto
└── plataforma/             # API HTTP, ingesta, persistencia, MCP, CLI
    ├── api/                # /scans, /agente, /health
    ├── ingesta/            # Clonado de repos y descarga de paquetes (cuarentena)
    ├── db.ts               # SQLite (WAL)
    ├── mcp.ts              # Servidor MCP por stdio (check_package, check_repo)
    ├── cli.ts              # CLI `aduana scan <objetivo>`
    └── server.ts           # Express en 127.0.0.1

frontend/
├── src/pages/              # Inicio, historial, escaneo y agente
├── src/components/         # Header, inspección en curso y reporte formal imprimible
├── src/lib/                # Cliente API, mocks, schemas y utilidades
└── tests/                  # Pruebas auxiliares del frontend
```

## 🖥️ Frontend

Interfaz de control previo: ingesta de objetivos, seguimiento en vivo del pipeline (SSE) e informe ejecutivo con formato de documento formal — dictamen, balance de hallazgos interactivo, detalle por módulo e impresión con carátula institucional.

- **Stack:** React 18 · TypeScript · Vite · Tailwind CSS 4 · TanStack Query · React Router · Zod · Oxlint
- **Tipografía:** Atkinson Hyperlegible + JetBrains Mono (Fontsource)
- **Rutas:** `/` nueva inspección · `/escaneos/:id` escaneo e informe · `/historial` · `/agente`
- **Demo sin backend:** `VITE_USE_MOCKS=true` (en `frontend/.env`) corre la interfaz con datos sintéticos — incluye los escaneos demo `demo-001` (repo C4ISR, retenido), `demo-002` (`npm:date-fns`, liberado) y `demo-003` (repo logístico, revisar)

```bash
cd frontend
npm install
npm run dev      # http://localhost:5173 (proxifica /api → :3000)
npm run build    # typecheck + build de producción
npm run lint     # oxlint
npm test         # pruebas de seguridad
```

## ⚙️ Backend — uso rápido

```bash
npm install

npm run server       # API real en 127.0.0.1:3000
npm run server:stub  # API con motor de prueba, sin análisis real

npm run motor -- ./algun-directorio          # análisis directo, sin HTTP
npm run cli -- scan npm:picocolors           # CLI end-to-end
npm run cli -- scan https://github.com/o/r

npm run mcp          # servidor MCP por stdio (para conectar un agente)
npm run db:reset && npm run db:seed          # base de demo
```

### API HTTP

| Método | Ruta | Qué hace |
|---|---|---|
| `POST` | `/api/scans` | Crea un escaneo (`npm:` / `pypi:` / URL de repo), responde `201 { id }` |
| `GET` | `/api/scans/:id/events` | Stream SSE: `etapa` → `hallazgo` → `veredicto` |
| `GET` | `/api/scans/:id` | Escaneo completo con `informeEjecutivo` |
| `GET` | `/api/scans/:id/reporte-defensa` | Reporte estructurado de cumplimiento normativo |
| `GET` | `/api/health` | Estado de Ollama, gitleaks y modo offline |
| `POST` | `/api/agente/check-package` | Chequeo de paquete antes de instalar (MCP) |
| `POST` | `/api/agente/check-repo` | Escaneo de repo antes de abrirlo (MCP) |

## 🧪 Testing

```bash
# Backend
npm run typecheck   # TypeScript estricto, 0 errores
npm run build       # Compilación a dist/
npm test            # Vitest — motor + plataforma + integración

# Frontend
cd frontend && npm run lint && npm run build && npm test
```

> **Requisito:** [`gitleaks`](https://github.com/gitleaks/gitleaks) instalado (o en `bin/`) para que el módulo de credenciales detecte hallazgos reales; sin él, el motor degrada en *fail-safe* sin romper el resto del análisis.

## ✅ Condiciones del hackathon

- **Solo datos simulados o públicos** — los fixtures de demo son sintéticos; el análisis real solo consulta metadata pública de npm/PyPI, nunca ejecuta contenido inspeccionado.
- **Demostración funcional** — flujo completo de punta a punta: escaneo → eventos en vivo → veredicto → limpieza de cuarentena → MCP → informe formal imprimible.
- **Soberanía tecnológica** — todo el análisis corre local, sin enviar datos a terceros.

---

<div align="center">

**Documento emitido por la plataforma soberana SIAR** · Eje 2 — IA para la defensa de redes e infraestructura

</div>
