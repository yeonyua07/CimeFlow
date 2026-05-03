"use client";

import MainButton from "@/app/_components/Main/MainButton";
import { Btns, Container } from "./index.styled";
import { ViewersConfigType, ViewerType } from "@/lib/types";
import {
  useState,
  useEffect,
  type Dispatch,
  type SetStateAction,
  useRef,
} from "react";
import Config from "../../../_components/Viewer/Config";
import Viewers from "../../../_components/Viewer/Viewers";
import { useGlobalOptionStore } from "@/lib/zustand";
import createCimeChatClient from "@/lib/useCimeChat";
import Chat from "@/app/_components/Slot/Chat";
import CimeError from "@/app/_components/Viewer/CimeError";
import SlotChat, { handleSlotStart } from "@/app/_components/Slot/SlotChat";
import Timer from "@/app/_components/Vote/Timer";

export default function Running({
  config,
  setConfig,
  viewers,
  setViewers,
  drawn,
  setDrawn,
  timer,
  onStop,
}: {
  config: ViewersConfigType;
  setConfig: (type: keyof ViewersConfigType) => void;
  viewers: ViewerType[];
  setViewers: Dispatch<SetStateAction<ViewerType[]>>;
  drawn: ViewerType[];
  setDrawn: Dispatch<SetStateAction<ViewerType[]>>;
  timer: Date | null;
  onStop: () => void;
}) {
  const { channel } = useGlobalOptionStore();
  const [cimeError, setCimeError] = useState<string | null>(null);

  // 전체 목록 ref — 서버가 dedup:true로 unique만 전달하므로 클라이언트 중복 체크 불필요
  const viewerBuffer = useRef<ViewerType[]>([]);
  const bufferTimeout = useRef<NodeJS.Timeout>();

  // 참여자 수 카운터로 렌더링 트리거 — react-window가 전체 목록을 가상화해서 표시
  const [count, setCount] = useState(0);

  function handleOnChat(viewer: ViewerType) {
    viewerBuffer.current.push(viewer);

    if (!bufferTimeout.current) {
      bufferTimeout.current = setTimeout(() => {
        setCount(viewerBuffer.current.length);
        bufferTimeout.current = undefined;
      }, 1000);
    }
  }

  // 추첨·종료 시점에 전체 목록을 부모 상태에 동기화
  function syncAndStop() {
    setViewers([...viewerBuffer.current]);
    onStop();
  }

  function syncAndDraw() {
    handleSlotStart(viewerBuffer.current, drawn, config, setSlot, setSlotList);
  }

  useEffect(() => {
    if (channel.channelId === "") {
      alert("채널ID가 정상적으로 인식되지 않습니다. 다시 시도해주세요.");
      location.reload();
      return;
    }

    const client = createCimeChatClient({
      channelId: channel.channelId,
      dedup: true,
      onChat: (viewer) => {
        handleOnChat(viewer);
      },
      onError: (error) => {
        setCimeError(error.message);
        setTimeout(syncAndStop, 10000);
      },
    });

    return () => {
      if (client) client.disconnect();
    };
  }, []);

  const [chat, setChat] = useState<ViewerType | null>(null);
  const [slot, setSlot] = useState(false);
  const [slotList, setSlotList] = useState<ViewerType[]>([]);

  function handleSetDrawn(viewer: ViewerType) {
    setDrawn((prev) => {
      const find = prev.find((item) => item.userIdHash === viewer.userIdHash);
      if (find) return prev;
      return [...prev, viewer];
    });
  }

  return (
    <Container>
      <Btns>
        <MainButton fillType="outlined" onClick={syncAndDraw}>
          추첨하기
        </MainButton>
        <MainButton onClick={syncAndStop}>참여자 모집 종료</MainButton>
      </Btns>
      <Config config={config} setConfig={setConfig} />
      {cimeError ? <CimeError message={cimeError} /> : null}
      <Viewers
        viewers={viewerBuffer.current}
        totalCount={count}
        drawn={drawn}
        config={config}
        onSelect={(viewer) => {
          setChat(viewer);
        }}
        message="채팅창에 아무 말이나 입력하시면 참여됩니다!"
        animation
      />
      {chat !== null ? (
        <Chat
          viewer={chat}
          onClose={() => {
            setChat(null);
          }}
        />
      ) : null}
      {slot ? (
        <SlotChat
          list={slotList}
          duration={3000}
          onEnd={(item, target) => {
            handleSetDrawn(item);
          }}
          onClose={() => {
            setSlot(false);
          }}
        />
      ) : null}
      {timer ? <Timer end={timer} onStop={syncAndStop} /> : null}
    </Container>
  );
}
