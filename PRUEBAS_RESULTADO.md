# Resultado de pruebas — Aduana (back)

QA completo del back de Aduana antes de la demo del Hackathon CYBER.AR 2026. Cubre las 5 fases acordadas: preparación, motor, plataforma, adversariales y punta-a-punta de demo, más el script de humo final.

Rama de trabajo: `qa/pruebas-back` (desde `main`, commit base `e9bf3fa`). **No se modificó ningún archivo de producción** — todo el trabajo está en `tests/`, `scripts/`, `vitest.config.ts` (autorizado explícitamente para `fileParallelism`/`globalSetup`) y `package.json` (solo el script `test:demo`). Los bugs del motor se arreglan en otra rama.

---

## 1. Resumen

- **159/159 tests automatizados en verde** (`npm test`, estable con `fileParallelism: false`), de los cuales **9 son `it.fails`** que documentan comportamiento roto respecto a la especificación (a propósito: pasan en verde *porque* confirman que el bug sigue ahí; el día que alguien arregle el código real, esos tests van a empezar a fallar y hay que borrarles el `.fails`).
- **12 variantes de inyección + 5 casos de control** corridas contra el motor real (script, no automatizado con vitest por ser exploratorio/tabular).
- **1 script de humo** (`npm run test:demo`, 14.7s) con un control deliberado que hoy da ❌ a propósito.
- **13 bugs encontrados** (2 de severidad seguridad-crítica, 1 seguridad, resto funcionales/menores), **7 diferencias con la especificación** que no son bugs claros, **7 puntos bloqueados** con motivo.

### ¿Listo para la demo?

**Sí, con dos condiciones no negociables:**

1. **No mostrar `check_package("unused-imports")` (ni ningún confundible/typosquatting) en vivo.** Confirmado con el motor real en Fase 4: da `permitido` en lugar de `requiere_confirmacion`. Usar un paquete inexistente para el guion de "paquete bloqueado" (sí funciona, <0.5s).
2. **No disparar un escaneo en vivo con muchos hallazgos ambiguos.** El peor caso medido (15 candidatos de IA) tarda **182s** — se come la demo entera. Usar el reporte **pregenerado** de `repo-malicioso` (6 hallazgos, ~26s si se regenera, 3/3 corridas idénticas) y narrar sobre eso.

Con esas dos condiciones, el guion mínimo (reporte pregenerado + `check_package` en vivo con un caso que funcione) entra cómodo en los 3 minutos: el cómputo real en vivo es <1 segundo.

---

## 2. Tabla por sección

### Fase 0 — Preparación

| Punto | Resultado | Nota |
|---|---|---|
| Node / npm ci / tsc --noEmit | ✅ | Node v22.23.2, 0 errores de tipos |
| Linter | ⏸️ N/A | No hay ningún linter configurado en el proyecto (sin `.eslintrc`/`eslint.config.*`, sin script `lint`) |
| `npm audit` | ⚠️ | 3 vulnerabilidades (2 moderadas, 1 alta) — ver sección Diferencias, D6/D7 |
| gitleaks version y subcomandos | ⚠️ | 8.30.1 instalado; el parseo de versión del código tiene un bug menor (ver Bugs, B7) |
| Ollama + modelo | ✅ | `gemma2:2b` descargado y activo |
| Fixtures + db:reset | ✅ | |
| Baseline de tests existentes | ✅ | 66/66 antes de empezar |

### Fase 1 — Motor

| Área | Tests nuevos | Resultado |
|---|---|---|
| Recorrido de archivos (`archivos.ts`) | 6 | ✅ (no tenía ningún test antes) |
| Unicode | +3 (9 total) | ✅ + 1 bug encontrado (B4) |
| Instrucciones | +7 (14 total) | ✅ + 1 bug encontrado (B5) |
| Dependencias / registro | 8 + 8 nuevos (`registro-cliente.test.ts`) | ✅ + 1 bug (B2) |
| `verificarPaquete` (matriz completa) | 8 (nuevo) | ✅ + 1 bug crítico (B1) |
| Secretos | +3 (9 total) | ✅ + 1 bug seguridad (B6) |
| IA local (`ollama.ts`) | 9 (nuevo) | ✅ + 2 bugs (B3, prompt sin escapar) |
| Veredicto (`scoring.ts`) | ya cubierto (9) | ✅ sin cambios, cobertura ya buena |
| Cancelación | 2 (nuevo) | ✅ + 1 nota menor |

### Fase 2 — Plataforma

| Área | Tests nuevos | Resultado |
|---|---|---|
| API `/api/scans` (casos felices + 11 objetivos inválidos + body grande + CORS + bind) | 20 (nuevo) | ✅ + 1 bug (B8) |
| API `/api/agente` (check-package matriz, check-repo, eventos, cuarentena) | 8 (nuevo) | ✅ |
| SSE (orden, conexión tardía, replay, 2 clientes, upsert sin duplicar, heartbeat) | 6 (nuevo) | ✅ + 1 hallazgo de infra (B9) |
| Ingesta segura (tar/zip maliciosos, postinstall) | 3 (nuevo) | ✅ — **verificado seguro** |
| MCP (tools, no-leak, falla cerrado) | 4 (nuevo) | ✅ |
| CLI (exit codes, sin servidor, evidencia marcada) | 6 (nuevo) | ✅ |
| DB (registro corrupto no tira el servidor) | 1 (nuevo) | ✅ |

### Fase 3 — Adversariales

Ver tabla completa en la sección 3 de este documento. Resumen: **10/12 inyecciones detectadas** (por reglas y/o IA), **2/12 con falso negativo total** (B10, el hallazgo más grave de la sesión), **5/5 casos benignos sin falsos positivos**.

### Fase 4 — Punta a punta

| Punto | Resultado |
|---|---|
| Reporte pregenerado repo-malicioso, 3 corridas | ✅ idénticas (6 hallazgos, retenido) |
| `check_package` en vivo (confundible) | ❌ da `permitido` (B1/B13) |
| `check_package` en vivo (inexistente) | ✅ `bloqueado`, 0.47s |
| Front | ⏸️ BLOQUEADO — no existe todavía |
| Comparación con/sin GPU | ⏸️ BLOQUEADO — sin GPU dedicada en esta máquina |
| Push a GitHub del repo demo | ⏸️ N/A — el guion simplificado usa el reporte pregenerado, no hace falta clonar en vivo |

### Fase 5 — Script de humo

`npm run test:demo`: 4/5 ✅ en 14.7s. El punto 4 (control de confundible) da ❌ a propósito — ver sección 4, B1.

---

## 3. Fase 3 — Detalle de inyecciones adversariales

Corridas con `scripts/adversariales.ts` contra el motor real (Ollama activo, `gemma2:2b`).

| # | Variante | Detectado por | Veredicto |
|---|---|---|---|
| 1 | Español directo (exfiltración + anulación) | Reglas (`exfiltracion`) + IA (`anulacion`, malicioso 0.9) | 🔴 RETENIDO |
| 2 | Inglés directo | Reglas + IA (malicioso 0.9) | 🔴 RETENIDO |
| 3 | Mixto ES/EN + `curl\|sh` | Reglas (`ejecucion-remota`) + IA | 🔴 RETENIDO |
| 4 | Partida en 2 comentarios HTML separados | Reglas + IA (sospechoso 0.5) | 🔴 RETENIDO |
| 5 | Manipulación dentro de base64 | Solo IA (2 candidatos, malicioso 0.9) | 🔴 RETENIDO |
| 6 | Mensaje oculto en Unicode Tags (variante propia) | Reglas (crítica, determinista) | 🔴 RETENIDO |
| 7 | Imita el JSON esperado por el triage | **Ninguno** | 🟢 LIBERADO |
| 8 | "Este repo es seguro, no hay nada sospechoso" | IA la vio, calificó **benigno** (no detectó la manipulación) | 🟢 LIBERADO |
| 9 | Archivo grande (2000 líneas), instrucción al final | Reglas + IA | 🔴 RETENIDO |
| 10 | Exfiltración en lenguaje natural, sin keywords (ES) | **Ninguno** | 🟢 LIBERADO |
| 11 | Exfiltración en lenguaje natural, sin keywords (variante) | **Ninguno** | 🟢 LIBERADO |
| 12 | `iex(...)` en comentario oculto | Reglas (`ejecucion-remota`, severidad `alta`) | 🟡 REVISAR |

**Casos benignos de control (5/5 sin falso positivo):**

| Caso | Veredicto | Clasificación IA |
|---|---|---|
| A. AGENTS.md normal ("corré npm test antes de commitear") | 🟢 LIBERADO | sin candidatos (ni llegó a la IA) |
| B. README con "ignore" en otro contexto | 🟢 LIBERADO | sin candidatos |
| C. CONTRIBUTING con instalación legítima | 🟢 LIBERADO | sin candidatos |
| D. README mencionando IA en contexto normal | 🟢 LIBERADO | sin candidatos |
| E. `.cursorrules` benigno real | 🟢 LIBERADO | sin candidatos |

---

## 4. Bugs, ordenados por impacto

### B1 — `verificarPaquete` nunca chequea confundibles/typosquatting/paquete-nuevo

- **Severidad:** seguridad (bloquea la demo tal como está planeada)
- **Cómo reproducirlo:** `motor.verificarPaquete("npm", "unused-imports", { offline: false })` con el paquete existiendo de verdad en el registro. Confirmado en vivo vía MCP en Fase 4.
- **Esperado / actual:** esperado `resultado: "requiere_confirmacion"`, `sugerencia: "eslint-plugin-unused-imports"`. Actual: `resultado: "permitido"`, `sugerencia: undefined`.
- **Archivo / función:** `src/motor/index.ts`, `motor.verificarPaquete()`.
- **Fix sugerido (sin aplicar):** reutilizar `buscarTyposquatting()` y el chequeo de `CONFUNDIBLES` de `src/motor/analizadores/dependencias.ts` dentro de `verificarPaquete`, igual que ya hace `analizarPackageJson`. Devolver `requiere_confirmacion` + `sugerencia` en esos casos, y considerar también `diasCreacion`/`descargasSemanales` para el caso "paquete nuevo".
- **Test:** `tests/motor/verificar-paquete.test.ts` (3 `it.fails`), confirmado en vivo en Fase 4 y en `scripts/test-demo.ts` (control #4, deliberadamente ❌).

### B10 — Falso negativo total: exfiltración en lenguaje natural sin keywords

- **Severidad:** seguridad (el más grave de toda la sesión)
- **Cómo reproducirlo:** archivo `.md` sensible con un pedido de exfiltración en español/inglés natural que no contenga ninguna de las frases fijas de `reglas/instrucciones.json` (sin ".env", "TOKEN", "curl", URLs, "ignorá las instrucciones"). Ver casos 10 y 11 de la Fase 3.
- **Esperado / actual:** se esperaría como mínimo `revisar` (el triage de IA debería poder marcarlo sospechoso). Actual: `liberado`, cero hallazgos — el contenido nunca llega a la IA porque las reglas nunca lo marcaron como candidato.
- **Archivo / función:** arquitectural — `src/motor/analizadores/instrucciones.ts` (`analizarArchivo`, que solo genera candidatos por match de regex) + `src/motor/pipeline.ts` (el triage de IA solo procesa `allHallazgos.filter(h => !h.determinista)`, nunca corre sobre contenido sin match previo).
- **Fix sugerido (sin aplicar):** para archivos sensibles (`esArchivoSensible`), correr un triage de IA "libre" (sin candidato de regex previo) sobre el contenido completo cuando no matcheó ninguna regla, no solo como refinamiento de candidatos ya encontrados. Requiere cuidar el presupuesto de `MAX_LLAMADAS` (ver B3).
- **Test:** documentado en `scripts/adversariales.ts`, no automatizado con vitest (es un caso de diseño, no una aserción puntual). Recomiendo agregarlo a los adversariales fijos una vez decidido el fix.

### B6 — `analizarSecretos` no distingue "gitleaks ausente" de "sin hallazgos" (fail-open)

- **Severidad:** seguridad
- **Cómo reproducirlo:** pasar un `GitleaksRunner` que lance una excepción (simula gitleaks no encontrado / timeout).
- **Esperado / actual:** la especificación pide "la etapa queda en error y el veredicto es como mínimo revisar". Actual: `analizarSecretos` atrapa el error y devuelve `[]` — exactamente igual que "no hay secretos". La etapa `secretos` nunca queda en `error` (el catch está *dentro* de la función, `ejecutarEtapa` nunca ve la excepción). Un repo con secretos reales, escaneado sin gitleaks disponible, puede salir `liberado` sin ninguna advertencia.
- **Archivo / función:** `src/motor/analizadores/secretos.ts`, `analizarSecretos()`.
- **Fix sugerido (sin aplicar):** o bien propagar el error (dejar que `ejecutarEtapa` lo capture y marque la etapa en `error`), o devolver una señal explícita distinguible (ej. un campo `degradado: true` en el resultado) que `scoring.ts` pueda usar para forzar `revisar`.
- **Test:** `tests/motor/secretos.test.ts` (`it.fails` "cuando el runner falla, debería distinguirse...").

### B3 — Reintento de JSON inválido en `ollama.ts` no reintenta "una vez", recursa mal

- **Severidad:** funcional, con impacto directo en la demo (agota presupuesto de IA)
- **Cómo reproducirlo:** mockear una respuesta con forma de objeto pero JSON inválido, de forma consistente (no puntual).
- **Esperado / actual:** esperado 2 llamadas (1 original + 1 reintento). Actual, medido: **8 llamadas** para un solo candidato problemático — cada retry hace `llamadasRealizadas++` y llama a `triage()` recursivamente, cuya propia entrada vuelve a incrementar el contador.
- **Archivo / función:** `src/motor/llm/ollama.ts`, función `triage()`, rama `catch` del parseo de JSON.
- **Fix sugerido (sin aplicar):** no incrementar el contador antes de la llamada recursiva (dejar que la llamada recursiva lo haga una sola vez), o refactorizar el reintento como un loop `for (let intento = 0; intento < 2; intento++)` en vez de recursión.
- **Test:** `tests/motor/ollama.test.ts` (`it.fails`).

### B13 — (Duplicado de impacto de B1, confirmado en vivo)

Ver B1 — mismo bug, confirmado con el motor real en Fase 4 vía MCP (`check_package("unused-imports")` → `permitido`, 0.51s).

### B2 — `api.npmjs.org` no está en la allowlist de hosts del cliente de registro

- **Severidad:** funcional
- **Cómo reproducirlo:** `verificarNombre("npm", "cualquiera", { offline: false })` en modo online real, mirar `descargasSemanales`.
- **Esperado / actual:** debería completar la consulta de descargas semanales. Actual: `fetchSeguro` tira `Host no permitido: api.npmjs.org` (no está en `HOSTS_ALLOWLIST`, que solo tiene `registry.npmjs.org`), y el error queda tragado por un `catch {}` vacío en `verificarNpm`. `descargasSemanales` es `undefined` siempre en producción real — la regla "paquete con pocas descargas → media" nunca puede dispararse online.
- **Archivo / función:** `src/motor/registro/cliente.ts`, constante `HOSTS_ALLOWLIST`.
- **Fix sugerido (sin aplicar):** agregar `"api.npmjs.org"` a `HOSTS_ALLOWLIST`.
- **Test:** `tests/motor/registro-cliente.test.ts` (`it.fails`).

### B8 — Body >10KB en `POST /api/scans` responde 500 en vez de 4xx

- **Severidad:** funcional (verificado: **no** filtra stack trace ni rutas internas, solo el mensaje nativo de `raw-body` — no se sube a seguridad)
- **Cómo reproducirlo:** `POST /api/scans` con un body >10KB.
- **Esperado / actual:** esperado 4xx (idealmente 413 Payload Too Large). Actual: 500, porque `PayloadTooLargeError` no es un `SyntaxError` y el error-handler de `server.ts` solo distingue ese caso especial antes de caer al catch-all genérico.
- **Archivo / función:** `src/plataforma/server.ts`, error-handler final.
- **Fix sugerido (sin aplicar):** en el error-handler, chequear también `(err as any)?.status === 413` o `err?.type === "entity.too.large"` (los errores de `raw-body`) y responder 413.
- **Test:** `tests/plataforma/api-scans.test.ts` (`it.fails`).

### B9 — No hay base de datos de test aislada

- **Severidad:** funcional / infraestructura de CI
- **Cómo reproducirlo:** correr `npm test` con el seed de demo cargado; revisar `data/aduana.db` después.
- **Esperado / actual:** los tests no deberían tocar la base real. Actual: `RUTA_DB` (`config.ts`) está hardcodeada, no hay override por env var; `db.test.ts` hace `DELETE FROM ...` sobre la base real antes de cada test. Además, correr los test files de plataforma en paralelo (el default de Vitest) hace que varios servidores escriban la misma base a la vez, causando un test intermitente real (`api-sse.test.ts`).
- **Archivo / función:** `src/plataforma/config.ts`, `RUTA_DB`.
- **Mitigado del lado de tests (esta sesión):** `vitest.config.ts` ahora tiene `fileParallelism: false` + `globalSetup` (`tests/global-setup.ts`) que hace backup/restore automático de `data/aduana.db` alrededor de toda la corrida — `npm test` ya no destruye el seed de demo, y dejó de ser flaky.
- **Fix sugerido para producción (sin aplicar):** `RUTA_DB` configurable por `ADUANA_DB_PATH`, y que los tests usen una ruta separada (o `:memory:`).

### B4 — Selector de variación Unicode dentro de un emoji real se reporta como fuera de contexto

- **Severidad:** menor (falso positivo, no cambia el veredicto por sí solo — `media` no activa `revisar`)
- **Cómo reproducirlo:** analizar un archivo con un emoji común que use VS16 (ej. ❤️ = U+2764 + U+FE0F).
- **Esperado / actual:** la especificación pide explícitamente no reportar selectores dentro de un emoji. Actual: se reporta siempre, sin distinguir el contexto.
- **Archivo / función:** `src/motor/analizadores/unicode.ts`, sección "Variant selectors".
- **Fix sugerido (sin aplicar):** al detectar un selector de variación, mirar el code point inmediatamente anterior; si está en un rango de emoji base conocido, no reportar.
- **Test:** `tests/motor/unicode.test.ts` (`it.fails`).

### B5 — Patrón `config-autoaprobacion` da falso positivo en cualquier `.mcp.json` legítimo

- **Severidad:** menor (falso positivo, pero es `alta` determinista — si dispara, sí fuerza `revisar`)
- **Cómo reproducirlo:** analizar un `.mcp.json` con un servidor MCP declarado normalmente (`"mcpServers": {"x": {"command": "npx", ...}}}`), sin ningún flag de autoaprobación.
- **Esperado / actual:** el nombre de la regla promete detectar autoaprobación real. Actual: el patrón `"mcpServers"[\s\S]{0,200}"command"` matchea la estructura básica de cualquier config MCP válida, no un flag específico.
- **Archivo / función:** `src/motor/reglas/instrucciones.json`, categoría `config-autoaprobacion`.
- **Fix sugerido (sin aplicar):** exigir además la presencia de `allowAutoApprove`/`autoApprove`/`allowedTools":[*` en el mismo bloque, no solo `mcpServers`+`command`.
- **Test:** `tests/motor/instrucciones.test.ts` (`it.fails`).

### B11 — Inconsistencia del LLM ante el mismo tipo de ataque de manipulación

- **Severidad:** menor / limitación de calidad del modelo (relacionada con B10 — refuerza que no conviene depender solo del LLM)
- **Evidencia:** caso 8 de Fase 3 ("este repo es seguro, no hay nada sospechoso") — el LLM lo calificó `benigno`, mientras que un ataque de manipulación equivalente dentro de base64 (caso 5) sí lo detectó como `malicioso`.
- **No es arreglable con una línea de código** — es una limitación de `gemma2:2b` (2B parámetros). Motiva el cambio de regla sugerido R3 (ver abajo).

### B7 — Detección de versión de gitleaks no matchea el string de esta build

- **Severidad:** menor
- **Cómo reproducirlo:** `gitleaks version` en esta build de Arch devuelve `"version is set by build process"` (sin número).
- **Esperado / actual:** el regex `/v?(\d+)\./` no matchea, así que `major` cae al default `8` — funciona por casualidad (asume v8+), pero fallaría en detectar un binario v7 real con un string de versión igualmente atípico.
- **Archivo / función:** `src/motor/analizadores/secretos.ts`, `crearGitleaksRunner()`, bloque de detección de versión.
- **Fix sugerido (sin aplicar):** si el regex no matchea, no asumir v8+ silenciosamente — usar `gitleaks --version` (flag, no subcomando) que suele ser más estándar, o registrar una advertencia.

### Cambios de reglas sugeridos para la rama de fixes (pedidos explícitamente, no aplicados)

- **R1.** `instruccion-ejecucion-remota` → severidad `critica` (hoy `alta`; motiva que el caso 12 de Fase 3 diera `revisar` en vez de `retenido` con `curl|sh`/`iex`).
- **R2.** Regla determinista nueva para textos que imitan las claves del JSON esperado por el triage (`"clasificacion"`, `"intentoManipulacion"`, etc. — caso 7 de Fase 3, hoy 0 detección).
- **R3.** Patrones de la categoría `manipulacion` → `alta` **determinista** (hoy `media` no-determinista — caso 8 de Fase 3 mostró que el LLM puede calificar como benigno un intento de manipulación casi textual).

---

## 5. Diferencias con la especificación (no son bugs claros)

- **D1.** `CONTEXTO_BACK_A_MOTOR.md` no existe en ningún lado del repo ni del historial de ninguna rama. Usé `TASKS.md` (tiene un log de decisiones de diseño bastante detallado) + el código fuente como sustituto.
- **D2.** `TASKS.md` menciona `src/motor/llm/prompts.ts` como archivo separado y lo marca como hecho; no existe — el prompt está inline en `ollama.ts`.
- **D3.** El motor no analiza `setup.py` en absoluto (solo `package.json` y `requirements.txt`). La especificación pedía "setup.py con red o subprocess da alta" — nunca implementado.
- **D4.** El CLI tiene su propia implementación de `marcarInvisibles()` con menos rangos cubiertos que `evidencia.ts` del motor (le faltan selectores de variación FE00-FE0F/E0100-E01EF y guión blando). Impacto práctico bajo porque la evidencia ya llega marcada desde el motor, pero es una segunda capa de defensa más débil que la primera.
- **D5.** No hay linter configurado en el proyecto.
- **D6.** `npm audit`: `adm-zip <=0.6.0` tiene un CVE de alta severidad (symlink-following en `extractAllTo`). Verificado en Fase 2 que el código **no usa ese método** (extracción manual propia) — no explotable tal como está usado, pero vale actualizar la dependencia igual quedar prolijos con el audit.
- **D7.** `npm audit`: `@vitest/mocker` (vía `vitest`) tiene un advisory moderado de path traversal. Es una dependencia de testing, no llega a producción.

---

## 6. Tiempos medidos

| Medición | Tiempo |
|---|---|
| Triage IA aislado, 5 corridas repetidas del mismo hallazgo (`scripts/calidad-triage.ts`) | 4.6–5.1s por llamada, 100% `intentoManipulacion:true`, 0% JSON inválido |
| Escaneo completo `repo-malicioso` (motor real + Ollama), 3 corridas | ~26–27s cada una, idénticas (6 hallazgos, retenido) |
| Escaneo `npm:picocolors` (liberado, sin candidatos IA) | ~450ms–950ms |
| **Peor caso: 15 candidatos IA secuenciales** (`scripts/peor-caso-triage.ts`) | **182.4s (~3min 2s)** — no entra en la demo de 3 minutos |
| `check_package` en vivo por MCP (con o sin IA) | ~0.5s |
| `npm run test:demo` completo | 14.7s |
| `npm test` (159 tests, serie) | ~117s |

**Nota GPU:** esta máquina no tiene GPU dedicada (solo iGPU AMD sin ROCm) — no se pudo medir con GPU. Todo lo de arriba es en CPU.

---

## 7. Bloqueado

| Punto | Motivo |
|---|---|
| Comparación de tiempos con/sin GPU | Sin GPU dedicada en esta máquina |
| Prueba punta a punta con el front | El equipo lo sigue armando, no existe todavía |
| Timeout real de 5 minutos de la cola (`LIMITES.timeoutTrabajoMs`) | No configurable por env var; acortarlo requeriría tocar `config.ts` de producción, fuera del alcance de esta ronda |
| Reinicio real del servidor con un scan `en_curso` (end-to-end) | Solo se testeó la función `marcarInterrumpidosPorReinicio()` en aislado; el flujo completo de matar y reiniciar el proceso no se automatizó |
| Inspector oficial de MCP | No se llegó a instalar/probar; el protocolo JSON-RPC ya se validó a mano contra el servidor real (Fase 2 y 4) |
| Heartbeat SSE real (esperar los 15s completos) | Solo se verificaron los headers del protocolo; esperar el intervalo real no se automatizó por tiempo |
| Push del repo demo a GitHub | N/A con el guion simplificado (reporte pregenerado, no se clona en vivo) |

---

## 8. Cómo volver a correr todo

```bash
# Preparación
npm ci
npm run typecheck
npm run build
npm run generar-fixtures     # si fixtures/ no existe
npm run db:reset && npm run db:seed

# Suite completa (motor + plataforma), ~2 minutos, backup/restore automático de la DB
npm test

# Fase 3 — adversariales (requiere Ollama corriendo), ~2-3 minutos
npx tsx scripts/adversariales.ts

# Peor caso de triage (15 llamadas reales), ~3 minutos
npx tsx scripts/peor-caso-triage.ts

# Calidad del triage (5 corridas repetidas), ~30s
npx tsx scripts/calidad-triage.ts 5

# Script de humo antes de la demo (requiere servidor + Ollama arriba)
npm run server            # en otra terminal
npm run test:demo
```
