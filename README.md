# Sistema Tributario Dayanex / RIMPE

Requisitos: Node.js 22, Flutter y Docker Desktop con el motor Linux activo.

En Windows, abre **INICIAR.cmd**. El primer inicio prepara PostgreSQL, aplica
las migraciones existentes, carga los roles, compila la app web y arranca la API.
Luego abre **http://localhost:3000**, selecciona **Regístrate** y crea tu empresa.

También puedes ejecutarlo desde PowerShell:

```powershell
.\iniciar.ps1
```

En los siguientes inicios, si no cambiaste código, usa `INICIAR.cmd -SinCompilar`.
Si la API ya está activa, el inicio muestra su dirección sin arrancar otra copia.
Detén la API anterior antes de iniciar una compilación después de cambiar código.
Mantén abierta la consola del servidor; Ctrl+C detiene la API. PostgreSQL conserva
sus datos en el volumen de Docker. El script conserva el archivo `backend/.env`
si ya existe; si usas una base externa, prepárala por separado en vez de levantar
el servicio `db` de Docker.

La API y la web comparten dirección, por lo que la app puede conectarse sin
configurar CORS. Documentación: **http://localhost:3000/docs**.
Estado de API y base de datos: **http://localhost:3000/api/health**.
Resultados de las pruebas realizadas: [VERIFICACION.md](VERIFICACION.md).

Para desarrollar la interfaz por separado:

```powershell
cd sistema_tributario_rimpe
flutter run -d chrome --web-port 8080 --dart-define=API_BASE_URL=http://localhost:3000
```

Comprobaciones:

```powershell
cd backend
npm run build
npm test -- --runInBand
cd ..\sistema_tributario_rimpe
flutter analyze --no-fatal-infos
flutter test
```

Las pruebas XSD requieren `xmllint` o Python con `lxml` (`python -m pip install lxml`).
Los archivos ATS siguen siendo borradores con las limitaciones documentadas en
`backend/SRI.md`. La sección **SRI · Pruebas** permite firmar XML con un certificado
PKCS12 y gestionar recepción/autorización en el ambiente de pruebas. La firma
se verifica localmente; la aceptación oficial requiere el certificado real del
emisor y una prueba completa. No se habilitó producción. Consulta el alcance y
las limitaciones en [backend/SRI.md](backend/SRI.md).
