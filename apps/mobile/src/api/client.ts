import { getDeviceId, getAccessToken } from '@/lib/storage';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL;

type Options = RequestInit & { projectId?: string };

export async function apiFetch<T>(path: string, options: Options = {}): Promise<T> {
  const { projectId, headers, ...rest } = options;
  const deviceId = await getDeviceId();
  const token = projectId ? await getAccessToken(projectId) : null;

  const res = await fetch(`${BASE_URL}${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      'X-Device-Id': deviceId,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}