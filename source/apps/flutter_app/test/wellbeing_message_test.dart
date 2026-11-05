import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/utils/wellbeing_message.dart';

void main() {
  final decision = <String, dynamic>{
    'status': 'CONFIRMED_CONFLICT',
    'allowed': false,
    'checked': [
      {'restriction': 'allergen:gluten', 'kind': 'allergen', 'key': 'gluten'},
    ],
    'items': [
      {
        'productId': 'veg_breakfast',
        'name': 'Vegetarian Breakfast',
        'quantity': 1,
        'status': 'CONFIRMED_CONFLICT',
        'facts': [
          {
            'restriction': 'allergen:gluten',
            'kind': 'allergen',
            'key': 'gluten',
            'status': 'CONFLICT',
            'ingredients': ['toast', 'granola'],
            'source': 'merchant-ingredients',
          },
        ],
        'conflicts': [],
        'missing': [],
      },
      {
        'productId': 'coffee',
        'name': 'Fresh Brewed Coffee',
        'quantity': 1,
        'status': 'UNKNOWN',
        'facts': [
          {
            'restriction': 'allergen:gluten',
            'kind': 'allergen',
            'key': 'gluten',
            'status': 'UNKNOWN',
            'ingredients': [],
            'source': null,
          },
        ],
        'conflicts': [],
        'missing': ['allergen:gluten'],
      },
    ],
    'alternatives': [
      {'productId': 'orange_juice', 'name': 'Fresh Orange Juice'},
    ],
    'productDataVersion': 'abcdef1234567890',
    'source': {
      'type': 'merchant-menu',
      'verified': false,
      'dataVersion': 'abcdef1234567890',
    },
    'crossContact': {'assessed': false, 'merchantData': false},
    'notice': 'Decisions are based on merchant-provided product information.',
  };

  test('Turkish copy is per-product, source-aware and never claims safety', () {
    final text = formatWellbeingDecision(decision, lang: 'tr');
    expect(text, contains('Kontrol edilen hassasiyetler: Gluten'));
    expect(text, contains('İşletme bilgisinde Gluten ile ilişkili "toast, granola" belirtilmiş.'));
    expect(text, contains('Gluten bilgisi eksik; uygunluğu doğrulayamıyoruz.'));
    expect(text, contains('Çapraz temas bilgisi mevcut değil.'));
    expect(text, contains('İşletmenin sağladığı menü bilgisine dayanır.'));
    expect(text, contains('Menü verisi sürümü: abcdef12'));
    expect(text, contains('Kesin bilgi için kafeye danışın.'));
    // No raw machine codes and no unverified safety verdicts.
    expect(text, isNot(contains('UNKNOWN')));
    expect(text, isNot(contains('Missing information')));
    expect(text, isNot(contains('allergen:gluten')));
    expect(text.toLowerCase(), isNot(contains('güvenlidir')));
    expect(text.toLowerCase(), isNot(contains('alerjen içermez')));
  });

  test('English copy keeps ingredients and cross-contact separate', () {
    final text = formatWellbeingDecision(decision, lang: 'en');
    expect(text, contains('Sensitivities you selected: Gluten'));
    expect(text, contains('The merchant information names Gluten: toast, granola.'));
    expect(text, contains('Gluten information is missing; we cannot verify suitability.'));
    expect(text, contains('Cross-contact information is not available.'));
    expect(text, contains('Other products with no known conflict: Fresh Orange Juice'));
    expect(text, isNot(contains('allergen:gluten')));
  });

  test('older backends without facts are rendered from conflicts/missing', () {
    final legacy = <String, dynamic>{
      'items': [
        {
          'name': 'Coffee',
          'quantity': 1,
          'status': 'UNKNOWN',
          'conflicts': [],
          'missing': ['allergen:peanut'],
        },
      ],
    };
    final text = formatWellbeingDecision(legacy, lang: 'tr');
    expect(text, contains('Yer fıstığı bilgisi eksik; uygunluğu doğrulayamıyoruz.'));
    expect(text, isNot(contains('Missing information')));
    expect(text, contains('Çapraz temas bilgisi mevcut değil.'));
  });
}
