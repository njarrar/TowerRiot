import type { CapacitorConfig } from '@capacitor/cli';

// The game is bundled inside the app (webDir), so it never needs the network.
const config: CapacitorConfig = {
  appId: 'com.njarrar.towerriot',
  appName: 'TowerRiot',
  webDir: 'dist',
  backgroundColor: '#f6f2ea',
  ios: { contentInset: 'never' },
  android: { allowMixedContent: false },
};

export default config;
