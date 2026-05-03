"use client";

import React from "react";
import { ViewerType } from "@/lib/types";

type ChatHandler = (
  viewer: ViewerType,
  message: JSX.Element,
  messageString: string
) => void;

type DonationHandler = (
  viewer: ViewerType,
  message: JSX.Element,
  messageString: string,
  price: number
) => void;

type ErrorHandler = (error: Error) => void;

type UseCimeChatProps = {
  channelId: string;
  /**
   * true로 설정하면 서버가 동일 userIdHash의 채팅 메시지를 세션 단위로 필터링합니다.
   * 시청자 추첨 기능에서 중복 참여를 방지하기 위해 사용합니다.
   */
  dedup?: boolean;
  onChat?: ChatHandler;
  onDonation?: DonationHandler;
  onError?: ErrorHandler;
};

/**
 * Relay 서버가 전송하는 compact 배치 아이템 형식입니다.
 * 필드명을 축약하여 WebSocket 페이로드 크기를 줄입니다.
 *
 *   k: 메시지 종류 ("c" = 채팅, "d" = 후원)
 *   h: userIdHash  — 사용자 식별자 (원본 ID를 서버에서 해시 처리)
 *   n: nickname
 *   b: badges      — 배지 이미지 URL 배열
 *   s: subscribe   — 구독자 여부
 *   m: message content
 *   p: price       — 후원 금액 (k="d" 일 때만 존재)
 */
interface BatchItem {
  k: "c" | "d";
  h: string;
  n: string;
  b: string[];
  s: boolean;
  m: string;
  p?: number;
}

type RelayMessage =
  | { type: "batch"; items?: BatchItem[] }
  | { type: "status"; code: string; message: string }
  | { type: "error"; code: string; message: string };

function getRelayWsBase(): string {
  const envBase = process.env.NEXT_PUBLIC_CIME_RELAY_WS_URL;
  if (envBase) return envBase.replace(/\/$/, "");

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.hostname}:3001`;
}

/**
 * 메시지 문자열을 JSX로 변환합니다.
 *
 * ci.me 이모티콘 토큰 형식은 :{channelId}-{emojiName}: 입니다.
 * 현재 서버는 이모티콘 이미지 URL을 전달하지 않으므로, 토큰은 시각적 출력에서 제거되고
 * TTS(messageString)에서도 생략됩니다. 텍스트 구간만 span 엘리먼트로 변환합니다.
 */
function buildMessage(
  content: string
): { message: JSX.Element; messageString: string } {
  const regex = /:([\w-]+):/g;
  if (!regex.test(content)) {
    return {
      message: React.createElement("span", {}, content),
      messageString: content,
    };
  }

  // regex.test() 호출 후 lastIndex가 전진했으므로 처음부터 다시 매칭합니다.
  regex.lastIndex = 0;
  const elements: JSX.Element[] = [];
  const voice: string[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    if (lastIndex < match.index) {
      const text = content.substring(lastIndex, match.index);
      elements.push(React.createElement("span", { key: `t-${lastIndex}` }, text));
      voice.push(text);
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    const remaining = content.substring(lastIndex);
    elements.push(React.createElement("span", { key: `t-${lastIndex}` }, remaining));
    voice.push(remaining);
  }

  return {
    message: React.createElement("span", {}, elements),
    messageString: voice.join(""),
  };
}

function toViewerType(item: BatchItem): ViewerType {
  return {
    userIdHash: item.h,
    nickname: item.n,
    badges: item.b,
    subscribe: item.s,
  };
}

class CimeChatClient {
  private ws: WebSocket | null = null;
  private channelId: string;
  private dedup: boolean;
  private onChat?: ChatHandler;
  private onDonation?: DonationHandler;
  private onError?: ErrorHandler;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  constructor(props: UseCimeChatProps) {
    this.channelId = props.channelId;
    this.dedup = props.dedup ?? false;
    this.onChat = props.onChat;
    this.onDonation = props.onDonation;
    this.onError = props.onError;
  }

  async connect(): Promise<void> {
    if (this.destroyed) return;

    try {
      const dedupParam = this.dedup ? "?dedup=1" : "";

      this.ws = new WebSocket(
        `${getRelayWsBase()}/api/ws/chat/${this.channelId}${dedupParam}`
      );

      this.ws.onopen = () => {};

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const msg = JSON.parse(event.data as string) as RelayMessage;
          this.handleMessage(msg);
        } catch {
          // 파싱 오류는 무시합니다 (손상된 프레임이 간헐적으로 올 수 있음).
        }
      };

      this.ws.onclose = (event) => {
        // 1013(Try Again Later): 서버가 드레인 중이거나 한도 초과 상태임을 의미합니다.
        if (!this.destroyed && event.code === 1013) {
          this.onError?.(
            new Error("현재 채팅 연결을 열 수 없습니다. 잠시 후 다시 시도해주세요.")
          );
        }
        if (!this.destroyed) {
          this.reconnectTimeout = setTimeout(() => void this.connect(), 3000);
        }
      };

      this.ws.onerror = () => {
        if (!this.destroyed) {
          this.onError?.(new Error("WebSocket 연결 오류"));
        }
      };
    } catch (error) {
      if (!this.destroyed) {
        this.reconnectTimeout = setTimeout(() => void this.connect(), 5000);
        this.onError?.(
          error instanceof Error ? error : new Error("연결 초기화 실패")
        );
      }
    }
  }

  private handleMessage(msg: RelayMessage): void {
    if (msg.type === "error") {
      this.onError?.(new Error(msg.message));
      return;
    }

    if (msg.type === "status") {
      return;
    }

    this.handleBatch(msg);
  }

  private handleBatch(msg: { type: string; items?: BatchItem[] }): void {
    if (msg.type !== "batch" || !msg.items) return;

    for (const item of msg.items) {
      if (item.k === "c" && this.onChat) {
        const viewer = toViewerType(item);
        const { message, messageString } = buildMessage(item.m);
        this.onChat(viewer, message, messageString);
      } else if (item.k === "d" && this.onDonation) {
        const viewer = toViewerType(item);
        const { message, messageString } = buildMessage(item.m);
        this.onDonation(viewer, message, messageString, item.p ?? 0);
      }
    }
  }

  disconnect(): void {
    this.destroyed = true;
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
  }
}

/**
 * CimeChatClient 인스턴스를 생성하고 연결을 시작합니다.
 *
 * React Hook이 아니라 일반 팩토리 함수입니다.
 * useEffect 내부에서 호출하고, cleanup에서 client.disconnect()를 실행하세요.
 *
 * @example
 * useEffect(() => {
 *   const client = createCimeChatClient({ channelId, onChat });
 *   return () => client?.disconnect();
 * }, []);
 */
export default function createCimeChatClient(
  props: UseCimeChatProps
): CimeChatClient | null {
  try {
    const client = new CimeChatClient(props);
    client.connect().catch((error) => {
      props.onError?.(
        error instanceof Error ? error : new Error("연결 초기화 실패")
      );
    });
    return client;
  } catch (error) {
    props.onError?.(
      error instanceof Error ? error : new Error("클라이언트 초기화 실패")
    );
    return null;
  }
}
