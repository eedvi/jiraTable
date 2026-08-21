# Ticket Context — Índice Ticket↔Codebase

Gestiona la asociación entre tickets de Jira y archivos del codebase para mantener contexto durante las sesiones de trabajo.

## Argumento: $ARGUMENTS

Si no se proporciona argumento, ejecutar modo **sync** por defecto.

---

## Archivo de índice

El índice se almacena en `.claude/ticket-index.json` con esta estructura:

```json
{
  "$schema": "ticket-index",
  "version": "1.0",
  "project": "jiraTable",
  "basePath": ".",
  "tickets": {
    "TICKET-KEY": {
      "summary": "Título del ticket",
      "status": "In Progress",
      "paths": ["ruta/archivo.ts", "ruta/carpeta/"],
      "notes": "Contexto adicional sobre el trabajo",
      "lastUpdated": "YYYY-MM-DD"
    }
  },
  "pathIndex": {
    "ruta/archivo.ts": ["TICKET-KEY-1", "TICKET-KEY-2"]
  }
}
```

---

## Modos de operación

### Modo: `sync` (default — sin argumentos o `$ARGUMENTS` = "sync")

Sincroniza tickets abiertos de Jira con el índice local y descubre asociaciones en el codebase.

#### Proceso:

**Paso 1: Obtener tickets abiertos**
- Usar `mcp__plugin_atlassian_atlassian__searchJiraIssuesUsingJql` con JQL:
  `assignee = currentUser() AND status IN ("In Progress", "To Do") ORDER BY updated DESC`
- Usar el cloudId del sitio: `tribal-mnc.atlassian.net`
- Campos: `summary, status, description, updated, customfield_10016`

**Paso 2: Leer el índice actual**
- Leer `.claude/ticket-index.json`
- Identificar tickets nuevos (en Jira pero no en el índice)
- Identificar tickets obsoletos (en el índice pero cerrados/no encontrados en Jira)

**Paso 3: Auto-descubrir asociaciones para tickets nuevos**
Para cada ticket nuevo sin asociaciones, buscar en el codebase:

1. **Git branches**: Ejecutar `git branch --list "*TICKET-KEY*"` para ver si hay una rama con el ticket key
2. **Git commits recientes**: Ejecutar `git log --oneline --all --grep="TICKET-KEY" -5` para encontrar commits que referencien el ticket
3. **Comentarios en código**: Usar Grep para buscar el ticket key en el codebase (`TICKET-KEY`, `JIRA: TICKET-KEY`, `TODO: TICKET-KEY`)
4. **Archivos modificados**: Si hay commits con el ticket key, extraer los archivos modificados con `git diff-tree --no-commit-id --name-only -r <commit-hash>`

**Paso 4: Mostrar tabla resumen**
Mostrar todos los tickets con sus asociaciones (existentes + descubiertas):

```
| # | Ticket    | Título                    | Estado      | Archivos asociados           | Fuente       |
|---|-----------|---------------------------|-------------|------------------------------|--------------|
| 1 | PROJ-123  | Agregar filtro labels     | In Progress | src/components/KanbanBoard.tsx | índice      |
| 2 | PROJ-456  | Fix worklog timezone      | To Do       | server/index.ts              | git (commit) |
| 3 | PROJ-789  | Nueva vista resumen       | In Progress | (sin asociar)                | —            |
```

**Indicadores de fuente:**
- `índice` — Ya existía en ticket-index.json
- `git (branch)` — Descubierto en nombre de rama
- `git (commit)` — Descubierto en mensaje de commit
- `código` — Encontrado como referencia en el código fuente
- `—` — Sin asociaciones encontradas

**Paso 5: Preguntar al usuario**
Usar AskUserQuestion:
"¿Qué deseas hacer con las asociaciones?"

Opciones:
1. **Guardar todo** — Guardar todas las asociaciones descubiertas + existentes
2. **Revisar una por una** — Confirmar cada asociación descubierta individualmente
3. **Solo actualizar estados** — Solo actualizar el status de tickets ya existentes sin agregar nuevos
4. **Asociar manualmente** — Abrir modo interactivo para asociar archivos a tickets específicos

Si elige "Revisar una por una": Para cada ticket nuevo o con nuevas asociaciones, preguntar:
- Mostrar ticket + asociaciones descubiertas
- "¿Guardar estas asociaciones para TICKET-KEY? (Sí / Modificar rutas / Omitir)"
- Si "Modificar rutas": Pedir al usuario las rutas correctas

Si elige "Asociar manualmente": Para cada ticket sin asociar, preguntar:
- "¿Qué archivos están relacionados con TICKET-KEY (título)?"
- Sugerir archivos del proyecto con Glob y permitir selección

**Paso 6: Guardar índice**
- Actualizar `.claude/ticket-index.json` con las asociaciones confirmadas
- Actualizar el `pathIndex` (mapeo inverso) automáticamente
- Establecer `lastUpdated` a la fecha de hoy

**Paso 7: Guardar en memoria**
- Usar `mcp__plugin_claude-mem_mcp-search__search` para buscar contexto previo del proyecto
- Almacenar un resumen de la sincronización en la sesión actual para referencia

---

### Modo: `context` (`$ARGUMENTS` empieza con "context")

Extraer el ticket key del argumento (ej: `context PROJ-123`).

#### Proceso:

**Paso 1: Buscar en el índice**
- Leer `.claude/ticket-index.json`
- Buscar el ticket key en `tickets`

**Paso 2: Obtener detalles del ticket**
- Usar `mcp__plugin_atlassian_atlassian__getJiraIssue` para obtener detalles completos
- Incluir: descripción, estado, prioridad, story points, comentarios recientes

**Paso 3: Leer archivos asociados**
- Si el ticket tiene `paths` en el índice, leer cada archivo con la herramienta Read
- Si un path es un directorio (termina en `/`), listar su contenido y leer los archivos principales

**Paso 4: Buscar contexto en memoria**
- Usar `mcp__plugin_claude-mem_mcp-search__search` con query del ticket key
- Si hay observaciones previas, obtener el contexto con `get_observations`

**Paso 5: Presentar contexto unificado**
Mostrar un resumen estructurado:

```
## 🎫 PROJ-123 — Agregar filtro por labels en Kanban
**Estado:** In Progress | **Puntos:** 5 | **Prioridad:** Medium

### Descripción
[Descripción del ticket de Jira]

### Archivos asociados
1. `src/components/KanbanBoard.tsx` (226 líneas)
   - Componente principal del tablero Kanban
   - Renderiza columnas por estado con cards de issues

2. `src/types.ts` (45 líneas)
   - Interfaces TypeScript del proyecto
   - Contiene JiraIssue, IssueDetail

### Comentarios recientes
[Últimos 3 comentarios del ticket]

### Contexto de sesiones anteriores
[Notas de claude-mem si existen]

### Notas del índice
[Campo notes del ticket-index.json]
```

**Paso 6: Guardar contexto de sesión**
- Registrar en la sesión actual que se está trabajando en este ticket
- Esto permite que durante la sesión, si el usuario pide cambios, se sepa qué ticket se está trabajando

---

### Modo: `link` (`$ARGUMENTS` empieza con "link")

Extraer ticket key y rutas del argumento (ej: `link PROJ-123 src/App.tsx server/index.ts`).

#### Proceso:

**Paso 1: Validar argumentos**
- Extraer el ticket key (primer argumento después de "link")
- Extraer las rutas (argumentos restantes, separados por espacios)
- Validar que las rutas existen en el codebase usando Glob

**Paso 2: Obtener info del ticket (si es nuevo)**
- Si el ticket no existe en el índice, obtener su summary y status vía MCP
- Si el MCP no está disponible, pedir el summary al usuario

**Paso 3: Actualizar índice**
- Leer `.claude/ticket-index.json`
- Si el ticket ya existe: agregar las nuevas rutas a `paths` (sin duplicar)
- Si es nuevo: crear entrada completa
- Actualizar `pathIndex` con el mapeo inverso
- Guardar el archivo

**Paso 4: Confirmar**
Mostrar:
```
✅ Asociación actualizada:
PROJ-123 — "Título del ticket"
  + src/App.tsx (nuevo)
  + server/index.ts (nuevo)
  = src/components/KanbanBoard.tsx (existente)
```

---

### Modo: `clean` (`$ARGUMENTS` = "clean")

Limpia tickets cerrados del índice.

#### Proceso:

**Paso 1: Leer índice actual**
- Leer `.claude/ticket-index.json`
- Obtener todos los ticket keys

**Paso 2: Verificar estado de cada ticket**
- Para cada ticket, usar `mcp__plugin_atlassian_atlassian__getJiraIssue` para obtener el estado actual
- Clasificar en: activos (In Progress, To Do, etc.) y cerrados (Done, Closed, Cancelled)

**Paso 3: Mostrar tickets a limpiar**
```
Tickets cerrados encontrados en el índice:
| Ticket    | Título              | Estado | Archivos    |
|-----------|---------------------|--------|-------------|
| PROJ-101  | Fix bug login       | Done   | 2 archivos  |
| PROJ-202  | Update docs         | Closed | 1 archivo   |

Tickets activos (se mantienen): 5
```

**Paso 4: Confirmar limpieza**
- Preguntar: "¿Eliminar estos X tickets cerrados del índice? (Sí / No / Seleccionar)"
- Si "Seleccionar": Permitir elegir cuáles eliminar

**Paso 5: Actualizar índice**
- Remover tickets confirmados de `tickets`
- Recalcular `pathIndex` completo
- Guardar `.claude/ticket-index.json`

---

## Notas importantes

- **Siempre leer** el archivo `.claude/ticket-index.json` antes de modificarlo
- **Siempre recalcular** el `pathIndex` después de cualquier cambio en `tickets`
- **cloudId** para MCP de Atlassian: usar `tribal-mnc.atlassian.net`
- Las rutas en el índice son **relativas** al root del proyecto
- Al buscar en git, usar el directorio del proyecto: `C:\Users\Tribal\Documents\projects\github\jiraTable`
- Los archivos se leen usando la herramienta Read con rutas absolutas (prefijo: `C:\Users\Tribal\Documents\projects\github\jiraTable\`)
