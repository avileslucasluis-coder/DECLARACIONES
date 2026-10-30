import 'package:flutter/material.dart';
import '../services/api_client.dart';

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
  String? _error;
  @override
  void initState() { super.initState(); _load(); }
  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final status = await widget.api.get('/api/admin/status');
      final users = await widget.api.get('/api/admin/users');
      if (mounted) setState(() { _mail = status['mailConfigured'] == true; _users = users as List; });
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
        title: Text(u['nombre'] as String), subtitle: Text('${u['ruc'] ?? 'Sin RUC'} · ${u['email']}'),
        trailing: u['platformAdmin'] == true ? const Text('Administrador') : TextButton(
          onPressed: () => _toggle(u), child: Text(u['activo'] == true ? 'Suspender' : 'Activar')),
      ))),
    ]),
  );
}
