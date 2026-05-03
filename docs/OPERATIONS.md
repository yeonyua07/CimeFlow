# 운영 가이드

이 문서는 CimeFlow를 실제 프로덕션 환경에서 운영하는 담당자를 위한 가이드입니다.

## 권장 운영 아키텍처

- **리버스 프록시**: UI와 Relay 서버 앞에 Nginx, Caddy 또는 로드 밸런서(ALB/NLB)를 배치하세요.
- **고가용성(HA)**: 가용성 확보를 위해 최소 2개 이상의 Relay 레플리카(Replica)를 운영하세요.
- **상태 공유**: `REDIS_URL`을 설정하여 여러 인스턴스 간에 레이트 리밋(Rate Limit)과 활성 세션 카운트를 동기화하세요.
- **세션 고정(Sticky Session)**: 동일한 채널의 WebSocket 커넥션은 동일한 Relay 인스턴스로 전달되어야 합니다. (제공된 Nginx 설정의 Consistent Hashing 참고)
- **보안**: 
    - `CORS_ORIGIN`을 실제 서비스 도메인으로 제한하세요.
    - 프록시 환경에서만 `TRUST_PROXY=true`를 활성화하세요.
    - 외부 노출 시 `METRICS_TOKEN`과 `ADMIN_TOKEN`으로 엔드포인트를 보호하세요.

## 모니터링 엔드포인트

- **UI 헬스 체크**: `GET http://localhost:3000/api/health`
- **Relay 헬스 체크**: `GET http://localhost:3001/api/health` (프로세스 상태 및 설정 확인)
- **Relay 준비 상태**: `GET http://localhost:3001/api/ready` (Liveness/Readiness Probe용)
- **프로메테우스 지표**: `GET http://localhost:3001/metrics`
    - 토큰 설정 시: `Authorization: Bearer <METRICS_TOKEN>` 헤더 필요

## 안전 종료 및 드레인

업데이트나 점검을 위해 Relay 인스턴스를 종료하기 전, 해당 인스턴스를 드레인 상태로 전환하여 기존 세션을 안전하게 종료하세요.

**드레인 시작**:
```bash
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" http://localhost:3001/api/drain
```

**드레인 취소 (복구)**:
```bash
curl -X DELETE -H "Authorization: Bearer $ADMIN_TOKEN" http://localhost:3001/api/drain
```

**드레인 시 동작**:
1. `/api/ready` 엔드포인트가 `503 Service Unavailable`을 반환하여 로드 밸런서 타겟에서 제외됩니다.
2. 신규 WebSocket 연결 시도가 `SERVER_DRAINING` 에러와 함께 차단됩니다.
3. 기존 세션은 클라이언트가 종료하거나 `DRAIN_TIMEOUT_MS`에 도달할 때까지 유지됩니다.

## 주요 장애 시나리오 및 조치

### 1. Redis 연결 실패 (Redis Down)
- **증상**: `/api/health`에서 `redisEnabled: false` 확인, 메트릭의 `redis_errors_total` 수치 증가.
- **영향**: 분산 레이트 리밋이 작동하지 않고 각 프로세스별 로컬 메모리 기준으로 동작함.
- **조치**: Redis 서비스 상태 확인 및 네트워크 설정 점검. Relay 서버는 재시작 없이 자동 복구 시도를 지속함.

### 2. ci.me 토큰 획득 실패 (Token Fetch Errors)
- **증상**: `token_fetch_failed_total` 지표 상승, 로그에 `TOKEN_RETRY` 이벤트 기록.
- **영향**: 신규 채널 허브 생성이 불가능하거나 업스트림 연결이 지연됨.
- **조치**: ci.me API 서버 상태 확인. 특정 채널만 문제라면 해당 채널의 유효성 확인. 대규모 장애 시 불필요한 인스턴스 증설은 업스트림 부하를 가중시키므로 주의.

### 3. 업스트림 재연결 횟수 증가 (Upstream Reconnects)
- **증상**: `upstream_reconnect_total` 지표 상승, 사용자의 재연결 대기 시간 발생.
- **영향**: 채팅 실시간성 저하.
- **조치**: 
    - Relay 서버와 IVS Chat 서버 간 네트워크 경로 점검.
    - 리버스 프록시의 WebSocket Idle Timeout 설정 확인 (최소 1시간 권장).
    - 로드 밸런서의 Consistent Hashing 설정 정상 여부 확인.

### 4. 메모리 사용량 지속 증가 (Memory Leak)
- **증상**: `memoryMB` 지표가 지속적으로 우상향하며 GC 후에도 회수되지 않음.
- **조치**: 
    - 특정 채널에 과도한 클라이언트가 몰려있는지 확인.
    - `MAX_CLIENTS_PER_CHANNEL` 제한값 조정.
    - 순차적 드레인 후 인스턴스 재시작(Rolling Restart) 수행.

## 부하 테스트 (Load Testing)

프로덕션 투입 전 가상 업스트림 모드를 활성화하여 팬아웃 성능을 검증하세요.

```bash
# 가상 모드로 리레이 서버 실행
MOCK_CIME_UPSTREAM=1 npm run start:relay

# 부하 테스트 스크립트 실행 (500클라이언트, 100채널 대상)
npm run ops:load -- --clients 500 --channels 100 --duration 60 --ramp 20
```

## 이전 버전 복구 (롤백)

1. **순차 롤백**: 한 번에 모든 인스턴스를 교체하지 말고, 하나씩 드레인 후 이전 버전의 이미지로 교체하세요.
2. **버전 고정**: 운영 환경에서는 반드시 특정 버전 태그(`v1.0.1` 등)를 사용하여 이미지를 배포하세요.
3. **환경 변수 확인**: 롤백 전후로 업스트림 URL 및 포트 설정이 변경되었는지 확인하세요.
