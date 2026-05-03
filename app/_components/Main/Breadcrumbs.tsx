import { type IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { faHouse, faChevronRight } from "@fortawesome/free-solid-svg-icons";
import {
  Container,
  BreadcrumbLink,
  BreadcrumbButton,
  Icon,
  Text,
  Next,
} from "./Breadcrumbs.styled";

export default function Breadcrumbs({
  icon,
  text,
}: {
  icon: IconDefinition;
  text: string;
}) {
  function handleClickSelf() {
    location.reload();
  }

  return (
    <Container>
      <BreadcrumbLink href="/">
        <Icon icon={faHouse} height={14} />
        <Text>홈</Text>
      </BreadcrumbLink>
      <Next icon={faChevronRight} height={12} />
      <BreadcrumbButton onClick={handleClickSelf}>
        <Icon icon={icon} height={14} />
        <Text>{text}</Text>
      </BreadcrumbButton>
    </Container>
  );
}
