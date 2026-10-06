import { install } from 'react-native-quick-crypto';

let initialized = false;

export const initializeAuthCrypto = () => {
  if (initialized) return;
  install();
  initialized = true;
};
