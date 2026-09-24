# Compras AG – Licitaciones de materia prima y Torre de Compras

Herramienta interna de Grupo AG (inspirada en SAP Ariba Sourcing, pero sencilla) para:

1. **Licitar**: Compras crea el evento (encabezado, SKUs con medidas, documentos, proveedores) y lo publica. Cada proveedor recibe un correo con un **enlace único** (sin contraseña) y el **Excel pre-llenado**.
2. **Ofertar**: el proveedor cotiza en el portal (ES/EN, cálculos en vivo idénticos al Excel) o descarga el Excel, lo llena y lo sube. Sube T&C firmados, anexo logístico y protocolo del molino. Puede declinar.
3. **Comparar**: al cierre (ofertas **selladas** opcional), comparativo SKU × proveedor por plazo (contado / 35 / 60 / 90 / 120 días BL), mejor precio, incumplimientos, cobertura, promedio ponderado y contenedores. Exporta a Excel.
4. **Negociar**: rondas adicionales solo con proveedores seleccionados; ven su oferta anterior para mejorarla.
5. **Evaluar (Matriz de evaluación)**: réplica del *Cuadro comparativo – Comité*: precio en planta, precio transformado (crédito, costo de capital, reclamos), spread vs SBB, lead time/ETA y puntaje VEC + VTF con la Nomenclatura FRM-0DL20100-13. Pesos y parámetros editables.
6. **Torre de Compras**: sesión que agrupa varias negociaciones (Largos + Planos), RESUMEN por familia, **escenarios de split** lado a lado (todo a A, todo a B, split por TM, descuento negociado) con precio ponderado y ahorro vs base, **propuesta automática** con reglas (máx. % por proveedor/país, mínimo TM, contenedores), pendientes/acuerdos, histórico de precios y acta imprimible.
7. **Adjudicar**: el escenario aprobado genera la adjudicación por SKU; se aprueba, se notifica a ganadores y no ganadores y se exporta el Excel anexo al contrato.

Toda acción queda en la **bitácora de auditoría**; los correos, en la bitácora de correos.

## Instalación en servidor interno (Docker)

```bash
cp .env.example .env        # editar AUTH_SECRET, APP_URL, SMTP_*, MAIL_FROM
docker compose up -d --build
docker compose run --rm app npm run db:seed   # primera vez
```

- App: `http://servidor:3000` (poner detrás del proxy/HTTPS de TI; `APP_URL` debe ser la URL pública que verán los proveedores, y `COOKIE_SECURE=true` con HTTPS).
- Usuarios iniciales: `admin@grupoag.local`, `compras@grupoag.local`, `torre@grupoag.local` con clave `SEED_PASSWORD` (por defecto `cambiar123` — **cambiarla**, desde *Configuración*).
- El servicio `worker` cierra licitaciones vencidas y envía recordatorios (`REMINDER_HOURS`, por defecto 48 h y 4 h antes).
- Correo de pruebas: `docker compose --profile dev up -d mailpit` y `SMTP_HOST=mailpit`, bandeja en `:8025`.
- Respaldos: volúmenes `pgdata` (base de datos) y `uploads` (adjuntos).

## Versión de prueba en Vercel + Supabase

Para una demo en la nube (sin servidor propio). En Vercel no hay worker ni disco: los adjuntos se guardan en PostgreSQL (máx. ~4 MB por archivo, límite de Vercel), las licitaciones vencidas se cierran al abrir cualquier pantalla y los recordatorios salen una vez al día (Vercel Cron del plan gratuito). Sin `SMTP_HOST` los correos solo quedan en la bitácora; los enlaces del portal se copian con **Obtener enlace**.

1. **Supabase** → *New project* (región cercana, ej. `us-east-1`). En *Connect → ORMs → Prisma* copie:
   - `DATABASE_URL`: *Transaction pooler* (puerto **6543**) terminando en `?pgbouncer=true&connection_limit=1`.
   - `DIRECT_URL`: *Session pooler* (puerto **5432**).
2. **GitHub**: fusione el PR en `main` (Vercel publica la rama `main` como producción).
3. **Vercel** → *Add New → Project* → importe `hello-innovarise/compras` (Framework: Next.js; `vercel.json` ya define el build: migraciones + datos iniciales + build).
4. En *Environment Variables* agregue:

   | Variable | Valor |
   |---|---|
   | `DATABASE_URL` | URL de Supabase puerto 6543 con `?pgbouncer=true&connection_limit=1` |
   | `DIRECT_URL` | URL de Supabase puerto 5432 |
   | `AUTH_SECRET` | texto aleatorio largo (`openssl rand -hex 32`) |
   | `CRON_SECRET` | otro texto aleatorio |
   | `SEED_PASSWORD` | clave inicial de los usuarios demo |
   | `STORAGE_DRIVER` | `db` |
   | `COOKIE_SECURE` | `true` |
   | `MAIL_FROM` | `Compras Grupo AG <compras@grupoag.com>` |

   Si conectó Supabase con la integración de Vercel (*Storage → Supabase*), no hace falta crear `DATABASE_URL`/`DIRECT_URL`: el build usa `POSTGRES_PRISMA_URL` y `POSTGRES_URL_NON_POOLING`.

5. *Deploy*. Al terminar, entre a `https://<proyecto>.vercel.app` con `compras@grupoag.local` y la clave de `SEED_PASSWORD`.
6. En *Settings → Functions* elija la región más cercana a Supabase.

Para desactivar la demo basta con pausar el proyecto en Vercel; los datos quedan en Supabase.

## Desarrollo

Requisitos: Node 22, PostgreSQL 16.

```bash
npm install
cp .env.example .env    # DATABASE_URL y DIRECT_URL
npx prisma migrate dev
npm run db:seed
npm run dev            # http://localhost:3000
npm run worker         # tareas programadas (opcional en desarrollo)
```

Pruebas:

```bash
npm run lint && npm run typecheck && npm test   # unitarias (fórmulas vs los Excel reales)
./scripts/e2e-local.sh                          # E2E completo en una base desechable (Playwright)
```

Las pruebas que leen los Excel reales (`tests/fixtures/offer-perfiles.xlsx`, `cuadro-comite.xlsx`) se omiten si los archivos no están; no se versionan porque contienen precios de proveedores.

## Estructura

| Ruta | Contenido |
|---|---|
| `prisma/schema.prisma` | Modelo de datos (eventos, SKUs, invitaciones, ofertas, rondas, adjudicación, matriz, Torre, N.E.P) |
| `src/lib/pricing.ts` | Fórmulas del formato de cotización (CIF, precio por plazo, totales, ponderado, contenedores) |
| `src/lib/evaluation.ts` | Fórmulas de la Matriz de evaluación y Nomenclatura |
| `src/lib/allocation.ts` | Propuesta automática de split, métricas y reglas de escenarios |
| `src/lib/excel/` | Generar/leer el Excel de oferta (mismo layout actual) y reportes |
| `src/lib/events.ts` | Publicar, rondas, cierre, recordatorios, comparativo |
| `src/lib/torre.ts` | Matriz desde licitación, candidatos por SKU, RESUMEN |
| `src/app/(internal)/` | Pantallas de Compras y Torre |
| `src/app/portal/[token]/` | Portal del proveedor |
| `src/worker/cron.ts` | Worker de cierre y recordatorios |

## Plantillas

Cada categoría de materia prima tiene una plantilla configurable (*Plantillas*): columnas de medidas (Compras), técnicas, cumplimiento OK/NO y términos (proveedor), componentes del precio base (ej. FOB + Flete + Seguro = CIF), plazos de financiamiento, TM por contenedor y documentos requeridos. Vienen precargadas *Aceros largos – Perfiles* (idéntica al Excel actual) y *Aceros planos – Bobinas*. Una plantilla usada por licitaciones publicadas es de solo lectura; se duplica para crear una nueva versión.

## Evaluación de proveedores (N.E.P)

*Proveedores → Importar evaluación N.E.P* acepta la hoja N.E.P actual (CODIGO, PROVEEDOR, S1/S2 bajo cada año) o un formato plano (CODIGO | AÑO | SEMESTRE | NOTA). El promedio alimenta "Evaluación proveedor" en la matriz; los reclamos y penalizaciones abiertos sugieren sus escalas.

## Reglas heredadas del Excel a revisar

La matriz reproduce el Excel del comité tal cual y muestra un aviso sobre estas reglas, que conviene que Compras confirme:

- **Términos de entrega**: si el puntaje supera el tope de 5 %, el Excel asigna 8 % (configurable en *Valor si supera tope*).
- **Precio objetivo**: usa factor días = crédito ref. − 90 (45+30+15), mientras las ofertas usan tránsito + fondeo + EM (45+7+9 = 61).
- Los totales VEC/VTF del encabezado del Excel no incluyen penalizaciones y reclamos; la app sí los incluye (como las filas de ofertas).

## Microsoft 365

El login (`src/lib/auth.ts`) y el correo (`src/lib/mail.ts`) están aislados para poder migrar a Entra ID (OIDC) y al SMTP de Office 365 sin tocar las pantallas.
