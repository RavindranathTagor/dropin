import { beginBusy, endBusy } from "@/lib/busy";

export async function request(path: string, init?: RequestInit & { busy?: boolean }) {
  const show = init?.busy !== false;
  const { busy: _busy, ...rest } = init || {};
  if (show) beginBusy();
  try {
    const response = await fetch(path, {
      ...rest,
      headers: {
        ...(rest.body instanceof FormData ? {} : { "content-type": "application/json" }),
        ...(rest.headers || {}),
      },
    });
    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    return { response, data };
  } finally {
    if (show) endBusy();
  }
}
