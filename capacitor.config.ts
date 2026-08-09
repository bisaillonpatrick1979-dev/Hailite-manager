import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ca.hailite.manager',
  appName: 'Hailite Manager',
  webDir: 'dist',
  backgroundColor: '#0F1115',
  loggingBehavior: 'debug',
  android: {
    backgroundColor: '#0F1115',
    allowMixedContent: false,
    webContentsDebuggingEnabled: false
  },
  server: {
    // Épinglé volontairement. Ce schéma détermine l'origine de la WebView
    // Android (`https://localhost`), qui doit correspondre exactement à la
    // liste NATIVE_APP_ORIGINS du serveur (securityMiddleware.ts). C'est déjà
    // la valeur par défaut de Capacitor 8, mais la laisser implicite ferait
    // dépendre l'authentification de l'application native d'un choix interne
    // de la bibliothèque : une future mise à jour pourrait la déconnecter.
    androidScheme: 'https'
  },
  plugins: {
    CapacitorHttp: {
      enabled: true
    },
    SplashScreen: {
      launchShowDuration: 1600,
      launchAutoHide: true,
      backgroundColor: '#0F1115',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false
    }
  }
};

export default config;
