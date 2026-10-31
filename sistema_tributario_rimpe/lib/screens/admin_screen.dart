import 'package:flutter/material.dart';
import '../services/api_client.dart';
import '../services/api_exception.dart';

class AdminScreen extends StatefulWidget {
  final ApiClient api;
  const AdminScreen({super.key, required this.api});
  @override
  State<AdminScreen> createState() => _AdminScreenState();
}

class _AdminScreenState extends State<AdminScreen> {
  List<dynamic> _users = [];
  bool _loading = true;
  bool _mail = false;
  String? _currentUserId;
  String? _error;
  @override
  void initState() { super.initState(); _load(); }
  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final status = await widget.api.get('/api/admin/status');
      final users = await widget.api.get('/api/admin/users');
      if (mounted) setState(() { _mail = status['mailConfigured'] == true; _currentUserId = status['currentUserId']; _users = users as List; });
    } catch (_) {
      if (mounted) setState(() => _error = 'No se pudo acceder al panel administrativo.');
    } finally { if (mounted) setState(() => _loading = false); }
  }
  Future<void> _toggle(dynamic user) async {
    final active = user['activo'] != true;
    final confirm = await showDialog<bool>(context: context, builder: (context) => AlertDialog(
      title: Text(active ? 'Activar cuenta' : 'Suspender cuenta'),
      content: Text('Se cambiará el acceso de ${user['nombre']} y se cerrarán sus sesiones.'),
      actions: [TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancelar')),
        TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Confirmar'))],
    ));
    if (confirm != true || !mounted) return;
    setState(() => _loading = true);
    try {
      await widget.api.post('/api/admin/users/${user['id']}/status', body: {'activo': active});
      await _load();
    } catch (_) { if (mounted) setState(() { _loading = false; _error = 'No se pudo cambiar el acceso.'; }); }
  }
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Administración'), actions: [IconButton(onPressed: _loading ? null : _load, icon: const Icon(Icons.refresh))]),
    body: _loading ? const Center(child: CircularProgressIndicator()) : ListView(padding: const EdgeInsets.all(20), children: [
      if (_error != null) Text(_error!, style: const TextStyle(color: Colors.red)),
      Text(_mail ? 'Correo configurado; la entrega debe verificarse con el proveedor.' : 'Correo pendiente: configura proveedor y remitente para recuperar contraseñas.'),
      const SizedBox(height: 16),
      const Text('Últimas 100 cuentas. Las actualizaciones de la aplicación se publican desde Vercel.'),
      ..._users.map((u) => Card(child: ListTile(
        title: Text(u['nombre'] as String), subtitle: Text('${u['ruc'] ?? 'Sin RUC'} · ${u['email']}\n'
          '${u['platformAdmin'] == true ? 'Administrador' : 'Usuario'} · ${u['activo'] == true ? 'Activo' : 'Suspendido'}'),
        trailing: u['id'] == _currentUserId ? const Text('Tu cuenta · Admin') : PopupMenuButton<String>(
          tooltip: 'Administrar cuenta',
          onSelected: (action) { if (action == 'role') { _changeRole(u); } else { _toggle(u); } },
          itemBuilder: (_) => [
            if (u['activo'] == true || u['platformAdmin'] == true)
              PopupMenuItem(value: 'role', child: Text(u['platformAdmin'] == true ? 'Retirar administrador' : 'Hacer administrador')),
            if (u['platformAdmin'] != true)
              PopupMenuItem(value: 'status', child: Text(u['activo'] == true ? 'Suspender' : 'Activar')),
          ],
        ),
      ))),
    ]),
  );

  Future<void> _changeRole(dynamic user) async {
    final grant = user['platformAdmin'] != true;
    final confirmed = await showDialog<bool>(context: context, builder: (context) => AlertDialog(
      title: Text(grant ? 'Dar acceso administrativo' : 'Retirar acceso administrativo'),
      content: Text('${user['nombre']} (${user['email']})\n\n'
        '${grant ? 'Podrá administrar cuentas y otorgar o retirar este rol a otras personas. Tu cuenta conservará su acceso.' : 'Dejará de tener acceso al panel administrativo.'}\n\nSus sesiones se cerrarán y deberá iniciar sesión otra vez.'),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancelar')),
        TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('Confirmar')),
      ],
    ));
    if (confirmed != true || !mounted) return;
    setState(() { _loading = true; _error = null; });
    try {
      await widget.api.post('/api/admin/users/${user['id']}/admin-role', body: {'platformAdmin': grant});
      await _load();
    } on ApiException catch (e) {
      if (mounted) setState(() { _loading = false; _error = e.mensaje; });
    } catch (_) {
      if (mounted) setState(() { _loading = false; _error = 'No se pudo cambiar el rol administrativo.'; });
    }
  }
}
