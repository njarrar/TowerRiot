import '@fontsource/cinzel/700.css';
import '@fontsource/cinzel/900.css';
import '@fontsource/barlow/400.css';
import '@fontsource/barlow/600.css';
import '@fontsource/barlow/800.css';
import './styles.css';
import { App } from './ui/app';
import { registerOffline } from './offline';

const root = document.getElementById('app')!;
const app = new App(root);
app.title();
registerOffline();
