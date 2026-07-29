import type { ReactElement } from 'react';
import {
  render as renderNative,
  type RenderOptions,
} from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

export * from '@testing-library/react-native';

export function render(element: ReactElement, options?: RenderOptions) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return renderNative(
    <QueryClientProvider client={client}>{element}</QueryClientProvider>,
    options,
  );
}
