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
