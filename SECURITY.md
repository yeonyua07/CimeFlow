# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 1.x     | ✅        |

## Reporting a Vulnerability

보안 취약점을 발견하신 경우 DISCORD yeonyua로 제보 부탁드립니다.

제보 시 아래 정보를 포함해 주시면 빠른 처리에 도움이 됩니다:

- 취약점 유형 및 영향 범위
- 재현 절차 (가능하면 PoC 코드)
- 영향을 받는 버전

제보를 받으면 **7일 이내**에 확인 응답을 드리며, 심각도에 따라 패치를 진행합니다.

## Security Considerations

CimeFlow는 다음과 같은 보안 설계를 따릅니다:

- **IP 해싱**: 기본적으로 IP 주소를 SHA-256으로 해시하여 로그에 저장합니다 (`LOG_IP_MODE=hash`).
- **데이터 비저장**: 채팅 메시지, 시청자 목록, 토큰은 어떠한 영구 저장소에도 기록되지 않습니다.
- **레이트 리밋**: HTTP 요청 및 WebSocket 연결을 IP 기준으로 제한합니다.
- **CORS**: `CORS_ORIGIN` 환경 변수로 허용 오리진을 제한할 수 있습니다.
- **API 토큰**: `/metrics` 및 `/api/drain` 엔드포인트는 Bearer 토큰으로 보호됩니다.

프로덕션 배포 시 `CORS_ORIGIN=*` 대신 실제 도메인을 지정하고, `METRICS_TOKEN`과 `ADMIN_TOKEN`을 반드시 설정하세요.
