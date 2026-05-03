"use client";

import IndexButton, { IndexButtonType } from "./_components/IndexButton";
import {
  Container,
  Hero,
  HeroCopy,
  HeroTitle,
  HeroText,
  HeroBadge,
  PreviewCard,
  PreviewThumb,
  LiveBadge,
  PreviewMeta,
  PreviewTitle,
  PreviewTags,
  PreviewTag,
  ActionGrid,
} from "./page.styled";
import {
  faSquarePollVertical,
  faCoins,
  faDice,
  faUsers,
} from "@fortawesome/free-solid-svg-icons";

export default function Page() {
  const btns: IndexButtonType[] = [
    {
      href: "/viewer",
      icon: faUsers,
      text: "시청자 추첨",
      eyebrow: "Draw",
      tooltip: "채팅 참여자를 수집하고 중복을 정리해 공정하게 추첨합니다",
    },
    {
      href: "/vote",
      icon: faSquarePollVertical,
      text: "숫자 투표",
      eyebrow: "Poll",
      tooltip: "번호 명령을 실시간 집계해 방송 흐름에 바로 반영합니다",
    },
    {
      href: "/donation",
      icon: faCoins,
      text: "도네 투표",
      eyebrow: "Weighted",
      tooltip: "후원 금액 기반 가중치를 적용해 선택지를 계산합니다",
    },
    {
      href: "/roulette",
      icon: faDice,
      text: "룰렛",
      eyebrow: "Spin",
      tooltip: "투표 결과나 직접 입력한 항목을 룰렛 진행 화면으로 넘깁니다",
    },
  ];

  return (
    <Container>
      <Hero>
        <HeroCopy>
          <HeroBadge>ci.me third-party console</HeroBadge>
          <HeroTitle>CimeFlow</HeroTitle>
          <HeroText>
            ci.me 라이브 채팅을 방송 진행용 추첨, 투표, 룰렛으로 연결합니다.
            공식 자산을 쓰지 않는 독립 오픈소스 도구입니다.
          </HeroText>
        </HeroCopy>
        <PreviewCard aria-hidden="true">
          <PreviewThumb>
            <LiveBadge>LIVE</LiveBadge>
            <span />
            <span />
            <span />
          </PreviewThumb>
          <PreviewMeta>
            <PreviewTitle>오늘의 참여 이벤트</PreviewTitle>
            <PreviewTags>
              <PreviewTag>버추얼</PreviewTag>
              <PreviewTag>소통</PreviewTag>
              <PreviewTag>추첨</PreviewTag>
            </PreviewTags>
          </PreviewMeta>
        </PreviewCard>
      </Hero>
      <ActionGrid>
        {btns.map((item) => (
          <IndexButton key={item.href} {...item} />
        ))}
      </ActionGrid>
    </Container>
  );
}
