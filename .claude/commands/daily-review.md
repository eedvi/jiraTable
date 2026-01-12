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

## Proceso

1. **Verificar horas del día**: Antes de revisar tickets, consultar el tiempo ya registrado hoy:
   - Buscar worklogs del usuario en la fecha actual
   - Mostrar: "Horas registradas hoy: X/8h (faltan Yh)"

2. **Buscar mis tickets**: Usa JQL para obtener todos los tickets asignados a mi usuario que estén "In Progress" o "To Do"

3. **Revisar cada ticket individualmente**: Para cada ticket encontrado:

   a. **Mostrar información actual del ticket**: Key, título, estado actual

   b. **Verificar y completar cada campo**:

### 3.1 Start Date
- Si NO tiene: Preguntarme cuál es la fecha de inicio y actualizarla en Jira
- Si tiene: Mostrar ✅ y continuar

### 3.2 Due Date
- Si NO tiene: Preguntarme cuál es la fecha de vencimiento y actualizarla en Jira
- Si tiene: Mostrar ✅ y continuar

### 3.3 Story Points
- Si NO tiene: Preguntarme cuántos story points asignar y actualizarlo en Jira
- Si tiene: Mostrar ✅ y continuar

### 3.4 Descripción
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

### 3.5 Comentario del día
- Buscar comentarios de los últimos 2 días hábiles
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

### 3.6 Registro de Tiempo (Worklog)
- Mostrar: "Horas registradas hoy: X/8h (faltan Yh)"

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

### 3.7 Transición de Estado
- Obtener las transiciones disponibles con `getTransitionsForJiraIssue`
- Mostrar estado actual y preguntar: "¿Deseas cambiar el estado del ticket?"
- Opciones:
  - **Mantener estado actual**: Continuar
  - **[Mostrar transiciones disponibles]**: Ejecutar la transición seleccionada con `transitionJiraIssue`
- Mostrar confirmación del nuevo estado

4. **Pasar al siguiente ticket** después de completar todos los campos del actual

5. **Al finalizar**: Mostrar resumen con:
   - **Horas del día: X/8h** (con indicador si cumplió la meta o cuánto falta)
   - Tickets revisados
   - Tickets actualizados (campos completados)
   - Tiempo registrado en esta sesión
   - Tickets transicionados
   - Si faltan horas: "⚠️ Faltan Xh para completar las 8 horas diarias"

## Comportamiento
- Procesar UN ticket a la vez
- Esperar mi respuesta antes de actualizar cada campo
- Usar las herramientas de Jira para hacer las actualizaciones directamente
- No continuar al siguiente ticket hasta completar el actual
