import { styled, css, keyframes } from "styled-components";

export const size = {
  mobile: 768,
  tablet: 1300,
  desktop: 1920,
};

export const device = {
  mobile: `@media (max-width: ${size.mobile}px)`,
  tablet: `@media (max-width: ${size.tablet}px)`,
  desktop: `@media (min-width: ${size.tablet + 1}px)`,
};

export const truncate = css`
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const darkColors = {
  border01: `rgba(255, 255, 255, 0.08)`,
  border02: `rgba(255, 255, 255, 0.16)`,
  background01: `rgb(11, 10, 15)`,
  background02: `rgb(24, 21, 33)`,
  background01Transparent: `rgba(11, 10, 15, 0.72)`,
  brand: `rgb(139, 92, 246)`,
  brandGradient: `linear-gradient(135deg, #8B5CF6 0%, #22D3EE 100%)`,
  brandTransparent: `rgba(139, 92, 246, 0.2)`,
  content: `rgb(255, 255, 255)`,
  content10: `rgba(255, 255, 255, 0.1)`,
  content20: `rgba(255, 255, 255, 0.2)`,
  content30: `rgba(255, 255, 255, 0.3)`,
  content40: `rgba(255, 255, 255, 0.4)`,
  content50: `rgba(255, 255, 255, 0.5)`,
  content60: `rgba(255, 255, 255, 0.6)`,
  content70: `rgba(255, 255, 255, 0.7)`,
  content80: `rgba(255, 255, 255, 0.8)`,
  content90: `rgba(255, 255, 255, 0.9)`,
  black: `rgb(0, 0, 0)`,
  white: `rgb(255, 255, 255)`,
  red: `rgb(239, 68, 68)`,
};

const lightColors = {
  border01: `rgba(24, 21, 33, 0.1)`,
  border02: `rgba(24, 21, 33, 0.18)`,
  background01: `rgb(249, 248, 252)`,
  background02: `rgb(240, 237, 248)`,
  background01Transparent: `rgba(249, 248, 252, 0.82)`,
  brand: `rgb(124, 58, 237)`,
  brandGradient: `linear-gradient(135deg, #7C3AED 0%, #06B6D4 100%)`,
  brandTransparent: `rgba(124, 58, 237, 0.14)`,
  content: `rgb(24, 21, 33)`,
  content10: `rgba(17, 24, 39, 0.08)`,
  content20: `rgba(17, 24, 39, 0.16)`,
  content30: `rgba(17, 24, 39, 0.26)`,
  content40: `rgba(17, 24, 39, 0.38)`,
  content50: `rgba(17, 24, 39, 0.5)`,
  content60: `rgba(17, 24, 39, 0.62)`,
  content70: `rgba(17, 24, 39, 0.72)`,
  content80: `rgba(17, 24, 39, 0.82)`,
  content90: `rgba(17, 24, 39, 0.92)`,
  black: `rgb(0, 0, 0)`,
  white: `rgb(255, 255, 255)`,
  red: `rgb(220, 38, 38)`,
};

const fonts = {
  family: `"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, system-ui, Roboto, "Helvetica Neue", "Segoe UI", "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", sans-serif`,
  size: {
    xs: "12px",
    sm: "14px",
    base: "16px",
    lg: "18px",
    xl: "20px",
    ["2xl"]: "24px",
    ["3xl"]: "32px",
    ["4xl"]: "36px",
    ["5xl"]: "40px",
    ["6xl"]: "48px",
    ["7xl"]: "60px",
  },
  lineHeight: {
    none: 1,
    tight: 1.25,
    normal: 1.5,
    relaxed: 1.75,
    loose: 2,
  },
  weight: {
    regular: 400,
    semibold: 600,
    extrabold: 800,
  },
};

const rounded = {
  sm: "4px",
  base: "8px",
  lg: "16px",
  full: "100%",
  half: "50%",
};

const animation = {
  appear: keyframes`
    0% {
      opacity: 0;
    }
    100% {
      opacity: 1;
    }
  `,
  appearUp: keyframes`
    0% {
      opacity: 0;
      transform: translateY(10px);
    }
    100% {
      opacity: 1;
      transform: translateY(0px);
    }
  `,
  appearDown: keyframes`
    0% {
      opacity: 0;
      transform: translateY(0px);
    }
    100% {
      opacity: 1;
      transform: translateY(10px);
    }
  `,
  viewers: keyframes`
    0% {
      opacity: 0;
      height: 0px;
    }
    100% {
      opacity: 1;
      height: 400px;
    }
  `,
  slotViewerDiv: keyframes`
    0% {
      height: 180px;
    }
    100% {
      height: 100px;
    }
  `,
  slotViewerBadge: keyframes`
    0% {
      width: 60px;
      height: 60px;
    }
    100% {
      width: 40px;
      height: 40px;
    }
  `,
  slotViewerName: keyframes`
    0% {
      font: 800 60px/1 var(--font-default);
    }
    100% {
      font: 800 40px/1 var(--font-default);
    }
  `,
  chatbox: keyframes`
    0% {
      opacity: 0;
      height: 0px;
      margin-top: 0px;
      margin-bottom: 0px;
    }
    100% {
      opacity: 1;
      height: 400px;
      margin-top: 20px;
      margin-bottom: 40px;
    }
  `,
  btnHeight: keyframes`
    0% {
      opacity: 0;
      height: 0px;
      overflow: hidden;
      border: 0px solid var(--color-brand);
    }
    100% {
      opacity: 1;
      height: 80px;
      overflow: hidden;
      border: 3px solid var(--color-brand);
    }
  `,
};

export const lightTheme = {
  colors: lightColors,
  fonts,
  rounded,
  animation,
  device,
  truncate,
} as const;

export const darkTheme = {
  colors: darkColors,
  fonts,
  rounded,
  animation,
  device,
  truncate,
};

export type Theme = typeof lightTheme;
