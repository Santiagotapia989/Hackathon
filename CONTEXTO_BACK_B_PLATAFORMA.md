# Contexto — Back, parte B: Plataforma

> Documento para el agente de código que construye la **Plataforma** de Aduana. Otra persona construye en paralelo el **Motor de análisis** (parte A). Leé todo antes de escribir código.

## 1. El proyecto en una línea

**Aduana** es un control de seguridad local para quien programa con asistentes de IA: antes de que un repo clonado o un paquete llegue al agente, lo analiza y emite un veredicto (🟢 liberado, 🟡 revisar, 🔴 retenido). Se presenta en el Hackathon CYBER.AR 2026.

Reglas del hackathon que te afectan:
- **Todo corre local.** El servidor escucha solo en `127.0.0.1`.
- **Solo datos simulados o públicos.**
- **Nunca ejecutar código** del repo o paquete analizado.

## 2. Qué te toca y qué no

**Te toca (parte B):** todo lo que rodea al análisis, en `src/plataforma/`:
- API HTTP con Express y eventos SSE para el front.
- Cola de escaneos y orquestación.
- **Ingesta:** clonar repos y descargar paquetes en cuarentena.
- Persistencia en SQLite.
- Servidor MCP para agentes de código.
- CLI `aduana`.
- Un **motor stub** para trabajar sin la parte A.

**No te toca (parte A):** analizadores, IA, cálculo del veredicto. Nunca analices contenido vos: todo pasa por la interfaz `Motor`.

## 3. El contrato

Está en `src/shared/contrato.ts` y ya está congelado. Tiene los tipos que consume el front, los bodies de los requests y la interfaz `Motor`. Validá con zod **todo lo que entra por HTTP** y todo lo que devuelve el motor. **No modifiques el contrato** sin acordarlo con la parte A.

El motor se obtiene así:

```ts
// src/plataforma/motor.ts
export const motor: Motor = process.env.ADUANA_MOTOR === "stub"
  ? motorStub
  : (await import("../motor/index.js")).motor;
```

## 4. Estructura

```
src/plataforma/
├── server.ts            # arranque Express en 127.0.0.1:3000
├── config.ts            # variables de entorno y límites
├── motor.ts             # elige motor real o stub
├── motor-stub.ts
├── api/
│   ├── scans.ts
│   ├── agente.ts
│   └── health.ts
├── sse.ts               # helper para responder SSE
├── bus.ts               # eventos por escaneo con buffer
├── cola.ts
├── orquestador.ts       # corre un escaneo de punta a punta
├── ingesta/
│   ├── objetivo.ts      # parsea y valida "url" o "npm:nombre"
│   ├── repo.ts
│   └── paquete.ts
├── db.ts
├── mcp.ts               # proceso MCP por stdio
└── cli.ts
tests/plataforma/
```

## 5. API

Servidor en `127.0.0.1:3000` (nunca `0.0.0.0`), con `express.json({ limit: "10kb" })`. Errores siempre como `{ error: string }` en español.

| Método | Ruta | Qué hace |
|---|---|---|
| `POST` | `/api/scans` | Valida `CrearScanBody`, parsea el objetivo, crea el scan en DB, lo encola y **responde enseguida** `201 { id }` |
| `GET` | `/api/scans` | Últimos 50 scans, sin `hallazgos` |
| `GET` | `/api/scans/:id` | `Scan` completo, o 404 |
| `GET` | `/api/scans/:id/events` | SSE del escaneo |
| `GET` | `/api/health` | `Health`, combinando `motor.estado()` y la detección de red |
| `POST` | `/api/agente/check-package` | Usado por el MCP. Valida `CheckPackageBody`, llama a `motor.verificarPaquete`, guarda y emite un `EventoAgente`, devuelve `ResultadoPaquete` |
| `POST` | `/api/agente/check-repo` | Usado por el MCP. Crea un scan, espera hasta 120 s y devuelve `{ scanId, estado, veredicto?, resumen? }` |
| `GET` | `/api/agente/events` | SSE de `EventoAgente` |

### Parseo del objetivo (`ingesta/objetivo.ts`)
- `npm:<nombre>` o `pypi:<nombre>` → paquete. Validar el nombre con regex estricta: npm con scope opcional, minúsculas, dígitos, `-._`; PyPI con letras, dígitos y `-._`.
- `https://github.com/<owner>/<repo>` o `https://gitlab.com/...` → repo. **Allowlist de hosts**, solo `https`, sin usuario ni contraseña en la URL, sin query ni fragment. Quitar `.git` final.
- Cualquier otra cosa → 400 con un ejemplo del formato correcto.

## 6. SSE y bus de eventos

`bus.ts` guarda, por cada escaneo, un `EventEmitter` y un **buffer con todos los eventos emitidos**. Es clave: el front abre el SSE *después* de recibir el id, así que al conectarse tiene que recibir primero todo lo que ya pasó.

Al conectar a `/api/scans/:id/events`:
1. Headers `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`.
2. Si el scan ya terminó (está en DB y no en el bus), mandar una etapa por cada `etapa`, un `hallazgo` por cada hallazgo y el `veredicto`, y cerrar.
3. Si está en curso, reenviar el buffer y suscribirse.
4. Heartbeat (`: ping`) cada 15 s.
5. Desuscribir al cerrarse la conexión.

Formato: `event: <nombre>\ndata: <json>\n\n`, con los nombres de `EVENTOS_SCAN`. Un `hallazgo` con un `id` repetido es una actualización; reemplazalo en memoria y en DB.

El buffer de un escaneo se libera 5 minutos después de terminado.

## 7. Cola y orquestador

- Cola FIFO en memoria, **concurrencia 1**. Con un solo LLM local no conviene paralelizar.
- Cada trabajo tiene su `AbortController` y timeout total de 5 minutos.
- Al arrancar el servidor, los scans que quedaron `en_curso` en DB pasan a `error` con mensaje "Interrumpido por reinicio".

`orquestador.ts`, por cada escaneo:
1. Emite `etapa ingesta en_curso`.
2. Crea `/tmp/aduana/<id>/` y descarga el objetivo (sección 8).
3. Emite `etapa ingesta lista`, o `error` y termina el scan en `error`.
4. Llama a `motor.analizarDirectorio(dir, ctx, emitir)`, reenviando cada evento al bus y guardando en DB.
5. Con el resultado: guarda veredicto, resumen y duración, estado `terminado`, y emite `veredicto`.
6. Si el motor lanza: estado `error`, emite `error` con un mensaje entendible.
7. **En `finally`: borra el directorio de cuarentena** con `fs.rm(dir, { recursive: true, force: true })`.

## 8. Ingesta

Regla general: todos los comandos con `execFile` o `spawn` con **argumentos en array**, nunca strings armados, y con timeout.

### Repos (`ingesta/repo.ts`)

```ts
execFile("git", [
  "-c", "core.symlinks=false",
  "-c", "protocol.file.allow=never",
  "clone", "--no-recurse-submodules", "--", url, destino,
], { timeout: 60_000, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
```

- Clon completo, sin `--depth`, porque el análisis de secretos necesita el historial.
- `core.symlinks=false` hace que los symlinks queden como archivos de texto.
- Clonar no ejecuta hooks del repo, pero **nunca** corras nada adentro del directorio.
- Después del clon, medir el tamaño: si supera 200 MB, abortar con error claro.
- `ctx.tieneHistorialGit = true`.

### Paquetes (`ingesta/paquete.ts`)

- **npm:** `npm pack <nombre> --ignore-scripts --pack-destination <tmp>` y extraer el `.tgz`.
- **PyPI:** consultar `https://pypi.org/pypi/<nombre>/json`, tomar la URL del sdist (o del wheel si no hay) y descargarla con `fetch`. **No usar `pip download`**, que puede ejecutar el backend de build del paquete.
- Extraer con la librería `tar` (o `adm-zip` para wheels) **filtrando entradas**: rechazar rutas absolutas, con `..`, symlinks y hardlinks.
- Límite de 50 MB descargado.
- Si el paquete no existe, la ingesta falla con "El paquete no existe en el registro". El chequeo de alucinaciones lo hace el motor.
- `ctx.tieneHistorialGit = false`.

### Detección de red (`config.ts`)
Al arrancar y cada 60 s, un `HEAD` a `https://registry.npmjs.org` con timeout de 3 s. Si falla, `offline = true`, y se pasa en `ctx.offline` y en `Health`. También se puede forzar con `ADUANA_OFFLINE=1`.

## 9. Base de datos (`db.ts`)

SQLite con `better-sqlite3` en `data/aduana.db`, modo WAL.

```sql
CREATE TABLE scans (
  id TEXT PRIMARY KEY,
  tipo TEXT NOT NULL,
  objetivo TEXT NOT NULL,
  estado TEXT NOT NULL,
  veredicto TEXT,
  resumen_json TEXT,
  etapas_json TEXT NOT NULL DEFAULT '[]',
  error TEXT,
  creado_en TEXT NOT NULL,
  duracion_ms INTEGER
);
CREATE TABLE hallazgos (
  id TEXT NOT NULL,
  scan_id TEXT NOT NULL REFERENCES scans(id),
  json TEXT NOT NULL,
  PRIMARY KEY (scan_id, id)
);
CREATE TABLE eventos_agente (
  id TEXT PRIMARY KEY,
  fecha TEXT NOT NULL,
  json TEXT NOT NULL
);
```

- Hallazgos con `INSERT ... ON CONFLICT DO UPDATE` para soportar las actualizaciones.
- Validar con zod al leer de la DB antes de responder.
- Script `npm run db:reset` para dejar la base limpia antes de la demo, y `npm run db:seed` para cargar escaneos de ejemplo en el historial.

## 10. Servidor MCP (`mcp.ts`)

Proceso **separado**, por stdio, con `@modelcontextprotocol/sdk`. Lo lanza el cliente del agente (Claude Code, Cursor, etc.). Como es otro proceso, **no comparte memoria con el servidor**: es un cliente HTTP finito que llama a `/api/agente/*`. Así los eventos quedan registrados y el front los ve.

Tools:

| Tool | Parámetros | Qué hace |
|---|---|---|
| `check_package` | `ecosistema`, `nombre` | Llama a `/api/agente/check-package` |
| `check_repo` | `url` | Llama a `/api/agente/check-repo` |

Descripción de las tools, para que el agente las use: "Llamá a esta herramienta ANTES de instalar cualquier dependencia" y "ANTES de clonar o abrir un repositorio externo".

**Regla crítica: la respuesta al agente no puede incluir contenido del repo o paquete.** Solo:
- el resultado o veredicto;
- motivos en español generados por Aduana;
- nombres de reglas, rutas de archivo y cantidades;
- la sugerencia de nombre real;
- el link al reporte (`http://127.0.0.1:5173/escaneos/<id>`).

Nunca `evidencia`, `evidenciaDecodificada` ni `explicacion`: devolverle al agente el texto malicioso sería inyectarlo nosotros mismos.

Formato de respuesta sugerido:

```
BLOQUEADO: el paquete "x" no existe en npm. No lo instales.
Sugerencia: eslint-plugin-unused-imports
```

Si el servidor no responde: "Aduana no está corriendo. No instales hasta verificar." (fallar cerrado).

Documentar en el README cómo registrarlo en Claude Code, por ejemplo con `claude mcp add` o un `.mcp.json`. Verificá la sintaxis actual en la documentación de cada cliente.

## 11. CLI (`cli.ts`)

Con `commander`, instalable como `aduana`. Es un cliente del servidor: si `/api/health` no responde, avisa "Iniciá el servidor con `npm run server`" y sale con código 2.

| Comando | Qué hace |
|---|---|
| `aduana scan <objetivo>` | Crea el scan, muestra el progreso desde el SSE y el veredicto con los hallazgos agrupados |
| `aduana clone <url> [destino]` | Escanea el repo. Si el veredicto es 🟢, lo clona en `destino` con las mismas opciones seguras de la ingesta. Si es 🟡, muestra los hallazgos y pide confirmación antes de clonar. Si es 🔴, no clona |
| `aduana install <npm:nombre>` | Llama a check-package. `permitido` → `npm install --ignore-scripts <nombre>`. `requiere_confirmacion` → muestra motivos y pregunta. `bloqueado` → no instala |

Volver a clonar después del escaneo evita tocar el contrato. Para la demo alcanza; si sobra tiempo, se puede optimizar reutilizando la cuarentena.

Códigos de salida: 0 liberado o permitido, 1 retenido o bloqueado, 3 revisar sin confirmar, 2 error.

Salida con colores (`picocolors`), y la evidencia se imprime **con las marcas de invisibles**, nunca cruda.

## 12. Motor stub (`motor-stub.ts`)

Implementa `Motor` sin analizar nada, para que vos y el front puedan trabajar desde el minuto cero:
- `analizarDirectorio`: emite las etapas en orden con demoras de 300 a 800 ms, emite los 4 hallazgos del escaneo de ejemplo `demo-001` (están en el contexto del front, sección 6), después re-emite el hallazgo `f2` con `analisisIA` para simular el triage, y devuelve `retenido`.
- `verificarPaquete`: `unused-imports` → `requiere_confirmacion` con sugerencia; nombres que empiecen con `fake-` → `bloqueado`; el resto → `permitido`.
- `estado`: `{ ollama: { activo: true, modelo: "stub" }, gitleaks: true }`.

Se activa con `ADUANA_MOTOR=stub`.

## 13. Seguridad (checklist)

- [ ] Escucha solo en `127.0.0.1`.
- [ ] CORS solo para `http://127.0.0.1:5173` y `http://localhost:5173`.
- [ ] Todo body validado con zod y con límite de tamaño.
- [ ] Allowlist de hosts para repos; regex estricta para nombres de paquetes.
- [ ] Comandos con argumentos en array y timeout.
- [ ] Extracción de archivos sin rutas absolutas, `..`, symlinks ni hardlinks.
- [ ] Límites de tamaño en clon y descarga.
- [ ] Cuarentena borrada en `finally`.
- [ ] Nada del repo o paquete se ejecuta, jamás.
- [ ] El MCP nunca devuelve contenido analizado.
- [ ] Logs sin secretos ni evidencia completa.

## 14. Cómo probar

- `ADUANA_MOTOR=stub npm run server` y `curl` a cada endpoint.
- Test del SSE: crear un scan, esperar 2 s y **recién ahí** conectar; tienen que llegar todos los eventos anteriores.
- Test de ingesta con un repo público chico y con `fixtures/repo-malicioso` servido localmente (la parte A lo genera). Para tests, agregá un modo que acepte rutas locales solo con `NODE_ENV=test`.
- Test de objetivos inválidos: `file:///etc`, `https://evil.com/x`, `npm:../../x`, `https://user:pass@github.com/x`.
- Test del MCP con el inspector oficial de MCP.

## 15. Plan

| Momento | Objetivo |
|---|---|
| Miércoles, mañana | Servidor, parseo de objetivos, DB, bus + SSE con buffer y motor stub. **El front ya puede conectarse** |
| Miércoles, tarde | Cola, orquestador e ingesta real de repos y paquetes |
| Miércoles, noche | **Integración 1:** cambiar el stub por el motor de la parte A y probar con los fixtures |
| Jueves, mañana | Endpoints de agente, servidor MCP y CLI |
| Jueves, tarde | **Integración 2** con front, `db:seed`, README (cómo instalar, correr y registrar el MCP) y ensayo de demo |

Si el tiempo aprieta, el orden de sacrificio es: soporte de PyPI en la ingesta, `db:seed`, el comando `aduana clone` (la demo puede usar `aduana scan`).

Antes de cada paso, mostrá el plan en pocas líneas. Al terminar cada endpoint, probalo con `curl` y con el motor stub.
