import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_app/l10n/app_strings.dart';
import 'package:flutter_app/providers/chat_provider.dart';
import 'package:flutter_app/providers/checkout_provider.dart';
import 'package:flutter_app/providers/locale_provider.dart';
import 'package:flutter_app/services/api_service.dart';
import 'package:flutter_app/services/session_service.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  group('checkout EN/TR localization', () {
    late ApiService api;
    late ChatProvider chat;
    late LocaleProvider locale;
    late CheckoutProvider checkout;

    setUp(() {
      locale = LocaleProvider('en');
      api = ApiService(
        baseUrl: 'http://localhost:3000',
        storage: InMemorySessionStorage(),
        client: MockClient((_) async => http.Response('{}', 200)),
      );
      chat = ChatProvider(api);
      checkout = CheckoutProvider(api, chat, localeProvider: locale);
    });

    tearDown(() {
      checkout.dispose();
      chat.dispose();
      api.dispose();
    });

    test('checkout errors update live when language changes', () async {
      await checkout.completeCheckout();
      expect(checkout.error, 'No pending order to capture.');
      await locale.setLanguage('tr');
      expect(checkout.error, 'Ödeme için bekleyen bir sipariş yok.');
    });

    test('checkout waiting statuses update live when language changes', () async {
      final handled = await checkout.handlePayPalReturn(
        Uri.parse('paypalcommerceagent://checkout/success'),
      );
      expect(handled, isTrue);
      expect(checkout.statusMessage, 'No pending order to handle.');
      await locale.setLanguage('tr');
      expect(checkout.statusMessage, 'İşleme alınacak bekleyen bir sipariş yok.');
    });

    test('parameterized checkout messages exist in EN and TR', () {
      expect(AppStrings.get('en', 'checkout.errorCancelApi'), contains('%s'));
      expect(AppStrings.get('tr', 'checkout.errorCancelApi'), contains('%s'));
      expect(AppStrings.get('en', 'checkout.statusPaymentPending'), isNotEmpty);
      expect(AppStrings.get('tr', 'checkout.statusPaymentPending'), isNotEmpty);
    });
  });
}
