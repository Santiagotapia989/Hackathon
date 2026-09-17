---
name: sivar
description: Verificar repositorios y paquetes con SIVAR (Sistema de Inspección y Vigilancia de Archivos y Repositorios) antes de clonarlos o instalarlos. Usar SIEMPRE antes de `git clone` de un repo externo o de instalar una dependencia npm/pypi. Incluye el flujo de aprobación humana por token cuando el dictamen es REVISAR o RETENIDO.
---

# SIVAR — Control previo para agentes de código

SIVAR inspecciona repositorios y paquetes antes de abrirlos e informa un
dictamen: `liberado`, `revisar` o `retenido`. Tu trabajo como agente es
consultar SIVAR **antes** de clonar un repositorio o instalar un paquete, y
respetar el dictamen.

El backend corre en la misma máquina: `http://127.0.0.1:3000`
(el frontend de reportes en `http://localhost:5173`).

## Regla de oro

Nunca clones un repo externo ni instales una dependencia sin pasar por SIVAR.
Si SIVAR no responde, no continúes: avisá al usuario que el servicio está caído.

## Flujo: clonar un repositorio

1. **Chequear el repo** antes de clonar:

   ```bash
   curl -s -X POST http://127.0.0.1:3000/api/agente/check-repo \
     -H "Content-Type: application/json" \
     -d '{"url": "https://github.com/usuario/repo"}'
   ```

   Respuesta: `{ "scanId": "...", "estado": "...", "veredicto": "...", "resumen": {...} }`
   El escaneo puede tardar hasta ~2 minutos; el endpoint espera el dictamen.

2. **Actuar según el dictamen:**

   - **`liberado`** → el objetivo está aprobado. Cloná el repo con normalidad.
   - **`revisar`** → requiere aprobación humana:
     a. Decile al usuario que abra el reporte: `http://localhost:5173/escaneos/<scanId>`
     b. Pedile que en la tarjeta del dictamen aprete **"Generar token de aprobación"**
        y te pase el token (formato `SIVAR-XXXX-XXXX-XXXX`).
     c. Verificá el token:

        ```bash
        curl -s -X POST http://127.0.0.1:3000/api/agente/confirmar \
          -H "Content-Type: application/json" \
          -d '{"scanId": "<scanId>", "token": "<TOKEN>"}'
        ```

     d. Solo si responde `{ "autorizado": true }` → cloná. Si responde 403,
        el token es inválido o ya se usó → pedile al usuario que genere uno nuevo.
   - **`retenido`** → mismo flujo que `revisar`, pero el usuario debe hacer una
     **doble confirmación** en la página (el botón pide "Confirmar y generar
     token" con una advertencia de riesgo crítico). Explicale al usuario que el
     repo fue retenido y que aprobarlo implica aceptar el riesgo.
   - **`en_curso`** → el escaneo sigue corriendo. Consultá
     `GET /api/scans/<scanId>` cada ~15s hasta que `estado` sea `terminado`.
     No clones antes.
   - **`error`** → el escaneo falló. No clones; avisá al usuario.

3. **Notas importantes:**
   - El token está **atado al scanId**: un token de otro escaneo no sirve.
   - El token es **de un solo uso**: una verificación exitosa lo consume.
   - Nunca le pidas al usuario "cualquier token": tiene que generarlo desde el
     reporte del escaneo específico.

## Flujo: instalar un paquete (npm / pypi)

```bash
curl -s -X POST http://127.0.0.1:3000/api/agente/check-package \
  -H "Content-Type: application/json" \
  -d '{"ecosistema": "npm", "nombre": "nombre-del-paquete"}'
```

Devuelve `permitido`, `requiere_confirmacion` o `bloqueado`. Para
`requiere_confirmacion`/`bloqueado` el mismo mecanismo de token aplica usando
el `scanId` del escaneo del paquete (visible en el historial web).

## Vía MCP (si está configurado)

Este repo incluye un servidor MCP (`npm run mcp`) con las tools:

- `check_repo { url }` — equivalente a `/api/agente/check-repo`
- `check_package { ecosistema, nombre }` — equivalente a `/api/agente/check-package`
- `confirm_repo { scanId, token }` — equivalente a `/api/agente/confirmar`

Si tu cliente tiene el MCP configurado, usá las tools directamente en vez de
curl. El protocolo de decisión es el mismo.
