"use client";

import Breadcrumbs from "@/app/_components/Main/Breadcrumbs";
import {
  faGear,
  faPenNib,
  faVolumeHigh,
  faTowerBroadcast,
} from "@fortawesome/free-solid-svg-icons";
import { Container } from "../page.styled";
import IndexButton, { IndexButtonType } from "../_components/IndexButton";

export default function Page() {
  const btns: IndexButtonType[] = [
    {
      href: "/config/channel",
      icon: faTowerBroadcast,
      text: "채널 설정",
      tooltip: `투표 및 추첨을 진행할 채널을 변경합니다`,
    },
    {
      href: "/config/tts",
      icon: faVolumeHigh,
      text: "TTS 설정",
      tooltip: `채팅을 읽어주는 TTS를 설정합니다`,
    },
    {
      href: "/config/patchnote",
      icon: faPenNib,
      text: "패치노트",
      tooltip: `사이트 패치 내역을 확인합니다`,
    },
  ];

  return (
    <>
      <Breadcrumbs icon={faGear} text="설정" />
      <Container>
        {btns.map((item) => (
          <IndexButton key={item.href} {...item} />
        ))}
      </Container>
    </>
  );
}
