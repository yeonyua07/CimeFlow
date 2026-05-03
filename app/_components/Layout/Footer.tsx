import {
  Container,
  Inner,
  Copyright,
  Thirdparty,
  FooterLink,
  Terms,
} from "./Footer.styled";

export default function Footer() {
  return (
    <Container>
      <Inner>
        <Copyright>&copy; CimeFlow</Copyright>
        <Thirdparty>
          {"CimeFlow는 "}
          <FooterLink href="https://ci.me/" target="_blank">
            ci.me
          </FooterLink>
          {" 채팅을 활용하는 써드파티 오픈소스 프로젝트이며 ci.me에서 운영하는 사이트가 아닙니다"}
        </Thirdparty>
      </Inner>
      <Inner>
        <Terms>
          <FooterLink href="/terms/privacy" target="_blank">
            개인정보처리방침
          </FooterLink>
        </Terms>
      </Inner>
    </Container>
  );
}
