# Backend — Sistema Tributario Dayanex

NestJS + Prisma + PostgreSQL, con autenticación y permisos por empresa.

Para iniciar la aplicación completa en Windows usa `../INICIAR.cmd`.
La guía de arranque está en [README principal](../README.md).

El alcance actualizado, las fuentes oficiales y los pendientes del SRI están
centralizados en [SRI.md](SRI.md). La firma ya está implementada y verificada
localmente; producción y la aceptación con certificado real siguen pendientes.

## Verificación

```powershell
npm ci
npx prisma generate
npm run build
npm test -- --runInBand
```

Las pruebas usan un certificado sintético y respuestas SOAP simuladas. Requieren
Python con lxml para contrastar la firma con un canonicalizador independiente.
Las pruebas ATS admiten xmllint o Python con lxml.

Con la base y la API iniciadas: `npm run test:smoke`. Crea una cuenta temporal,
prueba autenticación, importación, declaraciones, ATS, firma y persistencia;
elimina exclusivamente sus datos sintéticos y no envía documentos al SRI.

## Base de datos

```powershell
docker compose up -d --wait db
npm run db:deploy
npm run seed
npm run start:dev
```

Conserva `.env` y los volúmenes de PostgreSQL. No ejecutes reset ni borres datos
para aplicar una actualización. Las migraciones se aplican con `db:deploy`.

## API

Documentación interactiva: http://localhost:3000/docs.
Salud de API/base: http://localhost:3000/api/health.

| Área | Rutas principales |
|---|---|
| Sesión | `/api/auth/{register,login,refresh,logout}` |
| Empresas | `/api/companies` |
| Importación | `/api/vouchers/import`, `/api/vouchers` |
| Obligaciones | `/api/tax/obligations` |
| Papeles de trabajo | `/api/declarations/{generar,presentar}` |
| Borrador ATS | `/api/ats/{validate,generate,history}` |
| Firma y SRI pruebas | `/api/sri/prepare`, `/api/sri/documents` |
| Envío y autorización | `/api/sri/documents/:id/{send,authorization}` |
| Auditoría | `/api/audit` |

Las rutas de negocio exigen sesión, empresa y permiso. El módulo SRI usa
`sri.operar`; no acepta endpoints externos proporcionados por el cliente.
