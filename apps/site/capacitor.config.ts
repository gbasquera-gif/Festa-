import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.festae.app',
  appName: 'Festaê!',
  webDir: 'dist/public',
  backgroundColor: '#0F2A4F',
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: '#0F2A4F',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0F2A4F',
    },
  },
};

export default config;
