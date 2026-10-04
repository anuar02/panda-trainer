import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import { getSupabaseClient } from '@/features/auth/client';
import { PushController, type PushAdapter } from './controller';
import { notificationsRu } from '@/features/notifications/ru';
const projectId = () =>
  Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
const deviceSecret = async () => {
  const previous = await SecureStore.getItemAsync('push-device-secret-v1');
  if (previous) return previous;
  const value = Crypto.randomUUID() + Crypto.randomUUID();
  await SecureStore.setItemAsync('push-device-secret-v1', value);
  return value;
};
const deviceSequence = async () => {
  const previous = await SecureStore.getItemAsync('push-device-sequence-v1');
  const sequence = previous === null ? 1 : Number(previous) + 1;
  if (!Number.isSafeInteger(sequence) || sequence <= 0)
    throw new Error('Push unavailable');
  await SecureStore.setItemAsync('push-device-sequence-v1', String(sequence));
  return sequence;
};
export const nativePushAdapter: PushAdapter = {
  supported: () =>
    Platform.OS !== 'web' &&
    Device.isDevice &&
    Constants.executionEnvironment !== 'storeClient' &&
    typeof projectId() === 'string',
  device: async () => {
    const previous = await SecureStore.getItemAsync('push-device-v1');
    if (previous) return previous;
    const id = Crypto.randomUUID();
    await SecureStore.setItemAsync('push-device-v1', id);
    return id;
  },
  reconcile: async (owner, device) => {
    const client = getSupabaseClient();
    if (!client) throw new Error('Push unavailable');
    const result = await client
      .rpc('reconcile_push_device', {
        p_device_id: device,
        p_device_secret: await deviceSecret(),
        p_sequence: await deviceSequence(),
      })
      .setHeader('Authorization', `Bearer ${owner.token}`);
    if (result.error) throw new Error('Push unavailable');
  },
  permission: async () => {
    const value = await Notifications.getPermissionsAsync();
    return value.granted
      ? 'granted'
      : value.status === 'undetermined' && value.canAskAgain
        ? 'undetermined'
        : 'denied';
  },
  asked: async () =>
    (await SecureStore.getItemAsync('push-prompt-v1')) === 'asked',
  rememberAsked: async () => {
    await SecureStore.setItemAsync('push-prompt-v1', 'asked');
  },
  request: async () => {
    if (Platform.OS === 'android')
      await Notifications.setNotificationChannelAsync('default', {
        name: notificationsRu.title,
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    return (await Notifications.requestPermissionsAsync()).granted;
  },
  token: async () => {
    if (Platform.OS === 'android')
      await Notifications.setNotificationChannelAsync('default', {
        name: notificationsRu.title,
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    return (
      await Notifications.getExpoPushTokenAsync({ projectId: projectId() })
    ).data;
  },
  generation: () => Crypto.randomUUID(),
  register: async (owner, device, token, generation) => {
    const client = getSupabaseClient();
    if (!client) throw new Error('Push unavailable');
    const result = await client
      .rpc('register_push_device', {
        p_device_id: device,
        p_token: token,
        p_platform: Platform.OS,
        p_generation: generation,
        p_device_secret: await deviceSecret(),
        p_sequence: await deviceSequence(),
      })
      .setHeader('Authorization', `Bearer ${owner.token}`);
    if (result.error) throw new Error('Push unavailable');
  },
  unregister: async (owner, device, generation) => {
    const client = getSupabaseClient();
    if (!client) throw new Error('Push unavailable');
    const result = await client
      .rpc('unregister_push_device', {
        p_device_id: device,
        p_generation: generation,
        p_device_secret: await deviceSecret(),
        p_sequence: await deviceSequence(),
      })
      .setHeader('Authorization', `Bearer ${owner.token}`);
    if (result.error) throw new Error('Push unavailable');
  },
};
export const nativePushController = new PushController(nativePushAdapter);
