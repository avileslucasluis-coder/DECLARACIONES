import 'package:flutter/foundation.dart';
import 'api_client.dart';
import 'session_storage.dart';

enum EstadoSesion { cargando, autenticado, noAutenticado }

/// Estado global de sesión. RootApp escucha esto para decidir si muestra
/// LoginScreen o RootShell. El ApiClient llama a [cerrarSesionLocal]
/// automáticamente cuando un refresh token deja de servir, así la UI
/// reacciona sola sin que cada pantalla tenga que manejarlo.
class AuthService extends ChangeNotifier {
  final SessionStorage _session = SessionStorage();
  late final ApiClient api;

  EstadoSesion estado = EstadoSesion.cargando;
  String? email;
  bool _disposed = false;

  @override
  void notifyListeners() {
    if (!_disposed) super.notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    api.close();
    super.dispose();
  }

  AuthService() {
    api = ApiClient(_session, onSesionInvalida: cerrarSesionLocal);
    _cargarSesionExistente();
  }

  Future<void> _cargarSesionExistente() async {
    final token = await _session.accessToken;
    estado = token != null ? EstadoSesion.autenticado : EstadoSesion.noAutenticado;
    notifyListeners();
  }

  Future<void> login(String correo, String password) async {
    final data = await api.post('/api/auth/login', body: {'email': correo, 'password': password});
    await _session.guardar(accessToken: data['accessToken'], refreshToken: data['refreshToken']);
    email = correo;
    estado = EstadoSesion.autenticado;
    notifyListeners();
  }

  Future<void> registrar(String correo, String password, String nombre) async {
    final data = await api.post(
      '/api/auth/register',
      body: {'email': correo, 'password': password, 'nombre': nombre},
    );
    await _session.guardar(accessToken: data['accessToken'], refreshToken: data['refreshToken']);
    email = correo;
    estado = EstadoSesion.autenticado;
    notifyListeners();
  }

  Future<void> logout() async {
    final refreshToken = await _session.refreshToken;
    if (refreshToken != null) {
      try {
        await api.post('/api/auth/logout', body: {'refreshToken': refreshToken});
      } catch (_) {
        // si el backend no responde igual cerramos la sesión localmente
      }
    }
    await cerrarSesionLocal();
  }

  Future<void> cerrarSesionLocal() async {
    await _session.limpiar();
    email = null;
    estado = EstadoSesion.noAutenticado;
    notifyListeners();
  }
}
