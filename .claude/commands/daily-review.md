# Daily Jira Ticket Review - Revisión Interactiva

Ejecuta una revisión interactiva de mis tickets en Jira, completando los campos faltantes uno por uno.

## Requisitos

### MCP de Atlassian
Este comando requiere el MCP server de Atlassian. Para instalarlo:

1. Ejecutar en Claude Code:
```
/mcp
```

2. Seleccionar "Add MCP Server" → "Atlassian (Jira & Confluence)"

3. Autenticarse con tu cuenta de Atlassian cuando se solicite

4. Verificar que funciona ejecutando este comando: `/daily-review`

### Permisos necesarios en Jira
- Lectura y escritura de issues
- Agregar comentarios
- Registrar tiempo (worklog)
- Transicionar issues

### Si el MCP no está instalado
El comando fallará al intentar conectarse con Jira. Verás errores indicando que las herramientas `mcp__atlassian__*` no están disponibles. Sigue los pasos de instalación arriba para configurarlo.

---

## Modo Inteligente

El comando sugiere valores automáticamente:
- **Descripciones**: Genera propuesta detallada basada en el título de la subtarea
- **Distribución de horas**: Sugiere cómo repartir las horas faltantes entre tickets activos
- **Comentarios**: Pre-llena la plantilla con información del ticket

Solo necesitas confirmar o ajustar las sugerencias.

---

## Meta diaria: 8 horas

## Configuración del usuario
- **Horario laboral**: 8:00 AM - 5:00 PM (9 horas, 1 hora de almuerzo)
- **Zona horaria**: America/Guatemala

## Proceso

### 0. Confirmar fecha de registro
**IMPORTANTE**: Antes de iniciar, preguntar al usuario:
"¿Para qué fecha deseas registrar el tiempo?"

**Opciones:**
1. **Hoy** - Usar la fecha actual del sistema
2. **Ayer** - Usar la fecha de ayer (útil para registros pendientes)
3. **Otra fecha** - Especificar fecha manualmente (formato: YYYY-MM-DD)

**Guardar la fecha seleccionada** para usarla en todos los worklogs de esta sesión.

### 1. Verificar horas del día
Antes de revisar tickets, consultar el tiempo ya registrado en la **fecha seleccionada**:
- Buscar worklogs del usuario en esa fecha
- Mostrar: "Horas registradas [fecha]: X/8h (faltan Yh)"

### 2. Buscar y mostrar todos mis tickets
Usa JQL para obtener todos los tickets asignados a mi usuario que estén "In Progress" o "To Do".

**Mostrar tabla resumen de TODOS los tickets encontrados:**

| # | Ticket | Título | Estado | Estimado | Registrado | % | Campos faltantes |
|---|--------|--------|--------|----------|------------|---|------------------|
| 1 | XXX-123 | Título del ticket | In Progress | 8h | 2h | 25% | Descripción, Due Date |
| 2 | XXX-456 | Otro ticket | To Do | 4h | 0h | 0% | Start Date, Story Points |
| ... | ... | ... | ... | ... | ... | ... | ... |

**Indicadores visuales en la tabla:**
- ⚠️ Tickets sin descripción
- 🔴 Tickets con más del 100% del tiempo estimado consumido
- 🟡 Tickets entre 75-100% del tiempo
- 🟢 Tickets con menos del 75%

### 3. Selección de tickets a trabajar

**Preguntar al usuario usando AskUserQuestion:**
"¿Qué tickets deseas revisar hoy?"

**Opciones:**
1. **Todos** - Revisar todos los tickets en orden
2. **Seleccionar específicos** - Ingresar números separados por coma (ej: 1, 3, 5)
3. **Solo con campos faltantes** - Revisar solo tickets que tienen campos incompletos
4. **Solo para registrar tiempo** - Modo rápido: solo registrar horas sin revisar campos
5. **Cancelar** - Salir del daily review

### 4. Modo de revisión

**Si eligió "Seleccionar específicos":**
- Preguntar: "Ingresa los números de los tickets a revisar (ej: 1, 3, 5):"
- Proceder con la revisión detallada solo de esos tickets

**Si eligió "Todos":**
Proceder con la revisión detallada de cada ticket.

**Si eligió "Solo con campos faltantes":**
Filtrar y revisar solo los tickets que tienen campos incompletos.

**Si eligió "Solo para registrar tiempo" (Modo Rápido):**
- Mostrar tabla con los tickets y el tiempo sugerido para cada uno
- Preguntar: "¿Distribuir X horas entre estos tickets? (Sí / Ajustar distribución)"
- Permitir ajustar las horas por ticket antes de confirmar
- Registrar el tiempo en batch y mostrar resumen

### 5. Revisar cada ticket seleccionado

Para cada ticket en la selección:

   a. **Mostrar información actual del ticket**: Key, título, estado actual

   b. **Verificar y completar cada campo**:

#### 5.1 Start Date
- Si NO tiene: Preguntarme cuál es la fecha de inicio y actualizarla en Jira
- Si tiene: Mostrar ✅ y continuar

#### 5.2 Due Date
- Si NO tiene: Preguntarme cuál es la fecha de vencimiento y actualizarla en Jira
- Si tiene: Mostrar ✅ y continuar

#### 5.3 Story Points
- Si NO tiene: Preguntarme cuántos story points asignar y actualizarlo en Jira
- Si tiene: Mostrar ✅ y continuar

#### 5.4 Descripción
- Si está VACÍA o es heredada del padre:
  - **Sugerir automáticamente** una descripción basada en:
    - Título de la subtarea
    - Contexto del proyecto/padre
    - Tipo de tarea (desarrollo, QA, documentación, etc.)
  - Mostrar: "Sugerencia: [descripción propuesta]"
  - Preguntar: "¿Usar esta descripción? (Sí / Modificar / Escribir otra)"
- Si TIENE descripción válida y específica: Mostrar ✅ y continuar

**Detección de descripción heredada:**
- Obtener descripción del ticket padre
- Si es igual o muy similar: Tratarla como vacía y sugerir una nueva

#### 5.5 Comentario del día (en la subtarea)
**IMPORTANTE**: El comentario de avance SIEMPRE debe registrarse en la misma subtarea donde se registrará el tiempo (worklog). Esto mantiene la trazabilidad del trabajo realizado.

- Buscar comentarios de los últimos 2 días hábiles en esta subtarea
- Si NO hay comentario reciente o no sigue la plantilla:

**Pre-llenado automático:**
- 🔹 Fecha: Fecha de hoy (automático)
- 🔹 Proyecto: Extraer del ticket (automático)
- 🔹 Subtarea asignada: Título del ticket (automático)
- 🔹 Estado actual: Inferir del estado en Jira (In Progress → "En progreso")

**Solo preguntar:**
- 📌 "¿Qué avanzaste hoy en este ticket?" (campo obligatorio)
- 🔗 "¿Enlaces relevantes?" (opcional, Enter para omitir)

Plantilla generada:
```
1️⃣ Avances del día
📌 Descripción detallada de lo realizado:
[Respuesta del usuario]

🔗 Enlaces relevantes:
[Si proporcionó enlaces, sino omitir sección]

Campo,Valor / Descripción
🔹 Fecha: [AUTO]
🔹 Proyecto: [AUTO]
🔹 Subtarea asignada: [AUTO]
🔹 Estado actual: [AUTO]
```

- Mostrar preview del comentario antes de crear
- Crear el comentario en Jira con la información

- Si tiene comentario válido: Mostrar ✅ y continuar

#### 5.6 Registro de Tiempo (Worklog)
**IMPORTANTE**: El worklog se registra en la MISMA subtarea donde se agregó el comentario de avance.
Esto asegura que el tiempo y los avances queden vinculados en el mismo ticket.

- Mostrar: "Horas registradas [fecha seleccionada]: X/8h (faltan Yh)"

**Limitaciones del MCP de Atlassian:**
> ⚠️ El MCP actual NO permite especificar fecha/hora del worklog. Los worklogs se crean con la fecha/hora actual del sistema.
> Si necesitas registrar tiempo en una fecha diferente, deberás editarlo manualmente en Jira después de crearlo.
> Tampoco es posible editar o eliminar worklogs vía MCP.

**Distribución inteligente de horas:**
- Calcular tickets restantes por revisar
- Sugerir distribución equitativa de horas faltantes
- Ejemplo: "Faltan 4h, quedan 2 tickets → Sugerencia: 2h para este ticket"
- Ajustar sugerencia según:
  - Story points del ticket (más puntos = más horas sugeridas)
  - Tipo de tarea
  - Si hubo comentario de avance significativo

- Preguntar: "Sugerencia: Xh ¿Registrar? (Sí / Ajustar / Omitir)"
- Si registra tiempo: usar `addWorklogToJiraIssue` y actualizar el contador
- Mostrar nuevo total: "Horas registradas: X/8h"

#### 5.7 Transición de Estado
- Obtener las transiciones disponibles con `getTransitionsForJiraIssue`
- Mostrar estado actual y preguntar: "¿Deseas cambiar el estado del ticket?"
- Opciones:
  - **Mantener estado actual**: Continuar
  - **[Mostrar transiciones disponibles]**: Ejecutar la transición seleccionada con `transitionJiraIssue`
- Mostrar confirmación del nuevo estado

#### 5.8 Siguiente ticket
- Preguntar: "¿Continuar con el siguiente ticket? (Sí / Saltar al resumen / Cancelar)"
- Si "Sí": Pasar al siguiente ticket de la selección
- Si "Saltar al resumen": Ir directamente al paso 6
- Si "Cancelar": Terminar revisión y mostrar resumen parcial

### 6. Resumen Final

Mostrar resumen completo con:

**Horas del día:**
```
📊 Horas del día: X/8h [████████░░] XX%
```
- Con indicador visual de progreso
- Si cumplió la meta: ✅
- Si faltan horas: "⚠️ Faltan Xh para completar las 8 horas diarias"

**Tickets revisados:**
| Ticket | Acciones realizadas |
|--------|---------------------|
| XXX-123 | ✅ Tiempo: 2h, ✅ Comentario, ✅ Transición → Done |
| XXX-456 | ✅ Tiempo: 1h, ⏭️ Saltado |
| XXX-789 | ⏭️ No seleccionado |

**Resumen numérico:**
- Tickets revisados: X/Y
- Tickets actualizados: X
- Tiempo registrado en esta sesión: Xh
- Tickets transicionados: X

---

## Comportamiento General

- **Mostrar todos los tickets primero** antes de iniciar la revisión
- **Permitir selección** de qué tickets revisar
- **Procesar UN ticket a la vez** de los seleccionados
- Esperar mi respuesta antes de actualizar cada campo
- Usar las herramientas de Jira para hacer las actualizaciones directamente
- **Permitir saltar al resumen** en cualquier momento
- No continuar al siguiente ticket hasta completar el actual o explícitamente saltarlo
