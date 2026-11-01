import '@fontsource/cinzel/700.css';
import '@fontsource/cinzel/900.css';
import '@fontsource/barlow/400.css';
import '@fontsource/barlow/600.css';
import '@fontsource/barlow/800.css';
import './styles.css';
import { App } from './ui/app';
import { registerOffline } from './offline';
import { App as Native } from '@capacitor/app';

const root = document.getElementById('app')!;
const app = new App(root);
app.title();
registerOffline();

// Android back button: step back through screens, close the app from the title.
void Native.addListener('backButton', () => { if (!app.back()) void Native.exitApp(); }).catch(() => { /* not on a device */ });
