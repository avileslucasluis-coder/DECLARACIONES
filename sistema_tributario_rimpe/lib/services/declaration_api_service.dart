import '../models/tax_declaration.dart';
import 'api_client.dart';

class DeclarationApiService {
  final ApiClient api;
  DeclarationApiService(this.api);

  Future<TaxDeclarationResult> generar({required String companyId, required int mes, required int anio}) async {
    final data = await api.post('/api/declarations/generar', body: {
      'companyId': companyId,
      'mes': mes,
      'anio': anio,
    });
    return TaxDeclarationResult.fromJson(data);
  }

  Future<void> presentar({required String companyId, required int mes, required int anio}) async {
    await api.post('/api/declarations/presentar', body: {
      'companyId': companyId,
      'mes': mes,
      'anio': anio,
    });
  }
}
