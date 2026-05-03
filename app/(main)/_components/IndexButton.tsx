import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  Btn,
  BtnBody,
  BtnIcon,
  BtnText,
  BtnTooltip,
  BtnEyebrow,
} from "./IndexButton.styled";

export interface IndexButtonType {
  href: string;
  icon: IconDefinition;
  text: string;
  tooltip: string;
  eyebrow?: string;
}

export default function IndexButton({
  href,
  icon,
  text,
  tooltip,
  eyebrow,
}: IndexButtonType) {
  return (
    <Btn href={href}>
      <BtnIcon icon={icon} />
      <BtnBody>
        {eyebrow && <BtnEyebrow>{eyebrow}</BtnEyebrow>}
        <BtnText>{text}</BtnText>
        <BtnTooltip>{tooltip}</BtnTooltip>
      </BtnBody>
    </Btn>
  );
}
