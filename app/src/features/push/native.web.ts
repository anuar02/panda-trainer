import { PushController, type PushAdapter } from './controller';
const unavailable = async (): Promise<never> => {
  throw new Error('Native push unavailable');
};
export const nativePushAdapter: PushAdapter = {
  supported: () => false,
  device: unavailable,
  permission: unavailable,
  asked: unavailable,
  rememberAsked: unavailable,
  request: unavailable,
  token: unavailable,
  generation: () => '',
  register: unavailable,
  unregister: unavailable,
};
export const nativePushController = new PushController(nativePushAdapter);
