import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.videoplay.app',
  appName: '云播',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
