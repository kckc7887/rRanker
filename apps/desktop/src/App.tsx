import { Navigate, Route, Routes } from 'react-router-dom';
import { useAppRuntime } from './app/runtime';
import { AppShell } from './components/AppShell';
import {
  EmptyAccountView,
  ErrorView,
  LoadingView,
} from './components/StateViews';
import { BestPage } from './pages/BestPage';
import { OverviewPage } from './pages/OverviewPage';
import { RecordsPage } from './pages/RecordsPage';

export default function App() {
  const { phase } = useAppRuntime();

  if (phase === 'booting') return <LoadingView title="正在启动 rRanker" />;
  if (phase === 'loading') return <LoadingView />;
  if (phase === 'empty') return <EmptyAccountView />;
  if (phase === 'error') return <ErrorView />;

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<OverviewPage />} />
        <Route path="best" element={<BestPage />} />
        <Route path="records" element={<RecordsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
