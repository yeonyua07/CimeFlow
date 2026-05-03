"use client";

import { useState } from "react";
import {
  Close,
  Container,
  Hr,
  Icon,
  Message,
  Title,
} from "./GlobalAlert.styled";
import { faXmark } from "@fortawesome/free-solid-svg-icons";

export default function GlobalAlert({
  title,
  message,
  until,
}: {
  title: string;
  message: string;
  until?: Date;
}) {
  const [closed, setClosed] = useState(false);

  if (until && until.getTime() < new Date().getTime()) return null;
  if (closed) return null;

  return (
    <Container>
      <Title>{title}</Title>
      <Hr />
      <Message>{message}</Message>
      <Close
        onClick={() => {
          setClosed(true);
        }}
      >
        <Icon icon={faXmark} />
      </Close>
    </Container>
  );
}
