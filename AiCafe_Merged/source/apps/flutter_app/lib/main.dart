import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:provider/provider.dart';

import 'package:flutter_app/providers/chat_provider.dart';
import 'package:flutter_app/providers/checkout_provider.dart';
import 'package:flutter_app/providers/locale_provider.dart';
import 'package:flutter_app/providers/shopper_profile_provider.dart';
import 'package:flutter_app/screens/chat_screen.dart';
import 'package:flutter_app/services/api_service.dart';
import 'package:flutter_app/services/secure_session_storage.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Initialize the intl date/number symbols before any DateFormat is
  // constructed. Without this, DateFormat('HH:mm', 'tr_TR') (and 'en_IE')
  // throws a LocaleDataException on the first ChatScreen build. The data for
  // all locales is loaded, covering both supported tags.
  await initializeDateFormatting();
  // Load any persisted language choice before the first frame paints.
  final localeProvider = LocaleProvider();
  await localeProvider.load();

  runApp(MyApp(localeProvider: localeProvider));
}

class MyApp extends StatelessWidget {
  final LocaleProvider localeProvider;

  const MyApp({super.key, required this.localeProvider});

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        // Single HTTP client shared by both providers.
        Provider<ApiService>(
          create: (_) => ApiService(storage: SecureSessionStorage()),
          dispose: (_, api) => api.dispose(),
        ),
        ChangeNotifierProvider<LocaleProvider>.value(value: localeProvider),
        ChangeNotifierProvider<ChatProvider>(
          create: (ctx) => ChatProvider(ctx.read<ApiService>()),
        ),
        ChangeNotifierProvider<ShopperProfileProvider>(
          create: (_) => ShopperProfileProvider(),
        ),
        // Checkout depends on Chat (for the session id + AI-prepared cart).
        ChangeNotifierProxyProvider<ChatProvider, CheckoutProvider>(
          create: (ctx) => CheckoutProvider(
            ctx.read<ApiService>(),
            ctx.read<ChatProvider>(),
            localeProvider: ctx.read<LocaleProvider>(),
          ),
          update: (ctx, chat, previous) =>
              previous ?? CheckoutProvider(
                ctx.read<ApiService>(),
                chat,
                localeProvider: ctx.read<LocaleProvider>(),
              ),
        ),
      ],
      child: Consumer<LocaleProvider>(
        builder: (ctx, locale, _) => MaterialApp(
          title: 'AI Café',
          debugShowCheckedModeBanner: false,
          locale: locale.locale,
          localizationsDelegates: const [
            GlobalMaterialLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
          ],
          supportedLocales: const [Locale('en', 'IE'), Locale('tr', 'TR')],
          theme: ThemeData(
            useMaterial3: true,
            colorSchemeSeed: const Color(0xFF176B55),
            brightness: Brightness.light,
          ),
          home: const ChatScreen(),
        ),
      ),
    );
  }
}
