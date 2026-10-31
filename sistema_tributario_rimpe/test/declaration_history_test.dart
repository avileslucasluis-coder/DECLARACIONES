import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sistema_tributario_rimpe/screens/declaraciones_screen.dart';
import 'package:sistema_tributario_rimpe/services/api_client.dart';
import 'package:sistema_tributario_rimpe/services/session_storage.dart';
import 'package:sistema_tributario_rimpe/services/company_service.dart';
import 'package:sistema_tributario_rimpe/services/declaration_api_service.dart';
import 'package:sistema_tributario_rimpe/services/ats_api_service.dart';

void main() {
  for (final semestral in [false, true]) {
  testWidgets('consulta historial ${semestral ? 'semestral' : 'mensual'} sin regenerar la declaración', (tester) async {
    SharedPreferences.setMockInitialValues({});
    final requests = <http.Request>[];
    final api = ApiClient(SessionStorage(), onSesionInvalida: () {},
      httpClient: MockClient((request) async {
        requests.add(request);
        return http.Response(jsonEncode(request.url.path == '/api/companies'
          ? [{'id': 'company', 'ruc': '1790012345001', 'razonSocial': 'Empresa', 'regimen': 'GENERAL'}]
          : [{'version': 1, 'action': 'GENERAR_BORRADOR', 'createdAt': '2026-10-30T12:00:00Z',
              'snapshot': {'estado': 'BORRADOR', 'totalIvaVentas': '15.00'}}]), 200);
      }));
    addTearDown(api.close);
    await tester.pumpWidget(MaterialApp(home: DeclaracionesScreen(
      companies: CompanyService(api), declarations: DeclarationApiService(api), ats: AtsApiService(api))));
    await tester.pumpAndSettle();
    if (semestral) {
      await tester.tap(find.text('Mensual'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Semestral').last);
      await tester.pumpAndSettle();
    }
    await tester.tap(find.text('Ver historial del período'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Versión 1'), findsOneWidget);
    await tester.tap(find.textContaining('Versión 1'));
    await tester.pumpAndSettle();
    expect(find.text('15.00'), findsOneWidget);
    expect(requests.every((r) => r.method == 'GET'), isTrue);
    expect(requests.last.url.queryParameters['companyId'], 'company');
    expect(requests.last.url.queryParameters['periodicidad'], semestral ? 'SEMESTRAL' : 'MENSUAL');
    if (semestral) expect(['6', '12'], contains(requests.last.url.queryParameters['mes']));
  });
  }
}
