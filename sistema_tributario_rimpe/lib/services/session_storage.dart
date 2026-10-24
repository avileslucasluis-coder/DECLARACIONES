import 'package:shared_preferences/shared_preferences.dart';
import 'package:flutter/foundation.dart';

/// En web conserva tokens solo en memoria: recargar cierra la sesión.
/// Elimina las credenciales persistidas por versiones web anteriores.
/// La variante móvil aún requiere almacenamiento seguro antes de distribuirla.
class SessionStorage {
  String? _access;
  String? _refresh;
  Future<void>? _legacyCleanup;
  static const _kAccessToken = 'session_access_token';
  static const _kRefreshToken = 'session_refresh_token';

  Future<void> guardar({required String accessToken, required String refreshToken}) async {
    if (kIsWeb) {
      await limpiar();
      _access = accessToken;
      _refresh = refreshToken;
      return;
    }
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_kAccessToken, accessToken);
    await prefs.setString(_kRefreshToken, refreshToken);
  }

  Future<String?> get accessToken async {
    if (!kIsWeb) return (await SharedPreferences.getInstance()).getString(_kAccessToken);
    await (_legacyCleanup ??= _removeLegacy());
    return _access;
  }

  Future<String?> get refreshToken async =>
      kIsWeb ? _refresh : (await SharedPreferences.getInstance()).getString(_kRefreshToken);

  Future<void> limpiar() async {
    _access = null;
    _refresh = null;
    await _removeLegacy();
  }

  Future<void> _removeLegacy() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_kAccessToken);
    await prefs.remove(_kRefreshToken);
  }
}
