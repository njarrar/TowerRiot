// Locks the iOS and Android apps to landscape. Runs after `cap add`; safe to run again.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const plist = 'ios/App/App/Info.plist';
if (existsSync(plist)) {
  let s = readFileSync(plist, 'utf8');
  const land = '<array>\n\t\t<string>UIInterfaceOrientationLandscapeLeft</string>\n\t\t<string>UIInterfaceOrientationLandscapeRight</string>\n\t</array>';
  s = s.replace(/(<key>UISupportedInterfaceOrientations(?:~ipad)?<\/key>\s*)<array>[\s\S]*?<\/array>/g, `$1${land}`);
  if (!s.includes('UIRequiresFullScreen')) s = s.replace('<dict>', '<dict>\n\t<key>UIRequiresFullScreen</key>\n\t<true/>\n\t<key>UIStatusBarHidden</key>\n\t<true/>');
  writeFileSync(plist, s);
  console.log('iOS: landscape only');
}
const manifest = 'android/app/src/main/AndroidManifest.xml';
if (existsSync(manifest)) {
  let s = readFileSync(manifest, 'utf8');
  if (!s.includes('android:screenOrientation')) s = s.replace(/<activity\b/, '<activity\n            android:screenOrientation="sensorLandscape"');
  writeFileSync(manifest, s);
  console.log('Android: landscape only');
}
