import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'package:flutter_app/providers/chat_provider.dart';
import 'package:flutter_app/providers/checkout_provider.dart';
import 'package:flutter_app/providers/shopper_profile_provider.dart';
import 'package:flutter_app/screens/chat_screen.dart';
import 'package:flutter_app/services/api_service.dart';

void main() => runApp(const MyApp());

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        // Single HTTP client shared by both providers.
        Provider<ApiService>(
          create: (_) => ApiService(),
          dispose: (_, api) => api.dispose(),
        ),
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
          ),
          update: (ctx, chat, previous) =>
              previous ?? CheckoutProvider(ctx.read<ApiService>(), chat),
        ),
      ],
      child: MaterialApp(
        title: 'AI Café',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
          useMaterial3: true,
          colorSchemeSeed: const Color(0xFF176B55),
          brightness: Brightness.light,
        ),
        home: const ChatScreen(),
      ),
    );
  }
}
