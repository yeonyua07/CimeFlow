# 릴리스 및 롤백 가이드 (Release & Rollback)

CimeFlow는 유의적 버전(Semantic Versioning) 원칙을 준수하여 릴리스를 관리합니다.

## 버전 체계 (Versioning)

- **Patch (x.x.Z)**: 버그 수정, 보안 패치, 단순 문서 수정.
- **Minor (x.Y.x)**: 하위 호환성을 유지하는 기능 추가 또는 운영 로직 개선.
- **Major (Z.x.x)**: 호환성이 깨지는 설정 변경, 아키텍처 변경, API 스펙 변경.

## 릴리스 프로세스

새로운 버전을 배포하기 전 다음 단계를 수행하세요:

1. `CHANGELOG.md` 업데이트 및 버전 명시.
2. 로컬 빌드 및 정적 검사 수행:
   ```bash
   npm ci
   npm run check
   npm audit
   npm run build
   ```
3. Docker 이미지 빌드 및 로컬 테스트:
   ```bash
   docker build -t cime-flow:v1.0.1 .
   ```
4. Git 태그 생성 및 푸시:
   ```bash
   git tag v1.0.1
   git push origin v1.0.1
   ```

*GitHub Actions 워크플로우를 통해 GHCR에 컨테이너 이미지가 자동으로 게시됩니다.*

## 이미지 태그 관리 전략

- **Version Pinned**: 프로덕션 환경에서는 반드시 `v1.0.1`과 같이 버전이 명시된 태그를 사용하세요.
- **Anti-pattern**: `latest` 태그를 운영 환경에 그대로 사용하는 것은 예기치 못한 장애의 원인이 될 수 있습니다.
- **Backup**: 롤백을 위해 직전 버전의 이미지를 레지스트리에 항상 유지하세요.

## 롤백 절차 (Rollback Procedure)

### Relay 서버 롤백
1. 특정 인스턴스에 대해 `/api/drain`을 호출하여 트래픽을 차단합니다.
2. `/api/ready` 상태가 `503`으로 변경되고 기존 세션이 정리될 때까지 대기합니다.
3. 해당 인스턴스의 이미지를 직전 버전으로 교체하여 배포합니다.
4. 인스턴스가 다시 `200 OK (Ready)` 상태가 되면 다음 인스턴스로 진행합니다 (Rolling Update).

### UI 서버 롤백
1. UI 컨테이너 이미지를 이전 버전으로 교체합니다.
2. `/api/health` 엔드포인트를 통해 서버 상태를 확인합니다.
3. 브라우저 사이드에서 Relay 서버와의 WebSocket 통신이 정상인지 최종 확인합니다.
