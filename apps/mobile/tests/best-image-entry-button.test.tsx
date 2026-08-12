import { render } from '@testing-library/react-native';
import { jest } from '@jest/globals';
import { StyleSheet } from 'react-native';
import { BestImageEntryButton } from '@/components/BestImageEntryButton';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

describe('BestImageEntryButton shared visual contract', () => {
  it('uses the existing solid best-page action style without a decorative icon', async () => {
    const screen = await render(<BestImageEntryButton label="生成B50图片" />);
    const button = screen.getByLabelText('生成B50图片');
    expect(StyleSheet.flatten(button.props.style)).toMatchObject({
      minHeight: 46,
      borderRadius: 14,
      paddingHorizontal: 16,
      alignItems: 'center',
      justifyContent: 'center',
    });
    expect(StyleSheet.flatten(screen.getByText('生成B50图片').props.style)).toMatchObject({
      color: '#FFFFFF', fontSize: 15, fontWeight: '800',
    });
    expect(screen.queryByTestId('best-image-entry-icon')).toBeNull();
  });
});
