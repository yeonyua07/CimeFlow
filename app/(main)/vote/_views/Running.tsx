"use client";

import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { TimeType, ViewerType, VoteType } from "@/lib/types";
import MainButton from "@/app/_components/Main/MainButton";
import TimeElapsed from "@/app/_components/Vote/TimeElapsed";
import ListItem from "@/app/_components/Vote/ListItem";
import MainCheckbox from "@/app/_components/Main/MainCheckbox";
import { useGlobalOptionStore } from "@/lib/zustand";
import createCimeChatClient from "@/lib/useCimeChat";
import { extractVoteNumber } from "@/lib/vote";
import Description, {
  DescriptionType,
} from "@/app/_components/Vote/Description";
import {
  Container,
  Top,
  Total,
  Bottom,
  List,
  ContainerCenter,
} from "./index.styled";
import CimeError from "@/app/_components/Viewer/CimeError";
import Timer from "@/app/_components/Vote/Timer";

const description: DescriptionType[] = [
  {
    body: [
      { bold: false, text: "채팅 시 " },
      { bold: true, text: "메시지 가장 앞" },
      { bold: false, text: "에 " },
      { bold: true, text: "'!투표1'" },
      { bold: false, text: " 혹은 " },
      { bold: true, text: "'!투표 1'" },
      { bold: false, text: "과 같이 입력해주세요" },
    ],
  },
  {
    body: [
      {
        bold: false,
        text: "투표율 바를 클릭하면 상세 정보를 확인할 수 있습니다",
      },
    ],
    list: [
      [
        {
          bold: false,
          text: "투표자 리스트를 확인하고, 그 중에서 추첨을 진행할 수 있습니다",
        },
      ],
      [
        {
          bold: false,
          text: "투표 진행 중에도 추첨이 가능합니다",
        },
      ],
    ],
  },
];

export default function Running({
  zoom,
  vote,
  setVote,
  drawn,
  setDrawn,
  time,
  timer,
  onStop,
}: {
  zoom: number;
  vote: VoteType[];
  setVote: Dispatch<SetStateAction<VoteType[]>>;
  drawn: ViewerType[];
  setDrawn: (viewer: ViewerType) => void;
  time: TimeType;
  timer: Date | null;
  onStop: () => void;
}) {
  const { channel } = useGlobalOptionStore();
  const [hidden, setHidden] = useState<boolean>(false);
  const [cimeError, setCimeError] = useState<string | null>(null);

  // 데이터를 버퍼링하기 위한 ref
  const voteSet = useRef(new Set<string>());
  const voteBuffer = useRef<VoteType[]>([...vote]);
  const bufferTimeout = useRef<NodeJS.Timeout>();

  // 투표자 위치 인덱스 — 변경 시 O(1) 조회, 전체 배열 복사 불필요
  const voteIndexMap = useRef(new Map<string, number>()); // userIdHash → optionIndex

  function handleOnChat(viewer: ViewerType, message: string) {
    if (!voteSet.current || !voteBuffer.current) return;

    const onlyNumber = extractVoteNumber(message);
    if (!onlyNumber || onlyNumber > vote.length) return;

    const number = onlyNumber - 1;

    // 이미 투표한 사용자: 이전 옵션에서만 제거 (전체 배열 복사 없이)
    if (voteSet.current.has(viewer.userIdHash)) {
      const prevIndex = voteIndexMap.current.get(viewer.userIdHash);
      if (prevIndex !== undefined && prevIndex !== number) {
        const prevViewers = voteBuffer.current[prevIndex].viewers;
        const idx = prevViewers.findIndex((v) => v.userIdHash === viewer.userIdHash);
        if (idx !== -1) prevViewers.splice(idx, 1);
      } else if (prevIndex === number) {
        return; // 같은 항목 재투표 무시
      }
    } else {
      voteSet.current.add(viewer.userIdHash);
    }

    voteBuffer.current[number].viewers.push(viewer);
    voteIndexMap.current.set(viewer.userIdHash, number);

    if (!bufferTimeout.current) {
      bufferTimeout.current = setTimeout(() => {
        setVote([...voteBuffer.current]);
        bufferTimeout.current = undefined;
      }, 1000);
    }
  }

  useEffect(() => {
    if (channel.channelId === "") {
      alert("채널ID가 정상적으로 인식되지 않습니다. 다시 시도해주세요.");
      location.reload();
      return;
    }

    const client = createCimeChatClient({
      channelId: channel.channelId,
      onChat: (viewer, message, messageString) => {
        handleOnChat(viewer, messageString);
      },
      onError: (error) => {
        setCimeError(error.message);
        setTimeout(onStop, 10000);
      },
    });

    return () => {
      if (client) client.disconnect();
    };
  }, []);

  const total = vote.reduce((sum, item) => sum + item.viewers.length, 0);

  return (
    <Container>
      <ContainerCenter $zoom={zoom}>
        <Top>
          <Total>총 {total}표</Total>
          <TimeElapsed {...time} />
        </Top>
        {cimeError ? <CimeError message={cimeError} /> : null}
        <Description title="채팅 투표가 진행중입니다" body={description} />
        <List>
          {vote.map((item) => (
            <ListItem
              index={item.id}
              name={item.name}
              total={total}
              viewers={item.viewers}
              drawn={drawn}
              setDrawn={setDrawn}
              hidden={hidden}
            />
          ))}
        </List>
        <Bottom>
          <MainCheckbox
            title="투표 내용 가리기"
            value={hidden}
            onClick={() => {
              setHidden((prev) => !prev);
            }}
          />
          <MainButton onClick={onStop}>투표 종료</MainButton>
        </Bottom>
      </ContainerCenter>
      {timer ? <Timer end={timer} onStop={onStop} /> : null}
    </Container>
  );
}
