export async function requestJson(path, options, onUnauthorized) {
  const res = await fetch(path, {
    headers: {
      'Content-Type': 'application/json'
    },
    ...options
  });
  const data = await res.json();

  if (!res.ok) {
    if (res.status === 401) {
      onUnauthorized?.();
    }
    throw new Error(data?.error || '请求失败');
  }

  return data;
}
