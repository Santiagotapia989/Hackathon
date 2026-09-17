# Documentación Técnica de Arquitectura y Operación — Proyecto Aduana

**Sistema Soberano de Control Previo de Seguridad para Agentes de IA en Infraestructuras Críticas de Defensa**  
*Hackathon Nacional de Ciberdefensa CYBER.AR 2026 — Eje 2: Inteligencia Artificial para la Defensa de Redes e Infraestructura.*

---

## 1. Visión General del Sistema

**Aduana** es un control de seguridad local diseñado para operar en entornos aislados (*Air-Gapped*) de las Fuerzas Armadas e infraestructuras críticas. Su función principal es actuar como un **punto de inspección previo obligado** antes de que un agente de IA autónomo (Cursor, Claude Code, Copilot, asistentes MCP) descargue, clone o incorpore código fuente o paquetes de terceros.

### 🛡️ Principios de Soberanía Tecnológica
* **Ejecución 100% Local**: Todo el análisis corre en infraestructura soberana. El servidor escucha estrictamente en `127.0.0.1`.
* **Aislamiento en Cuarentena**: Los repositorios y paquetes se descargan en directorios temporales aislados (`/tmp/aduana/<id>`), se inspeccionan sin ejecutar nada de su contenido y se eliminan inmediatamente al finalizar.
* **Fail-Safe & IA Soberana**: El triage asistido por IA utiliza modelos locales (**Ollama - Gemma2**). Si la IA no está disponible o falla, el motor opera en modo determinista autónomo sin degradar la seguridad.

---

## 2. Relevamiento de Componentes y Frameworks

### 🔹 Motor de Análisis (`src/motor/`)
* **Propósito**: Ejecutar controles estáticos multimódulo sobre el código o paquete descargado.
* **Frameworks & Tecnologías**: Node.js, TypeScript, Zod, Ripgrep (`rg`), Git, Gitleaks, Ollama (`gemma2:2b`).
* **Componentes**:
  1. **Instrucciones / Prompt Injection (`src/motor/instrucciones/`)**: Inspecciona archivos Markdown, `.cursorrules` y código fuente buscando patrones de inyección estática, comentarios maliciosos o intentos de evasión.
  2. **Unicode / Trojan Source (`src/motor/unicode/`)**: Identifica caracteres invisibles, Unicode Tags (`U+200B..U+FEFF`), controles bidireccionales BIDI (`U+202A..U+202E`) y homóglifos.
  3. **Dependencias / Supply Chain (`src/motor/dependencias/`)**: Analiza manifiestos (`package.json`, `requirements.txt`), detecta typosquatting y verifica existencia en registros npm/PyPI con soporte de mirror local (`ADUANA_NPM_MIRROR`).
  4. **Secretos / Credenciales (`src/motor/secretos/`)**: Ejecuta `gitleaks` sobre el árbol de archivos e historial de commits para prevenir filtraciones de API Keys o claves privadas.
  5. **SAST Multilenguaje (`src/motor/sast/`)**: Reglas de análisis de código estático para C, C++, Java, Python y JavaScript/TypeScript.
  6. **Triage IA & Informe Ejecutivo (`src/motor/llm/ollama.ts`)**: Evaluador secundario de ambigüedades mediante IA local y generador automatizado del `InformeEjecutivo`.

### 🔹 Plataforma Backend (`src/plataforma/`)
* **Propósito**: Administrar API REST, streaming Server-Sent Events (SSE), persistencia y servidor de herramientas MCP para agentes de IA.
* **Frameworks & Tecnologías**: Node.js, Express, SQLite (`better-sqlite3` en modo WAL), `@modelcontextprotocol/sdk`.
* **Componentes**:
  1. **Servidor HTTP Express (`src/plataforma/server.ts`)**: Servidor seguro en `127.0.0.1:3000` con CORS restringido y límites de payload.
  2. **Orquestador de Cuarentena (`src/plataforma/orquestador.ts`)**: Maneja el ciclo de vida del escaneo (ingesta → pipeline de análisis → generación de informe → emisión SSE → limpieza).
  3. **Servidor MCP (`src/plataforma/mcp.ts`)**: Servidor MCP vía stdio que expone las herramientas `check_package` y `check_repo` para intercepción automática de comandos.
  4. **Base de Datos SQLite (`src/plataforma/db.ts`)**: Persistencia transaccional con journaling WAL.

### 🔹 Frontend Dashboard (`frontend/`)
* **Propósito**: Panel web táctico para monitoreo de inspecciones en tiempo real y visualización de dictámenes.
* **Frameworks & Tecnologías**: React 18, Vite 8, TailwindCSS v4, React Router 7, TanStack React Query, Atkinson Hyperlegible & JetBrains Mono fontsets.
* **Componentes**:
  1. **HomePage (`frontend/src/pages/HomePage.tsx`)**: Buscador central con botón **`INSPECCIONAR`** y tabla estricta de *'ÚLTIMOS INSPECCIONADOS'* con badges en píldora (`CRITICAL / RETENIDO`, `WARNING / REVISAR`, `CLEAR / LIBERADO`).
  2. **InspeccionEnCurso (`frontend/src/components/InspeccionEnCurso.tsx`)**: Monitoreo de pipeline con barra de progreso, tiempos por etapa en `ms` y evidencia en tiempo real.
  3. **Reporte (`frontend/src/components/Reporte.tsx`)**: Muestra formal del veredicto, resumen de severidades, matriz de módulos y la presentación del `InformeEjecutivo`.

---

## 3. Formato del `InformeEjecutivo`

El sistema backend genera de forma nativa para cada escaneo un objeto `InformeEjecutivo` estructurado en formato JSON:

```typescript
type InformeEjecutivo = {
  cabecera?: {
    caratula: string;        // ej. "INFORME EJECUTIVO DE AUDITORÍA Y TÁCTICA DE CIBERDEFENSA"
    codigoDocumento: string; // ej. "ADUANA-DEF-6A2F2267"
    fecha: string;           // YYYY-MM-DD
    revision: string;        // "1.0.0"
    paginas: string;         // "1/1"
    caracter: string;        // "RESERVADO - SOBERANÍA TECNOLÓGICA"
  };
  objetivo?: string;
  alcance?: string;
  problematicaAnterior?: string;
  introduccion?: string;
  indice?: string[];
  desarrollo?: string;
  conclusion?: string;
  personal?: Array<{
    nombre: string;
    cargo: string;
    grado?: string;
    firma?: string;
  }>;
  desafioDetectado?: string;
  objetivoRepo?: string;
  metricasImpacto?: string[];
  faseEjecucion?: string;
};
```

---

## 4. Referencia de API HTTP & SSE

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/scans` | Inicia un escaneo (`{ "objetivo": "https://github.com/..." \| "npm:<nombre>" }`). Responde `201 { "id": "uuid" }`. |
| `GET` | `/api/scans/:id` | Devuelve el objeto `Scan` completo incluyendo `hallazgos` e `informeEjecutivo`. |
| `GET` | `/api/scans/:id/events` | Stream SSE de progreso en tiempo real (`etapa` → `hallazgo` → `veredicto`). |
| `GET` | `/api/scans/:id/reporte-defensa` | Devuelve el informe de auditoría normativo (NIST SP 800-30, NIST SSDF, ISO 27001/31000, MITRE ATLAS). |
| `GET` | `/api/health` | Consulta el estado del motor (Ollama local, Gitleaks, Modo Offline). |
| `POST` | `/api/agente/check-package` | Endpoint consumido por el servidor MCP antes de instalar un paquete. |
| `POST` | `/api/agente/check-repo` | Endpoint consumido por el servidor MCP antes de clonar o abrir un repositorio. |

---

## 5. Cumplimiento Normativo y Cobertura MITRE ATLAS

* **NIST SP 800-30 & ISO 31000**: Evaluación de riesgos basada en matrices de severidad determinista (Crítica, Alta, Media, Baja).
* **NIST SSDF (Secure Software Development Framework)**: Control preventivo antes del consumo de componentes externos.
* **ISO 27001**: Controles de confidencialidad e integridad sobre secretos y credenciales.
* **MITRE ATLAS AML.T0051**: Detección de inyecciones de prompt estáticas en artefactos de software.
* **MITRE ATLAS AML.T0010**: Protección contra contaminación en cadenas de suministro.

---

## 6. Verificación de Integridad y Suite de Pruebas

Toda la base de código cuenta con verificación empírica automatizada:

* **Compilación TypeScript (`npm run typecheck`)**: `0 errores` (Tipado estricto habilitado).
* **Pruebas Automatizadas Backend & Motor (`npm run test`)**: **136/136 tests pasados** (Vitest).
* **Build de Producción Frontend (`cd frontend && npm run build`)**: Compilación exitosa en `923ms` (183 módulos transformados).
