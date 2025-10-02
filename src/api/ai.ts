// src/api/ai.ts
export async function summarize(text: string, maxChars = 100): Promise<string> {
  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, maxChars }),
  });
  const data = await res.json();
  if (!res.ok || !data?.ok) {
    const code = data?.error || `http_${res.status}`;
    throw new Error(`summarize_failed: ${code}`);
  }
  return String(data.summary || '');
}
