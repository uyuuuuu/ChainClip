import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

const DEVICE_ID_KEY = 'device_id';

// 端末ID: 無ければ作って保存。次回以降は同じ値を返す
export async function getDeviceId(): Promise<string> {
  let id = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (!id) {
    id = Crypto.randomUUID();
    await SecureStore.setItemAsync(DEVICE_ID_KEY, id);
  }
  return id;
}

// access_token はプロジェクトごとに保存
export async function saveAccessToken(projectId: string, token: string) {
  await SecureStore.setItemAsync(`access_token_${projectId}`, token);
}
export async function getAccessToken(projectId: string) {
  return SecureStore.getItemAsync(`access_token_${projectId}`);
}