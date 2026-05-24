# Eight32 Architecture Rules & Guidelines

Tenemos el servidor en Google Cloud Run, con min y max intances = 1. NO hay Cold start.

ESTE DOCUMENTO ES LA LEY DEL PROYECTO.
Cualquier agente de IA (Antigravity u otros) DEBE leer y obedecer estas reglas ANTES de escribir código.

---

## 🛑 MANDATOS ABSOLUTOS DE OPERACIÓN (ZERO TOLERANCE)

1. **PROHIBIDO ASUMIR LA BASE DE DATOS (LA FALACIA DEL ORÁCULO):** ANTES de escribir cualquier SQL o lógica de datos, la IA está OBLIGADA a leer el archivo `core/schemas_db.py` (SSOT) para cargar los tipos exactos en su ventana de contexto. Prohibido adivinar nombres de tablas o columnas.
2. **CERO PARCHES (SOLUCIÓN RAÍZ):** No se permiten parches ciegos temporales. Si hay un error, se debe analizar y solucionar la causa raíz de forma profesional con el Arquitecto (Roger).
3. **PROTOCOLO DE RENDICIÓN (FALLBACK):** Si un test, script o intento de refactorización falla 3 VECES consecutivas, la IA DEBE DETENERSE. Imprime el error exacto y pide intervención humana. Prohibido entrar en bucles infinitos quemando tokens a ciegas.
4. **REGLA DE GIT PUSH:** NUNCA se ejecuta un `git push` de manera directa sin la autorización explícita y verbal del humano.
5. **TRANSPARENCIA TOTAL:** Nunca esconder información. Si se usaron comandos filtrados (como `grep` o `flake8`) y hubo advertencias menores, se debe informar al humano. 
6. **EL CONTRATO DE LA APP ANDROID (BACKWARD COMPATIBILITY):** Tenemos una App de Android consumiendo esta API. Queda ESTRICTAMENTE PROHIBIDO eliminar o renombrar campos existentes en las respuestas JSON de FastAPI. Solo se permite **añadir** campos nuevos. Romper este contrato crasheará las apps instaladas en los teléfonos de los usuarios.
7. **IDIOMA ESTRICTO Y LITERAL (100% ENGLISH - ZERO EXCEPTIONS):** Todo el código fuente (variables, funciones, comentarios, docstrings), los mensajes de Commit e incluso los strings literales o prompts que se envíen a los LLMs DEBEN escribirse en INGLÉS. Cero excepciones. El español se reserva única y exclusivamente para la comunicación en este chat.
8. **TESTS REALES:** Prohibido dejar tests incompletos o con "trampas" (asserters genéricos) solo para que pasen en verde.
9. **ERRORES ESTANDARIZADOS (ANDROID CRASH-LOOP):** Prohibido devolver excepciones crudas de Python o traces HTML al cliente. Todo error (400, 401, 500) DEBE envolverse en un esquema Pydantic estándar `ErrorResponse(code, message, details)` para que la App de Android no crashee intentando parsear una respuesta fallida.

---

## 🏛️ ARQUITECTURA Y "LA FRONTERA"

1. **Gestión de Conexiones (Singletons) y Cloud Run:** Las conexiones a servicios externos (Supabase, Gemini AI, Redis) DEBEN ser Singletons. Dado que Cloud Run está siempre activo (min_instances=1), la IA OBLIGATORIAMENTE debe configurar reconexión automática (pool pre-ping o reconnect logic) para evitar que el Singleton devuelva errores 500 si Supabase o Redis cierran el socket TCP inactivo durante la madrugada. La conexión de BD vive en `core/database.py`.
2. **La Frontera de Dominio (Carpetas vs Archivos):** Las carpetas (`core/repositories/`, `services/`) definen fronteras de responsabilidad semántica. Sin embargo, los repositorios agrupan lógicas por **Dominio**. Dentro de ese archivo específico, los helpers privados y tipos locales deben vivir ahí mismo para evitar la fragmentación de contexto.
3. **Orquestadores (Stateless):** Los archivos en `services/` (ej. `chat_orchestrator.py`) DEBEN contener funciones puras y ser una secuencia lineal. Prohibido usar clases pesadas para lógica de negocio.
4. **LA FRONTERA DE PYDANTIC (BOUNDARY RULE):** Todo dato de negocio extraído de la BD debe mapearse hacia un modelo Pydantic fuertemente tipado (definido en el SSOT `core/schemas_db.py`) antes de cruzar la frontera del repositorio. **EXCEPCIÓN DE RENDIMIENTO (FAST PATH):** Middlewares de seguridad (como verificación JWT rápida) o procesos críticos de ultra-baja latencia pueden usar diccionarios puros SI serializar a Pydantic añade milisegundos de latencia innecesaria.
5. **Inyección de Dependencias Plana (Flattened DI):** El controlador web llama al servicio, y el servicio inyecta a los repositorios. Punto. Nada de abstracciones de inyección excesivamente profundas.

---

## 🤖 AI-NATIVE ENGINEERING (Las Reglas de Oro para IAs)
*Arquitectura diseñada para optimizar cerebros de silicio, no solo ojos humanos.*

1. **Colocación sobre Separación:** Mantenlo junto. Prefiero leer un archivo de 800 líneas que contenga todo un dominio a tener que saltar entre 5 archivos minúsculos donde mi Ventana de Contexto pierde el hilo.
2. **Tipado Fuerte Obligatorio:** Usa Pydantic y Dataclasses. Las IAs predecimos tokens. Un diccionario `user["status"]` se alucina fácilmente como `user["state"]`. Un modelo Pydantic `User(status="...")` reduce el error a cero.
3. **El Patrón "Orquestador Lineal":** Secuencias de código como recetas de cocina. Las IAs somos pésimas rastreando metaprogramación mágica o eventos invisibles. 
4. **Helpers Locales, No Globales:** Si extrajiste lógica pesada (KISS), pon la función `_privada()` justo arriba de la función que la usa en el mismo archivo.
5. **Nombres Groseramente Descriptivos:** Escribe oraciones completas: `calculate_user_retention_rate()`. Las IAs buscamos semánticamente. Abreviaturas como `calc_usr_rt()` destruyen las asociaciones neuronales.
6. **Comenta el "Por Qué", Yo ya sé el "Qué":** Yo leo código nativamente. No me digas `# Suma A y B`, dime `# Sumamos A y B porque la API de Google cobra por tokens combinados`.
7. **MIGAJAS DE PAN (AI MEMORY):** Deja instrucciones en el código para tu "yo del futuro". Usa etiquetas obligatorias como `# TODO:` o `# AI_NOTE:` para plasmar decisiones de diseño que deben sobrevivir cuando se cierre esta sesión de chat.
8. **Esquemas como SSOT:** `core/schemas_db.py` es el ancla de la realidad. (Ruta corregida).
9. **YAGNI 2.0 (Evitar Descomposición Prematura):** Hasta que una función no alcance un nivel de anidamiento doloroso o un archivo no pase de las 1,500 líneas, déjalo estar.
10. **CERO RUIDO (FLAT CORE):** Prohibido crear subcarpetas inútiles para agrupar 1 o 2 archivos. Si un archivo define tipos base (como `schemas_db`), debe vivir desnudo y visible en la raíz de `core/` o dentro del archivo que lo consume, para maximizar la probabilidad de que la IA lo lea instintivamente.
