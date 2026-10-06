import { render, screen } from '@testing-library/react-native';
import { Image } from 'expo-image';
import { Mascot } from '@/ui/mascot';

jest.mock('expo-image', () => ({ Image: jest.fn(() => null) }));

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.EXPO_PUBLIC_MASCOT_RIVE;
});

test('hidden removes the mascot instead of reserving image space', async () => {
  await render(<Mascot pose="wave" size={170} hidden />);
  expect(screen.toJSON()).toBeNull();
  expect(Image).not.toHaveBeenCalled();
});

test('approved PNG is the default and retains the caller geometry', async () => {
  await render(<Mascot pose="thumbs" size={170} style={{ height: 200 }} />);
  expect(Image).toHaveBeenCalledWith(
    expect.objectContaining({
      source: require('../assets/mascot/thumbs.png'),
      contentFit: 'contain',
      accessible: false,
      style: [{ width: 170, height: 170 }, { height: 200 }],
    }),
    undefined,
  );
});

test('a face and celebration stay PNG even with the experimental flag', async () => {
  process.env.EXPO_PUBLIC_MASCOT_RIVE = 'true';
  await render(<Mascot pose="jump" size={170} />);
  expect(Image).toHaveBeenCalledWith(
    expect.objectContaining({ source: require('../assets/mascot/jump.png') }),
    undefined,
  );
});
