import 'package:flutter/material.dart';
import '../services/auth_service.dart';
import '../services/api_exception.dart';
import '../utils/app_theme.dart';

class LoginScreen extends StatefulWidget {
  final AuthService auth;
  const LoginScreen({super.key, required this.auth});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _correo = TextEditingController();
  final _password = TextEditingController();
  final _nombre = TextEditingController();
  bool _modoRegistro = false;
  bool _cargando = false;
  String? _error;

  @override
  void dispose() {
    _correo.dispose();
    _password.dispose();
    _nombre.dispose();
    super.dispose();
  }

  Future<void> _enviar() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _cargando = true;
      _error = null;
    });
    try {
      if (_modoRegistro) {
        await widget.auth.registrar(_correo.text.trim(), _password.text, _nombre.text.trim());
      } else {
        await widget.auth.login(_correo.text.trim(), _password.text);
      }
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.mensaje);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = 'No se pudo conectar con el servidor. Verifica que el backend esté corriendo.');
    } finally {
      if (mounted) setState(() => _cargando = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.background,
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: Form(
              key: _formKey,
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.calculate_rounded, size: 56, color: AppTheme.primary),
                  const SizedBox(height: 12),
                  const Text('Sistema Tributario RIMPE',
                      style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold), textAlign: TextAlign.center),
                  const SizedBox(height: 4),
                  Text(_modoRegistro ? 'Crea tu cuenta' : 'Inicia sesión para continuar',
                      style: TextStyle(color: Colors.grey.shade600)),
                  const SizedBox(height: 28),
                  if (_modoRegistro) ...[
                    TextFormField(
                      controller: _nombre,
                      decoration: const InputDecoration(labelText: 'Nombre completo'),
                      validator: (v) => (v == null || v.trim().isEmpty) ? 'Campo requerido' : null,
                    ),
                    const SizedBox(height: 12),
                  ],
                  TextFormField(
                    controller: _correo,
                    decoration: const InputDecoration(labelText: 'Correo electrónico'),
                    keyboardType: TextInputType.emailAddress,
                    validator: (v) => (v == null || !v.contains('@')) ? 'Correo inválido' : null,
                  ),
                  const SizedBox(height: 12),
                  TextFormField(
                    controller: _password,
                    decoration: const InputDecoration(labelText: 'Contraseña'),
                    obscureText: true,
                    validator: (v) => (v == null || v.isEmpty)
                        ? 'Campo requerido'
                        : (_modoRegistro && v.length < 12) ? 'Mínimo 12 caracteres' : null,
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 12),
                    Text(_error!, style: TextStyle(color: AppTheme.danger), textAlign: TextAlign.center),
                  ],
                  const SizedBox(height: 20),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: _cargando ? null : _enviar,
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: 4),
                        child: _cargando
                            ? const SizedBox(
                                width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                            : Text(_modoRegistro ? 'Crear cuenta' : 'Ingresar'),
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextButton(
                    onPressed: _cargando ? null : () => setState(() => _modoRegistro = !_modoRegistro),
                    child: Text(_modoRegistro
                        ? '¿Ya tienes cuenta? Inicia sesión'
                        : '¿No tienes cuenta? Regístrate'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
