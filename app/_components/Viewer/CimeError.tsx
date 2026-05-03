import { faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { Container, Title, Description, Icon } from "./CimeError.styled";
import { useEffect, useState } from "react";

interface CimeErrorProps {
  message?: string;
}

export default function CimeError({ message }: CimeErrorProps) {
  const [count, setCount] = useState(10);

  useEffect(() => {
    const countInterval = setInterval(() => {
      setCount((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => {
      clearInterval(countInterval);
    };
  }, []);

  return (
    <Container>
      <Title>
        <Icon icon={faTriangleExclamation} />
        에러가 발생했습니다!
        <Icon icon={faTriangleExclamation} />
      </Title>
      <Description>
        {message ? (
          message
        ) : (
          <>
            채널 ID가 올바른지, 방송이 진행 중인지 확인해주세요.
            <br />
            봇은 모든 시청자가 참여할 수 있는 환경에서만 채팅을 읽을 수 있습니다.
          </>
        )}
        <br />
        투표 및 추첨은 {count.toString()}초 후 자동 종료됩니다.
      </Description>
    </Container>
  );
}
