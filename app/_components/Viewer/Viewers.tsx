"use client";

import { ViewersConfigType, ViewerType } from "@/lib/types";
import {
  Container,
  ViewersContainer,
  Viewer,
  ViewerBadge,
  ViewersBottom,
  ViewerBottomText,
} from "./Viewers.styled";
import { FixedSizeList, ListChildComponentProps } from "react-window";
import { useMemo } from "react";

const ITEM_HEIGHT = 44;
const LIST_HEIGHT = 400;

type RowData = {
  viewers: ViewerType[];
  drawn: ViewerType[];
  config: ViewersConfigType;
  onSelect: (viewer: ViewerType) => void;
};

function ViewerRow({ index, style, data }: ListChildComponentProps<RowData>) {
  const { viewers, drawn, config, onSelect } = data;
  const e = viewers[index];
  if (!e) return null;

  const active =
    (config.subscribe ? e.subscribe : true) &&
    (config.duplicate
      ? !drawn.find((d) => d.userIdHash === e.userIdHash)
      : true);

  return (
    <Viewer
      style={style}
      $active={active}
      onClick={() => onSelect(e)}
    >
      {e.badges.map((b, i) => (
        <ViewerBadge key={i} src={b} />
      ))}
      {e.nickname}
    </Viewer>
  );
}

export default function Viewers({
  viewers,
  totalCount,
  drawn,
  config,
  animation,
  message,
  onSelect,
}: {
  viewers: ViewerType[];
  totalCount?: number;
  drawn: ViewerType[];
  config: ViewersConfigType;
  animation?: boolean;
  message?: string;
  onSelect: (viewer: ViewerType) => void;
}) {
  const displayCount = totalCount ?? viewers.length;

  const itemData = useMemo<RowData>(
    () => ({ viewers, drawn, config, onSelect }),
    [viewers, drawn, config, onSelect]
  );

  return (
    <Container>
      <ViewersContainer $animation={animation}>
        <FixedSizeList
          height={LIST_HEIGHT}
          itemCount={viewers.length}
          itemSize={ITEM_HEIGHT}
          width="100%"
          itemData={itemData}
        >
          {ViewerRow}
        </FixedSizeList>
      </ViewersContainer>
      <ViewersBottom>
        <ViewerBottomText>
          총 {displayCount.toLocaleString()}명
        </ViewerBottomText>
        {message ? <ViewerBottomText>{message}</ViewerBottomText> : null}
      </ViewersBottom>
    </Container>
  );
}
