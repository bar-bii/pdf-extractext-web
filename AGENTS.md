# AGENTS.md — Reglas del proyecto `pdf-extractext-web`

Este archivo es **vinculante** para cualquier persona o agente que modifique el
repositorio. Toda contribución debe cumplir estas especificaciones al pie de la
letra. Si algo no está cubierto acá, se discute antes de implementarlo.

---

## 1. Alcance y arquitectura

Front end **estático** de PDF Extractext. No tiene build step en producción: el
navegador carga ES Modules nativos y nginx sirve los archivos.

```
src/
  index.html   markup semántico
  styles.css   estilos
  api.js       cliente HTTP puro (sin DOM)
  ui.js        render y manipulación del DOM (sin fetch)
  app.js       wiring: conecta api + ui + eventos
  main.js      entrypoint: crea cliente y arranca la app
```

Reglas de dependencias (dirección única):

```
main.js  ──►  app.js  ──►  api.js
                    └──►  ui.js
```

- `api.js` **no** importa `ui.js` ni `app.js` y **no** toca `document`.
- `ui.js` **no** importa `api.js` ni hace `fetch`.
- `app.js` orquesta; no implementa red ni render.
- `main.js` es el único archivo con efectos de arranque.

---

## 2. Doce factores (12-Factor App)

Cada cambio debe respetar estos factores, con estas reglas concretas:

| Factor | Regla en este repo |
| --- | --- |
| I. Código base | Un repo, un deployable. No se copia código de otros servicios. |
| II. Dependencias | Declaradas explícitamente en `package.json` + lockfile. Solo `devDependencies` (tests); producción es estático. |
| III. Config | La URL del backend llega por `API_UPSTREAM`. Prohibido hardcodear hosts, puertos o rutas absolutas del backend en `src/`. |
| IV. Backing services | La API es un recurso externo accesible por URL, nunca un módulo importado. |
| V. Build/release/run | Imagen Docker reproducible; la config se inyecta en runtime, no en build. |
| VI. Procesos | El contenedor es sin estado. No se escribe en disco. |
| VII. Port binding | nginx expone el puerto 80 y se publica desde `docker-compose`. |
| VIII. Concurrencia | nginx gestiona la concurrencia; el front no comparte estado entre pestañas ni procesos. |
| IX. Desechabilidad | Contenedor efímero: arranca rápido, se puede matar y recrear sin pérdida. |
| X. Dev/prod parity | Mismo nginx, mismos estáticos y mismo template en local y producción. |
| XI. Logs | Los logs van a stdout/stderr de nginx. Prohibido escribir archivos de log. |
| XII. Admin | Las tareas operativas se hacen con comandos del contenedor (`docker run ... nginx -t`, `docker compose logs`). |

---

## 3. Principios de diseño

- **SOLID**
  - *SRP*: un módulo = una responsabilidad (red / DOM / wiring).
  - *OCP*: extender comportamiento agregando funciones o módulos, no con `if`
    gigantes dentro de funciones existentes.
  - *LSP*: cualquier implementación de la API (real o fake) debe ser
    intercambiable en tests.
  - *ISP*: interfaces chicas; no exponer métodos que el consumidor no usa.
  - *DIP*: `app.js` recibe `api` por inyección, no la importa directamente.
- **KISS**: vanilla JS, sin framework, sin bundler, sin librerías de UI. Si una
  solución simple alcanza, se usa esa.
- **YAGNI**: no se agregan features, endpoints, estados ni dependencias que no
  estén pedidos. Nada de “por si acaso”.
- **DRY**: una sola fuente para rutas (`/api` en `api.js`), IDs de elementos
  (`ELEMENT_IDS` en `app.js`) y mensajes de error (`ui.js`).
- **Seguridad por defecto**: todo dato del backend se inserta con `textContent`,
  nunca con `innerHTML`.
- **Accesibilidad**: `aria-live`, `role`, labels y navegación por teclado se
  mantienen en cualquier cambio de UI.

---

## 4. TDD obligatorio — para CADA paso

**Regla de oro: no se escribe código de producción sin un test que falle antes.**

Ciclo obligatorio por cada unidad de trabajo:

1. **Red**: escribir el test que describe el comportamiento esperado y correr
   `npm test` para confirmar que falla por la razón correcta.
2. **Green**: escribir la implementación **mínima** para pasar el test.
3. **Refactor**: limpiar sin cambiar comportamiento, con los tests en verde.
4. **Commit atómico** por ciclo.

Checklist antes de dar un paso por terminado:

- [ ] El test se escribió **antes** que la implementación y se vio fallar.
- [ ] `npm test` pasa completo (sin tests skipped sin justificación).
- [ ] El cambio no rompe la dirección de dependencias de la sección 1.
- [ ] No se agregaron dependencias de runtime.
- [ ] Si se tocó nginx o Docker: `docker build` y `nginx -t` pasan.
- [ ] Si cambió el uso o la config, se actualizó `README.md`.
- [ ] El commit es atómico y describe el ciclo (`test:`, `feat:`, `fix:`, `refactor:`, `docs:`, `ci:`).

Prohibido:

- Implementar primero y “después vemos los tests”.
- Tests que solo verifiquen detalles de implementación en vez de comportamiento.
- Tests que dependan de red real, timers reales o del orden de ejecución.
- Bajar cobertura borrando o debilitando asserts.

### Herramientas de test

- **Vitest** para unit tests de `api.js`, `ui.js` y `app.js`.
- **jsdom** para DOM.
- `fetch`, timers y `confirm` se inyectan o se mockean siempre.
- **nginx**: test estructural del template en `tests/nginx.test.js` + validación
  real con `nginx -t` en CI.

Comandos:

```bash
npm test          # una corrida
npm run test:watch
```

---

## 5. Convenciones de código

- JavaScript moderno: ESM, `const`/`let`, `async/await`, sin `var`.
- Nombres de código en inglés; textos de interfaz en español.
- Una exportación por responsabilidad; funciones chicas y con nombre.
- Errores de red se modelan con `ApiError` (`status`, `detail`, `retryAfter`).
- No se usa `innerHTML` con datos dinámicos.
- Formato: 2 espacios, comillas dobles, punto y coma.

---

## 6. Definición de terminado (Definition of Done)

Un cambio está terminado solo si:

1. Tiene tests escritos antes y en verde.
2. Respeta 12-Factor y los principios de la sección 3.
3. La imagen Docker construye y `nginx -t` valida la config.
4. `README.md` sigue siendo correcto.
5. No hay TODOs ni código muerto.
6. CI en verde.
