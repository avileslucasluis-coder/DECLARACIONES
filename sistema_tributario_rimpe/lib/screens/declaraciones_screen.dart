import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';
import '../models/company.dart';
import '../models/tax_declaration.dart';
import '../services/company_service.dart';
import '../services/declaration_api_service.dart';
import '../services/ats_api_service.dart';
import '../services/api_exception.dart';
import '../utils/app_theme.dart';

class DeclaracionesScreen extends StatefulWidget {
  final CompanyService companies;
  final DeclarationApiService declarations;
  final AtsApiService ats;
  const DeclaracionesScreen({super.key, required this.companies, required this.declarations, required this.ats});

  @override
  State<DeclaracionesScreen> createState() => _DeclaracionesScreenState();
}

class _DeclaracionesScreenState extends State<DeclaracionesScreen> {
  List<Company> _empresas = [];
  Company? _seleccionada;
  int _mes = DateTime.now().month;
  int _anio = DateTime.now().year;

  TaxDeclarationResult? _resultado;
  bool _cargandoEmpresas = true;
  bool _generando = false;
  bool _procesandoAts = false;
  bool _presentando = false;
  bool _presentadaLocal = false;
  bool get _ocupado => _generando || _procesandoAts || _presentando;
  String? _error;
  AtsValidacion? _validacionAts;

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
        _cargandoEmpresas = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.mensaje;
        _cargandoEmpresas = false;
      });
    }
  }

  Future<void> _generar() async {
    if (_seleccionada == null) return;
    setState(() {
      _generando = true;
      _presentadaLocal = false;
      _error = null;
    });
    try {
      final r = await widget.declarations.generar(companyId: _seleccionada!.id, mes: _mes, anio: _anio);
      if (!mounted) return;
      setState(() => _resultado = r);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.mensaje);
    } finally {
      if (mounted) setState(() => _generando = false);
    }
  }

  Future<void> _marcarPresentada() async {
    if (_seleccionada == null || _ocupado) return;
    setState(() { _presentando = true; _error = null; });
    try {
      await widget.declarations.presentar(companyId: _seleccionada!.id, mes: _mes, anio: _anio);
      if (!mounted) return;
      setState(() => _presentadaLocal = true);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.mensaje);
    } finally {
      if (mounted) setState(() => _presentando = false);
    }
  }

  Future<void> _validarAts() async {
    if (_seleccionada == null) return;
    setState(() {
      _procesandoAts = true;
      _error = null;
    });
    try {
      final v = await widget.ats.validar(companyId: _seleccionada!.id, mes: _mes, anio: _anio);
      if (!mounted) return;
      setState(() => _validacionAts = v);
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.mensaje);
    } finally {
      if (mounted) setState(() => _procesandoAts = false);
    }
  }

  Future<void> _generarYDescargarAts() async {
    if (_seleccionada == null) return;
    setState(() {
      _procesandoAts = true;
      _error = null;
    });
    try {
      final validacion = await widget.ats.validar(companyId: _seleccionada!.id, mes: _mes, anio: _anio);
      if (!mounted) return;
      setState(() => _validacionAts = validacion);
      if (validacion.errores.isNotEmpty) throw ApiException(400, 'Corrige los errores indicados antes de descargar el borrador ATS.');
      final xml = await widget.ats.generar(companyId: _seleccionada!.id, mes: _mes, anio: _anio);
      final bytes = Uint8List.fromList(utf8.encode(xml));
      await Share.shareXFiles(
        [XFile.fromData(bytes, name: 'ats_${_seleccionada!.ruc}_${_mes}_$_anio.xml', mimeType: 'text/xml')],
        subject: 'ATS $_mes/$_anio — ${_seleccionada!.razonSocial}',
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.mensaje);
    } finally {
      if (mounted) setState(() => _procesandoAts = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_cargandoEmpresas) return const Scaffold(body: Center(child: CircularProgressIndicator()));

    return Scaffold(
      appBar: AppBar(title: const Text('Declaraciones y ATS')),
      body: _empresas.isEmpty
          ? Center(child: Text('Registra una empresa primero.', style: TextStyle(color: Colors.grey.shade600)))
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        DropdownButtonFormField<Company>(
                          value: _seleccionada,
                          decoration: const InputDecoration(labelText: 'Empresa'),
                          items: _empresas.map((c) => DropdownMenuItem(value: c, child: Text(c.razonSocial))).toList(),
                          onChanged: _ocupado ? null : (v) => setState(() {
                            _seleccionada = v;
                            _resultado = null;
                            _validacionAts = null;
                          }),
                        ),
                        const SizedBox(height: 12),
                        Row(
                          children: [
                            Expanded(
                              child: DropdownButtonFormField<int>(
                                value: _mes,
                                decoration: const InputDecoration(labelText: 'Mes'),
                                items: List.generate(12, (i) => i + 1)
                                    .map((m) => DropdownMenuItem(value: m, child: Text(_nombreMes(m))))
                                    .toList(),
                                onChanged: _ocupado ? null : (v) => setState(() {
                                  _mes = v!;
                                  _resultado = null;
                                  _validacionAts = null;
                                }),
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: DropdownButtonFormField<int>(
                                value: _anio,
                                decoration: const InputDecoration(labelText: 'Año'),
                                items: List.generate(5, (i) => DateTime.now().year - i)
                                    .map((a) => DropdownMenuItem(value: a, child: Text('$a')))
                                    .toList(),
                                onChanged: _ocupado ? null : (v) => setState(() {
                                  _anio = v!;
                                  _resultado = null;
                                  _validacionAts = null;
                                }),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 16),
                        ElevatedButton.icon(
                          onPressed: _ocupado ? null : _generar,
                          icon: _generando
                              ? const SizedBox(
                                  width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                              : const Icon(Icons.calculate),
                          label: Text(_generando ? 'Calculando...' : 'Generar papel de trabajo mensual'),
                        ),
                      ],
                    ),
                  ),
                ),
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  Text(_error!, style: TextStyle(color: AppTheme.danger)),
                ],
                if (_resultado != null) ...[
                  const SizedBox(height: 20),
                  _TarjetaDeclaracion(resultado: _resultado!, presentadaLocal: _presentadaLocal,
                    onMarcarPresentada: _ocupado ? null : _marcarPresentada),
                ],
                const SizedBox(height: 24),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Anexo Transaccional Simplificado (ATS)',
                            style: TextStyle(fontWeight: FontWeight.bold, color: AppTheme.primary)),
                        const SizedBox(height: 12),
                        Wrap(
                          spacing: 12,
                          runSpacing: 8,
                          children: [
                            OutlinedButton.icon(
                              onPressed: _ocupado ? null : _validarAts,
                              icon: const Icon(Icons.fact_check_outlined),
                              label: const Text('Validar ATS'),
                            ),
                            ElevatedButton.icon(
                              onPressed: _ocupado ? null : _generarYDescargarAts,
                              icon: const Icon(Icons.download),
                              label: const Text('Descargar borrador XML'),
                            ),
                          ],
                        ),
                        if (_validacionAts != null) ...[
                          const SizedBox(height: 16),
                          if (_validacionAts!.errores.isEmpty && _validacionAts!.advertencias.isEmpty)
                            Text('Sin errores ni advertencias.', style: TextStyle(color: AppTheme.primary)),
                          ..._validacionAts!.errores.map((e) => _FilaValidacion(mensaje: e.mensaje, esError: true)),
                          ..._validacionAts!.advertencias.map((e) => _FilaValidacion(mensaje: e.mensaje, esError: false)),
                        ],
                      ],
                    ),
                  ),
                ),
              ],
            ),
    );
  }

  String _nombreMes(int m) {
    const nombres = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
    ];
    return nombres[m - 1];
  }
}

class _FilaValidacion extends StatelessWidget {
  final String mensaje;
  final bool esError;
  const _FilaValidacion({required this.mensaje, required this.esError});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(esError ? Icons.error : Icons.warning_amber, size: 18, color: esError ? AppTheme.danger : AppTheme.accent),
          const SizedBox(width: 8),
          Expanded(child: Text(mensaje, style: const TextStyle(fontSize: 13))),
        ],
      ),
    );
  }
}

class _TarjetaDeclaracion extends StatelessWidget {
  final TaxDeclarationResult resultado;
  final VoidCallback? onMarcarPresentada;
  final bool presentadaLocal;
  const _TarjetaDeclaracion({required this.resultado, required this.onMarcarPresentada, required this.presentadaLocal});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Wrap(
              spacing: 12,
              children: [
                const Text('Resumen del periodo', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
                Chip(
                  label: Text(presentadaLocal ? 'PRESENTACIÓN REGISTRADA LOCALMENTE' : resultado.estado),
                  backgroundColor: presentadaLocal ? AppTheme.primary.withValues(alpha: 0.15) : Colors.grey.shade200,
                ),
              ],
            ),
            const SizedBox(height: 12),
            ...resultado.advertencias.map((a) => Padding(padding: const EdgeInsets.only(bottom: 8), child: Text(a, style: const TextStyle(fontSize: 12)))),
            _tituloFormulario('Papel de trabajo para formulario 104 · IVA'),
            _fila('Ventas gravadas con IVA', resultado.totalVentasGravadas),
            _fila('Ventas tarifa 0%', resultado.totalVentas0),
            _fila('IVA cobrado en ventas (débito)', resultado.totalIvaVentas),
            const SizedBox(height: 8),
            _fila('Compras gravadas con IVA', resultado.totalComprasGravadas),
            _fila('Compras tarifa 0%', resultado.totalCompras0),
            _fila('IVA de compras (revisar derecho a crédito tributario)', resultado.totalIvaCompras),
            const SizedBox(height: 8),
            _fila('IVA que te retuvieron en ventas', resultado.totalIvaRetenidoEnVentas),
            const Divider(),
            _fila('IVA propio estimado', resultado.ivaAPagar104),
            _fila('IVA retenido a proveedores', resultado.totalRetencionesIvaAplicadas),
            _fila('Total estimado formulario 104', resultado.totalAPagar104, destacado: true),
            if (resultado.creditoTributarioSiguientePeriodo > 0)
              _fila('Crédito tributario a favor (siguiente periodo)', resultado.creditoTributarioSiguientePeriodo,
                  color: AppTheme.secondary),
            const SizedBox(height: 20),
            _tituloFormulario('Papel de trabajo para formulario 103 · Retenciones de renta'),
            _fila('Renta retenida a proveedores', resultado.totalRetencionesRentaAplicadas),
            const Divider(),
            _fila('Total estimado formulario 103', resultado.totalAPagar103, destacado: true, color: AppTheme.danger),
            if (resultado.rentaRetenidaEnVentasInformativo > 0) ...[
              const SizedBox(height: 20),
              _tituloFormulario('Informativo · Renta retenida en tus ventas'),
              _fila('Crédito para tu declaración anual', resultado.rentaRetenidaEnVentasInformativo),
            ],
            const SizedBox(height: 16),
            const Text('La declaración se presenta en SRI en Línea. Este botón solo registra que ya la presentaste; no realiza un envío al SRI.', style: TextStyle(fontSize: 12)),
            const SizedBox(height: 8),
            if (!presentadaLocal)
              ElevatedButton.icon(
                onPressed: onMarcarPresentada,
                icon: const Icon(Icons.check),
                label: const Text('Registrar presentación realizada en SRI'),
              ),
          ],
        ),
      ),
    );
  }

  Widget _tituloFormulario(String texto) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Text(texto, style: TextStyle(fontWeight: FontWeight.bold, color: AppTheme.primary, fontSize: 13)),
      );

  Widget _fila(String etiqueta, double valor, {bool destacado = false, Color? color}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Expanded(child: Text(etiqueta, style: TextStyle(fontWeight: destacado ? FontWeight.bold : FontWeight.normal))),
          Text(
            Formatters.currency.format(valor),
            style: TextStyle(
              fontWeight: FontWeight.bold,
              color: color ?? (destacado ? AppTheme.primary : Colors.black87),
              fontSize: destacado ? 16 : 14,
            ),
          ),
        ],
      ),
    );
  }
}
