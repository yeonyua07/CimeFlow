import { ChannelType } from "./types";

function parseInput(input: string): { type: "handle" | "id"; value: string } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // URL 형식: https://ci.me/@byeolha/live 또는 https://ci.me/@byeolha
  try {
    const url = new URL(trimmed);
    if (url.hostname.includes("ci.me")) {
      const segments = url.pathname.split("/").filter(Boolean);
      const handleSeg = segments.find((s) => s.startsWith("@"));
      if (handleSeg) return { type: "handle", value: handleSeg.replace(/^@/, "") };
      const numericSeg = segments.find((s) => /^\d+$/.test(s));
      if (numericSeg) return { type: "id", value: numericSeg };
    }
  } catch {}

  // 직접 입력: 숫자 ID
  if (/^\d+$/.test(trimmed)) return { type: "id", value: trimmed };

  // 직접 입력: @handle 또는 handle
  const handle = trimmed.replace(/^@/, "");
  if (handle) return { type: "handle", value: handle };

  return null;
}

export default async function cimeFind(
  input: string
): Promise<ChannelType | null> {
  const parsed = parseInput(input);
  if (!parsed) return null;

  try {
    const query =
      parsed.type === "id"
        ? `channelId=${encodeURIComponent(parsed.value)}`
        : `handle=${encodeURIComponent(parsed.value)}`;

    const relayHttpBase =
      process.env.NEXT_PUBLIC_CIME_RELAY_HTTP_URL?.replace(/\/$/, "") ??
      `${window.location.protocol}//${window.location.hostname}:3001`;

    const res = await fetch(`${relayHttpBase}/api/cime/channel?${query}`);
    if (!res.ok) return null;
    return await res.json() as ChannelType;
  } catch {
    return null;
  }
}
