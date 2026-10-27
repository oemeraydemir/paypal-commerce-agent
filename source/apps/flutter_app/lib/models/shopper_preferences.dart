/// A shopper's local preference profile.
///
/// Two groups of preferences are kept, and they behave differently:
///
/// - **[dietary]** / **[maxBudgetMinor]** are **shared with the server** on
///   every `POST /api/ai/chat` request (the backend uses them to guide cart
///   planning). [toJson] is deliberately kept server-shaped so these are what
///   get transmitted.
/// - **[allergens]** are **local only**. The current backend API has no allergen
///   field: the catalog schema does not emit `contains` / `may_contain` /
///   `unknown` data and the chat endpoint rejects unknown preference keys. So
///   allergen preferences are never sent to the server and are never used to
///   filter anything server-side. They exist so the client can show honest,
///   explicit "allergy information is unverified" messaging.
class ShopperPreferences {
  static const dietaryOptions = <String, String>{
    'vegetarian': 'Vegetarian',
    'vegan': 'Vegan',
    'gluten-free': 'Gluten-free',
  };

  /// Turkish display labels for [dietaryOptions] (keys stay canonical).
  static const dietaryOptionsTr = <String, String>{
    'vegetarian': 'Vejetaryen',
    'vegan': 'Vegan',
    'gluten-free': 'Glutensiz',
  };

  /// Returns the localized display label for a dietary key (defaults to English).
  static String dietaryLabel(String lang, String key) {
    if (lang == 'tr') return dietaryOptionsTr[key] ?? dietaryOptions[key] ?? key;
    return dietaryOptions[key] ?? key;
  }

  /// Allergen concerns the shopper can note locally. Kept as a plain set so a
  /// shopper can list several. These do NOT claim a product contains or lacks
  /// any allergen; they only mark what the shopper cares about.
  static const allergenOptions = <String, String>{
    'peanut': 'Peanut',
    'tree-nut': 'Tree nuts',
    'dairy': 'Dairy / milk',
    'egg': 'Egg',
    'soy': 'Soy',
    'shellfish': 'Shellfish',
    'gluten': 'Gluten',
  };

  /// Turkish display labels for [allergenOptions] (keys stay canonical).
  static const allergenOptionsTr = <String, String>{
    'peanut': 'Yer fıstığı',
    'tree-nut': 'Fındık / ceviz',
    'dairy': 'Süt / süt ürünü',
    'egg': 'Yumurta',
    'soy': 'Soya',
    'shellfish': 'Kabuklu deniz ürünü',
    'gluten': 'Gluten',
  };

  /// Returns the localized display label for an allergen key (defaults to English).
  static String allergenLabel(String lang, String key) {
    if (lang == 'tr') return allergenOptionsTr[key] ?? allergenOptions[key] ?? key;
    return allergenOptions[key] ?? key;
  }

  final Set<String> dietary;
  final Set<String> allergens;
  final int? maxBudgetMinor;

  const ShopperPreferences({
    this.dietary = const {},
    this.allergens = const {},
    this.maxBudgetMinor,
  });

  static const empty = ShopperPreferences();

  /// Server-shaped representation sent in `POST /api/ai/chat` body. It must
  /// contain ONLY fields the backend schema accepts (`dietary`,
  /// `maxBudgetMinor`). Allergens are intentionally excluded — the backend
  /// rejects unknown preference keys.
  Map<String, dynamic> toJson() => {
    'dietary': dietary.toList()..sort(),
    if (maxBudgetMinor != null) 'maxBudgetMinor': maxBudgetMinor,
  };

  /// Local, persisted representation. Includes allergen preferences so they
  /// survive app restarts on this device.
  Map<String, dynamic> toPersistedJson() => {
    'dietary': dietary.toList()..sort(),
    'allergens': allergens.toList()..sort(),
    if (maxBudgetMinor != null) 'maxBudgetMinor': maxBudgetMinor,
  };

  factory ShopperPreferences.fromJson(Map<String, dynamic> json) {
    final budget = json['maxBudgetMinor'];
    if (budget != null && (budget is! int || budget < 100 || budget > 10000)) {
      throw const FormatException('Saved shopper budget is invalid.');
    }
    final dietary = json['dietary'];
    if (dietary != null && dietary is! List) {
      throw const FormatException('Saved dietary preferences are invalid.');
    }
    return ShopperPreferences(
      dietary: (dietary as List? ?? const [])
          .whereType<String>()
          .where(dietaryOptions.containsKey)
          .toSet(),
      maxBudgetMinor: budget as int?,
    );
  }

  /// Reads the persisted (local) form, tolerating a legacy payload that has no
  /// allergen key. Unknown allergen labels are ignored rather than crashing.
  factory ShopperPreferences.fromPersistedJson(Map<String, dynamic> json) {
    final base = ShopperPreferences.fromJson(json);
    final rawAllergens = json['allergens'];
    final allergens = rawAllergens is List
        ? rawAllergens
              .whereType<String>()
              .where(allergenOptions.containsKey)
              .toSet()
        : <String>{};
    return ShopperPreferences(
      dietary: base.dietary,
      allergens: allergens,
      maxBudgetMinor: base.maxBudgetMinor,
    );
  }

  ShopperPreferences copyWith({
    Iterable<String>? dietary,
    Iterable<String>? allergens,
    int? maxBudgetMinor,
    bool clearBudget = false,
    bool clearAllergens = false,
  }) => ShopperPreferences(
    dietary: dietary?.toSet() ?? this.dietary,
    allergens: clearAllergens ? <String>{} : (allergens?.toSet() ?? this.allergens),
    maxBudgetMinor: clearBudget ? null : maxBudgetMinor ?? this.maxBudgetMinor,
  );
}
