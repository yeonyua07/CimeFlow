"use client";

import styled from "styled-components";

export const Container = styled.div`
  display: grid;
  grid-template-columns: minmax(320px, 0.86fr) minmax(540px, 1.14fr);
  width: 100%;
  height: 100%;
  gap: 42px;
  align-items: center;
  padding: 44px clamp(28px, 5.5vw, 84px);

  animation: ${({ theme }) => theme.animation.appearUp} 0.3s;

  ${({ theme }) => theme.device.tablet} {
    grid-template-columns: 1fr;
    align-items: flex-start;
    height: auto;
  }

  ${({ theme }) => theme.device.mobile} {
    padding: 36px 16px 60px;
    gap: 28px;
  }
`;

export const Hero = styled.section`
  display: flex;
  flex-direction: column;
  gap: 24px;
`;

export const HeroCopy = styled.div`
  display: flex;
  flex-direction: column;
  gap: 14px;
`;

export const HeroBadge = styled.span`
  width: fit-content;
  padding: 8px 12px;
  border: 1px solid ${({ theme }) => theme.colors.border02};
  border-radius: ${({ theme }) => theme.rounded.full};
  background-color: ${({ theme }) => theme.colors.background02};
  color: ${({ theme }) => theme.colors.content70};
  font-size: ${({ theme }) => theme.fonts.size.xs};
  font-weight: ${({ theme }) => theme.fonts.weight.extrabold};
  line-height: ${({ theme }) => theme.fonts.lineHeight.none};
  text-transform: uppercase;
`;

export const HeroTitle = styled.h1`
  font-size: ${({ theme }) => theme.fonts.size["7xl"]};
  font-weight: ${({ theme }) => theme.fonts.weight.extrabold};
  line-height: ${({ theme }) => theme.fonts.lineHeight.none};
  letter-spacing: 0;
  color: ${({ theme }) => theme.colors.content};

  ${({ theme }) => theme.device.mobile} {
    font-size: ${({ theme }) => theme.fonts.size["5xl"]};
  }
`;

export const HeroText = styled.p`
  max-width: 560px;
  font-size: ${({ theme }) => theme.fonts.size.xl};
  font-weight: ${({ theme }) => theme.fonts.weight.semibold};
  line-height: ${({ theme }) => theme.fonts.lineHeight.normal};
  color: ${({ theme }) => theme.colors.content80};
  word-break: keep-all;

  ${({ theme }) => theme.device.mobile} {
    font-size: ${({ theme }) => theme.fonts.size.lg};
  }
`;

export const PreviewCard = styled.div`
  display: grid;
  grid-template-columns: 168px 1fr;
  gap: 16px;
  align-items: center;
  padding: 12px;
  border: 1px solid ${({ theme }) => theme.colors.border01};
  border-radius: ${({ theme }) => theme.rounded.base};
  background-color: ${({ theme }) => theme.colors.background01Transparent};
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.22);
  backdrop-filter: blur(14px);

  ${({ theme }) => theme.device.mobile} {
    grid-template-columns: 1fr;
  }
`;

export const PreviewThumb = styled.div`
  position: relative;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  align-items: end;
  gap: 8px;
  aspect-ratio: 16 / 9;
  padding: 14px;
  overflow: hidden;
  border-radius: ${({ theme }) => theme.rounded.base};
  background:
    radial-gradient(circle at 20% 18%, rgba(139, 92, 246, 0.9), transparent 28%),
    radial-gradient(circle at 82% 24%, rgba(34, 211, 238, 0.74), transparent 24%),
    linear-gradient(135deg, rgba(139, 92, 246, 0.8), rgba(24, 21, 33, 0.98));

  span {
    display: block;
    border-radius: ${({ theme }) => theme.rounded.full};
    background-color: rgba(255, 255, 255, 0.86);
  }

  span:nth-child(2) {
    height: 38%;
  }

  span:nth-child(3) {
    height: 68%;
  }

  span:nth-child(4) {
    height: 52%;
  }
`;

export const LiveBadge = styled.strong`
  position: absolute;
  top: 10px;
  left: 10px;
  padding: 5px 8px;
  border-radius: ${({ theme }) => theme.rounded.sm};
  background-color: ${({ theme }) => theme.colors.red};
  color: ${({ theme }) => theme.colors.white};
  font-size: ${({ theme }) => theme.fonts.size.xs};
  font-weight: ${({ theme }) => theme.fonts.weight.extrabold};
  line-height: ${({ theme }) => theme.fonts.lineHeight.none};
`;

export const PreviewMeta = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 12px;
`;

export const PreviewTitle = styled.strong`
  color: ${({ theme }) => theme.colors.content};
  font-size: ${({ theme }) => theme.fonts.size.lg};
  font-weight: ${({ theme }) => theme.fonts.weight.extrabold};
  line-height: ${({ theme }) => theme.fonts.lineHeight.tight};
`;

export const PreviewTags = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
`;

export const PreviewTag = styled.span`
  padding: 7px 9px;
  border-radius: ${({ theme }) => theme.rounded.full};
  background-color: ${({ theme }) => theme.colors.content10};
  color: ${({ theme }) => theme.colors.content70};
  font-size: ${({ theme }) => theme.fonts.size.xs};
  font-weight: ${({ theme }) => theme.fonts.weight.semibold};
  line-height: ${({ theme }) => theme.fonts.lineHeight.none};
`;

export const ActionGrid = styled.section`
  display: grid;
  grid-template-columns: repeat(2, minmax(240px, 1fr));
  gap: 18px;

  ${({ theme }) => theme.device.mobile} {
    grid-template-columns: 1fr;
  }
`;
