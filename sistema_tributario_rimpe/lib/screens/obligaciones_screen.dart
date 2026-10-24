import 'package:flutter/material.dart';
import '../models/company.dart';
import '../models/obligacion.dart';
import '../services/company_service.dart';
import '../services/tax_obligations_service.dart';
import '../services/api_exception.dart';
import '../utils/app_theme.dart';

class ObligacionesScreen extends StatefulWidget {
  final CompanyService companies;
  final TaxObligationsService obligations;
  const ObligacionesScreen({super.key, required this.companies, required this.obligations});

  @override
  State<ObligacionesScreen> createState() => _ObligacionesScreenState();
}

class _ObligacionesScreenState extends State<ObligacionesScreen> {
  List<Company> _empresas = [];
  Company? _seleccionada;
  int _mes = DateTime.now().month;
  int _anio = DateTime.now().year;
  List<ObligacionApi> _obligaciones = [];
  bool _cargando = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _cargarEmpresas();
  }

  Future<void> _cargarEmpresas() async {
    try {
      final lista = await widget.companies.listar();
      if (!mounted) return;
      setState(() {
        _empresas = lista;
        _seleccionada = lista.isNotEmpty ? lista.first : null;
      });
      if (_seleccionada != null) await _evaluar();
      if (!mounted) return;
      setState(() => _cargando = false);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.mensaje;
        _cargando = false;
      });
    }
  }

  Future<void> _evaluar() async {
    if (_seleccionada == null) return;
    setState(() {
      _cargando = true;
      _error = null;
    });
    try {
      final lista = await widget.obligations.evaluar(companyId: _seleccionada!.id, mes: _mes, anio: _anio);
      if (!mounted) return;
      setState(() {
        _obligaciones = lista;
        _cargando = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.mensaje;
        _cargando = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Mis obligaciones tributarias')),
      body: _empresas.isEmpty && !_cargando
          ? Center(child: Text('Registra una empresa primero.', style: TextStyle(color: Colors.grey.shade600)))
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Text(
                  'El sistema evalúa el régimen y los datos registrados de la empresa — nunca asume '
                  'que todas las empresas deben presentar los mismos formularios.',
                  style: TextStyle(color: Colors.grey.shade600),
                ),
                const SizedBox(height: 16),
                if (_empresas.isNotEmpty)
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Row(
                        children: [
                          Expanded(
                            flex: 2,
                            child: DropdownButtonFormField<Company>(
                              value: _seleccionada,
                              decoration: const InputDecoration(labelText: 'Empresa'),
                              items: _empresas.map((c) => DropdownMenuItem(value: c, child: Text(c.razonSocial))).toList(),
                              onChanged: (v) {
                                setState(() => _seleccionada = v);
                                _evaluar();
                              },
                            ),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: DropdownButtonFormField<int>(
                              value: _mes,
                              decoration: const InputDecoration(labelText: 'Mes'),
                              items: List.generate(12, (i) => i + 1)
                                  .map((m) => DropdownMenuItem(value: m, child: Text('$m')))
                                  .toList(),
                              onChanged: (v) {
                                setState(() => _mes = v!);
                                _evaluar();
                              },
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                const SizedBox(height: 16),
                if (_cargando) const Center(child: CircularProgressIndicator()),
                if (_error != null) Text(_error!, style: TextStyle(color: AppTheme.danger)),
                if (!_cargando && _error == null)
                  ..._obligaciones.map((o) => _TarjetaObligacion(obligacion: o)),
              ],
            ),
    );
  }
}

class _TarjetaObligacion extends StatelessWidget {
  final ObligacionApi obligacion;
  const _TarjetaObligacion({required this.obligacion});

  Color get _color {
    switch (obligacion.estado) {
      case 'OBLIGATORIO':
        return AppTheme.primary;
      case 'VENCIDO':
        return AppTheme.danger;
      case 'PENDIENTE_INFORMACION':
        return AppTheme.accent;
      default:
        return Colors.grey;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Text(obligacion.icono, style: const TextStyle(fontSize: 18)),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(obligacion.nombre, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15)),
                ),
                Chip(
                  label: Text(obligacion.estado.replaceAll('_', ' ')),
                  backgroundColor: _color.withOpacity(0.12),
                  labelStyle: TextStyle(color: _color, fontSize: 11, fontWeight: FontWeight.bold),
                  visualDensity: VisualDensity.compact,
                ),
              ],
            ),
            const SizedBox(height: 8),
            if (obligacion.formulario != null)
              Text('Formulario: ${obligacion.formulario} · ${obligacion.periodicidad.replaceAll('_', ' ')}',
                  style: TextStyle(fontSize: 12, color: Colors.grey.shade700)),
            const SizedBox(height: 6),
            Text(obligacion.motivo, style: const TextStyle(fontSize: 13)),
            if (obligacion.fechaVencimiento != null) ...[
              const SizedBox(height: 6),
              Text('Vence: ${Formatters.date.format(obligacion.fechaVencimiento!)}',
                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: _color)),
            ],
            const SizedBox(height: 4),
            Text(obligacion.baseLegal, style: TextStyle(fontSize: 11, color: Colors.grey.shade500, fontStyle: FontStyle.italic)),
          ],
        ),
      ),
    );
  }
}
