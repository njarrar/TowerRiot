// Locks the Android app to landscape. Runs after `cap add`; safe to run again. (The native iOS app sets this in its own Info.plist.)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const manifest = 'android/app/src/main/AndroidManifest.xml';
if (existsSync(manifest)) {
  let s = readFileSync(manifest, 'utf8');
  if (!s.includes('android:screenOrientation')) s = s.replace(/<activity\b/, '<activity\n            android:screenOrientation="sensorLandscape"');
  writeFileSync(manifest, s);
  console.log('Android: landscape only');
}
