"use client";

import { useEffect, useRef, useState } from "react";
import { ViewerType } from "@/lib/types";
import { useGlobalOptionStore } from "@/lib/zustand";
import createCimeChatClient from "@/lib/useCimeChat";
import useVoice from "@/lib/useVoice";
import MainButton from "../Main/MainButton";
import {
  Container,
  Viewer,
  ViewerBadge,
  ViewerName,
  ChatBox,
  Balloon,
  ChatBottom,
} from "./Chat.styled";

type ChatType = {
  viewer: ViewerType;
  onClose: () => void;
};

export default function Chat({ viewer, onClose }: ChatType) {
  const { channel, voice } = useGlobalOptionStore();
  const [chat, setChat] = useState<JSX.Element[]>([]);
  const [state, setState] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  function handleOnChat(
    getViewer: ViewerType,
    message: JSX.Element,
    messageString: string
  ) {
    if (viewer.userIdHash !== getViewer.userIdHash) return;
    setChat((prev) => [...prev, message]);
    useVoice(voice, messageString);
  }

  useEffect(() => {
    if (!state) return;

    const client = createCimeChatClient({
      channelId: channel.channelId,
      onChat: handleOnChat,
    });

    return () => {
      if (client) client.disconnect();
    };
  }, [state]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [chat]);

  useEffect(() => {
    //최초 애니메이션 재생 중에는 채팅 파싱하지 않음
    const timeout = setTimeout(() => {
      setState(true);
    }, 500);

    return () => {
      clearTimeout(timeout);
    };
  }, []);

  return (
    <Container>
      <Viewer>
        {viewer.badges.map((e, i) => (
          <ViewerBadge key={`chat_badge_${i}`} src={e} />
        ))}
        <ViewerName>{viewer.nickname}</ViewerName>
      </Viewer>
      <ChatBox>
        {chat.map((e, i) => (
          <Balloon key={`chat_balloon_${i}`}>{e}</Balloon>
        ))}
        <ChatBottom ref={chatBottomRef} />
      </ChatBox>
      <MainButton fill="primary" fillType="outlined" onClick={onClose}>
        닫기
      </MainButton>
    </Container>
  );
}
