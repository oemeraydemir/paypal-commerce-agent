import 'package:flutter/material.dart';
import 'package:flutter_app/models/product.dart';

/// Shared product artwork. The very same JPEG tiles ship with the web storefront
/// (`backend/public/art/<productId>.jpg`), so a product looks identical on both
/// clients. Resolution order: `<id>.jpg` -> `cat_<category>.jpg` -> neutral icon.
const String _assetDir = 'assets/products';

/// Pastel tint per catalog category (identical to `--t-*` tokens in web `theme.css`).
const Map<String, Color> categoryTints = {
  'breakfast': Color(0xFFFFD9B3),
  'drinks': Color(0xFFBFE3FF),
  'desserts': Color(0xFFD9C8F5),
  'gifts': Color(0xFFFFC2B8),
  'lunch': Color(0xFFBFEBD3),
  'snacks': Color(0xFFFFF0B3),
  'catering': Color(0xFFC6EDEA),
};

const Color defaultTint = Color(0xFFEDE7E3);

Color categoryTint(String category) =>
    categoryTints[category.toLowerCase()] ?? defaultTint;

/// Primary asset path for a product (by id).
String? productArtAsset(Product product) =>
    product.id.isEmpty ? null : '$_assetDir/${_safe(product.id)}.jpg';

/// Category-level fallback asset.
String? categoryArtAsset(String category) =>
    categoryTints.containsKey(category.toLowerCase())
        ? '$_assetDir/cat_${category.toLowerCase()}.jpg'
        : null;

/// Draws the tile with graceful fallbacks; never throws for unknown ids.
Widget productArtImage(Product product, {BoxFit fit = BoxFit.cover}) {
  final primary = productArtAsset(product);
  final fallback = categoryArtAsset(product.category);
  Widget icon() => ColoredBox(
        color: categoryTint(product.category),
        child: const Center(
          child: Icon(Icons.local_cafe_rounded, color: Color(0xFFD8402F), size: 34),
        ),
      );
  if (primary == null) return icon();
  return Image.asset(
    primary,
    fit: fit,
    errorBuilder: (_, _, _) => fallback == null
        ? icon()
        : Image.asset(fallback, fit: fit, errorBuilder: (_, _, _) => icon()),
  );
}

String _safe(String id) => id.replaceAll(RegExp(r'[^A-Za-z0-9_\-]'), '');
