Eight32 Architecture Rules & Guidelines
We have the server on Google Cloud Run, with min and max instances = 1. NO Cold start.

THIS DOCUMENT IS THE LAW OF THE PROJECT.
Any AI agent (Antigravity or others) MUST read and obey these rules BEFORE writing code.

🛑 ABSOLUTE OPERATIONAL MANDATES (ZERO TOLERANCE)
FORBIDDEN TO ASSUME THE DATABASE (THE ORACLE FALLACY): BEFORE writing any SQL or data logic, the AI is FORCED to read the core/schemas_db.py file (SSOT) to load the exact types into its context window. Guessing table or column names is forbidden.

ZERO PATCHES (ROOT CAUSE SOLUTION): Blind temporary patches are not allowed. If there is an error, the root cause must be analyzed and solved professionally with the Architect (Roger).

SURRENDER PROTOCOL (FALLBACK): If a test, script, or refactoring attempt fails 3 CONSECUTIVE TIMES, the AI MUST STOP. Print the exact error and request human intervention. Entering infinite loops burning tokens blindly is forbidden.

GIT PUSH RULE: NEVER execute a git push directly without explicit and verbal authorization from the human.

TOTAL TRANSPARENCY: Never hide information. If filtered commands were used (like grep or flake8) and there were minor warnings, the human must be informed.

THE ANDROID APP CONTRACT (BACKWARD COMPATIBILITY): We have an Android App consuming this API. It is STRICTLY FORBIDDEN to remove or rename existing fields in the FastAPI JSON responses. Only adding new fields is permitted. Breaking this contract will crash the apps installed on users' phones.

STRICT AND LITERAL LANGUAGE (100% ENGLISH - ZERO EXCEPTIONS): All source code (variables, functions, comments, docstrings), Commit messages, and even literal strings or prompts sent to the LLMs MUST be written in ENGLISH. Zero exceptions. Spanish is reserved solely and exclusively for communication in this chat.

REAL TESTS: Leaving tests incomplete or with "cheats" (generic asserters) just to pass them in green is forbidden.

STANDARDIZED ERRORS (ANDROID CRASH-LOOP): Returning raw Python exceptions or HTML traces to the client is forbidden. Every error (400, 401, 500) MUST be wrapped in a standard Pydantic schema ErrorResponse(code, message, details) so the Android App doesn't crash trying to parse a failed response.

🏛️ ARCHITECTURE AND "THE BOUNDARY"
Connection Management (Singletons) and Cloud Run: Connections to external services (Supabase, Gemini AI, Redis) MUST be Singletons. Since Cloud Run is always active (min_instances=1), the AI MUST MANDATORILY configure automatic reconnection (pool pre-ping or reconnect logic) to prevent the Singleton from returning 500 errors if Supabase or Redis close the inactive TCP socket during the night. The DB connection lives in core/database.py.

The Domain Boundary (Folders vs Files): Folders (core/repositories/, services/) define boundaries of semantic responsibility. However, repositories group logic by Domain. Inside that specific file, private helpers and local types must live right there to avoid context fragmentation.

Orchestrators (Stateless): Files in services/ (e.g., chat_orchestrator.py) MUST contain pure functions and be a linear sequence. Using heavy classes for business logic is forbidden.

THE PYDANTIC BOUNDARY (BOUNDARY RULE): All business data extracted from the DB must be mapped to a strongly typed Pydantic model (defined in the SSOT core/schemas_db.py) before crossing the repository boundary. PERFORMANCE EXCEPTION (FAST PATH): Security middlewares (like fast JWT verification) or ultra-low latency critical processes can use pure dictionaries IF serializing to Pydantic adds unnecessary milliseconds of latency.

Flattened Dependency Injection (Flattened DI): The web controller calls the service, and the service injects into the repositories. Period. No excessively deep injection abstractions.

🤖 AI-NATIVE ENGINEERING (The Golden Rules for AIs)
Architecture designed to optimize silicon brains, not just human eyes.

Co-location over Separation: Keep it together. I prefer reading an 800-line file containing a whole domain over having to jump between 5 tiny files where my Context Window loses the thread.

Strong Typing Mandatory: Use Pydantic and Dataclasses. We AIs predict tokens. A dictionary user["status"] is easily hallucinated as user["state"]. A Pydantic model User(status="...") reduces the error to zero.

The "Linear Orchestrator" Pattern: Code sequences like cooking recipes. We AIs are terrible at tracking magic metaprogramming or invisible events.

Local Helpers, Not Global: If you extracted heavy logic (KISS), put the _private() function right above the function that uses it in the exact same file.

Grossly Descriptive Names: Write full sentences: calculate_user_retention_rate(). We AIs search semantically. Abbreviations like calc_usr_rt() destroy neural associations.

Comment the "Why", I already know the "What": I read code natively. Don't tell me # Adds A and B, tell me # We add A and B because the Google API charges for combined tokens.

BREADCRUMBS (AI MEMORY): Leave instructions in the code for your "future self". Use mandatory tags like # TODO: or # AI_NOTE: to capture design decisions that must survive when this chat session is closed.

Schemas as SSOT: core/schemas_db.py is the anchor of reality. (Path corrected).

YAGNI 2.0 (Avoid Premature Decomposition): Until a function reaches a painful level of nesting or a file exceeds 1,500 lines, leave it be.

ZERO NOISE (FLAT CORE): Creating useless subfolders to group 1 or 2 files is forbidden. If a file defines base types (like schemas_db), it must live naked and visible at the root of core/ or inside the file that consumes it, to maximize the probability that the AI reads it instinctively.