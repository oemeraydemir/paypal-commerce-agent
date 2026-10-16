class ShopperPreferences {
  static const dietaryOptions = <String, String>{
    'vegetarian': 'Vegetarian',
    'vegan': 'Vegan',
    'gluten-free': 'Gluten-free',
  };

  final Set<String> dietary;
  final int? maxBudgetMinor;

  const ShopperPreferences({this.dietary = const {}, this.maxBudgetMinor});

  static const empty = ShopperPreferences();

  Map<String, dynamic> toJson() => {
    'dietary': dietary.toList()..sort(),
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

  ShopperPreferences copyWith({
    Iterable<String>? dietary,
    int? maxBudgetMinor,
    bool clearBudget = false,
  }) => ShopperPreferences(
    dietary: dietary?.toSet() ?? this.dietary,
    maxBudgetMinor: clearBudget ? null : maxBudgetMinor ?? this.maxBudgetMinor,
  );
}
