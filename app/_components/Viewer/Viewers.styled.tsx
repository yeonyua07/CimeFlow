import { keyframes, styled } from "styled-components";

export const Container = styled.div`
  width: 100%;
  max-width: 1000px;
`;

export const ViewersContainer = styled.div<{ $animation?: boolean }>`
  width: 100%;
  max-width: 1000px;
  height: 400px;
  border-radius: ${({ theme }) => theme.rounded.base};
  animation-name: ${({ theme }) => theme.animation.viewers};
  animation-duration: ${({ $animation }) => ($animation ? "0.5s" : "0s")};
  border: 1px solid ${({ theme }) => theme.colors.border01};
  overflow: hidden;

  ${({ theme }) => theme.device.mobile} {
    height: 400px;
    animation-duration: 0s;
  }
`;

const AppearUpOpacity = keyframes`
    0% {
      opacity: 0;
      transform: translateY(10px);
    }
    100% {
      opacity: 0.3;
      transform: translateY(0px);
    }
  `;

export const Viewer = styled.button<{ $active: boolean }>`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 16px;
  border-radius: ${({ theme }) => theme.rounded.sm};
  font-weight: ${({ theme }) => theme.fonts.weight.semibold};
  font-size: ${({ theme }) => theme.fonts.size.sm};
  line-height: ${({ theme }) => theme.fonts.lineHeight.none};
  cursor: pointer;
  opacity: ${({ $active }) => ($active ? "1" : "0.3")};
  background-color: transparent;
  color: ${({ theme }) => theme.colors.content};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border01};
  border-top: none;
  border-left: none;
  border-right: none;
  width: 100%;
  text-align: left;
  box-sizing: border-box;

  &:hover,
  &:focus {
    background-color: ${({ theme }) => theme.colors.content10};
  }
`;

export const ViewerBadge = styled.img`
  width: 14px;
  height: 14px;
  margin-right: 2px;
  vertical-align: middle;
`;

export const ViewersBottom = styled.div`
  display: flex;
  flex-direction: row-reverse;
  justify-content: space-between;
  margin-top: 20px;
  animation: ${({ theme }) => theme.animation.appearUp} 0.2s;
`;

export const ViewerBottomText = styled.p`
  font-weight: ${({ theme }) => theme.fonts.weight.extrabold};
  font-size: ${({ theme }) => theme.fonts.size.xl};
  line-height: ${({ theme }) => theme.fonts.lineHeight.none};

  ${({ theme }) => theme.device.mobile} {
    font-weight: ${({ theme }) => theme.fonts.weight.semibold};
    font-size: ${({ theme }) => theme.fonts.size.sm};
  }
`;
