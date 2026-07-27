import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import { AppRuntimeProvider } from './app/runtime';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <HashRouter>
    <AppRuntimeProvider>
      <App />
    </AppRuntimeProvider>
  </HashRouter>,
);
