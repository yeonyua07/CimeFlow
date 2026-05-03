"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Link from "next/link";
import { styled } from "styled-components";

export const Btn = styled(Link)`
  display: flex;
  position: relative;
  flex-direction: row;
  justify-content: flex-start;
  align-items: center;
  width: 100%;
  min-height: 132px;
  gap: 18px;
  padding: 22px;
  border-radius: ${({ theme }) => theme.rounded.base};
  cursor: pointer;
  overflow: hidden;
  background-color: ${({ theme }) => theme.colors.background02};
  border: 1px solid ${({ theme }) => theme.colors.border01};
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.18);
  transition: transform 0.16s ease, border-color 0.16s ease, background-color 0.16s ease;

  &::after {
    content: "";
    position: absolute;
    inset: auto 18px 16px 18px;
    height: 4px;
    border-radius: ${({ theme }) => theme.rounded.full};
    background: ${({ theme }) => theme.colors.brand};
    transform: scaleX(0.28);
    transform-origin: left;
    transition: transform 0.16s ease;
  }

  &:hover,
  &:focus {
    transform: translateY(-3px);
    border-color: ${({ theme }) => theme.colors.brand};
    background-color: ${({ theme }) => theme.colors.background02};
  }

  &:hover::after,
  &:focus::after {
    transform: scaleX(1);
  }

  ${({ theme }) => theme.device.tablet} {
    min-height: 120px;
  }

  ${({ theme }) => theme.device.mobile} {
    min-height: 112px;
    padding: 18px;
  }
`;

export const BtnIcon = styled(FontAwesomeIcon)`
  width: 28px;
  height: 28px;
  flex: 0 0 58px;
  padding: 15px;
  border-radius: ${({ theme }) => theme.rounded.base};
  background: ${({ theme }) => theme.colors.brandTransparent};
  color: ${({ theme }) => theme.colors.content};
  box-shadow: inset 0 0 0 1px ${({ theme }) => theme.colors.border01};

  ${({ theme }) => theme.device.mobile} {
    flex-basis: 50px;
    width: 24px;
    height: 24px;
    padding: 13px;
  }
`;

export const BtnBody = styled.div`
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 8px;
`;

export const BtnEyebrow = styled.span`
  font-size: ${({ theme }) => theme.fonts.size.xs};
  font-weight: ${({ theme }) => theme.fonts.weight.semibold};
  line-height: ${({ theme }) => theme.fonts.lineHeight.none};
  color: ${({ theme }) => theme.colors.content50};
  text-transform: uppercase;
`;

export const BtnText = styled.p`
  font-size: ${({ theme }) => theme.fonts.size["2xl"]};
  font-weight: ${({ theme }) => theme.fonts.weight.extrabold};
  line-height: ${({ theme }) => theme.fonts.lineHeight.tight};
  color: ${({ theme }) => theme.colors.content};

  ${({ theme }) => theme.device.mobile} {
    font-size: ${({ theme }) => theme.fonts.size.xl};
  }
`;

export const BtnTooltip = styled.span`
  color: ${({ theme }) => theme.colors.content60};
  font-size: ${({ theme }) => theme.fonts.size.sm};
  font-weight: ${({ theme }) => theme.fonts.weight.regular};
  line-height: ${({ theme }) => theme.fonts.lineHeight.normal};
  word-break: keep-all;
`;
