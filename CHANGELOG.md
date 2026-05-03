# Changelog

이 파일은 [Keep a Changelog](https://keepachangelog.com/ko/1.0.0/) 형식을 따르며,
버전 관리는 [Semantic Versioning](https://semver.org/lang/ko/)을 따릅니다.

## [1.0.0] - 2026-05-03

### Added
- **시청자 추첨**: 실시간 채팅 참여자를 수집하고 랜덤 추첨 (dedup 중복 제거 지원)
- **숫자 투표**: `!투표 N` 명령어 파싱 기반 실시간 투표 집계
- **후원 가중치 투표**: 후원 금액 비례 가중치 투표
- **룰렛**: 투표 결과 임포트 및 인터랙티브 룰렛 (최대 19개 항목)
- **Relay 서버**: ci.me IVS Chat WebSocket 중계, 배치 발송, IP/채널 레이트 리밋
- **Redis 지원**: 다중 인스턴스 분산 환경에서 활성 카운터 공유 (선택 사항)
- **Prometheus 메트릭**: `/metrics` 엔드포인트 (Grafana 대시보드 포함)
- **그레이스풀 드레인**: SIGTERM 수신 시 기존 세션 보호 후 종료
- **Docker / Docker Compose**: 멀티 스테이지 빌드 및 컨테이너 오케스트레이션
- **PM2**: `ecosystem.config.js` 기반 프로세스 관리
- **GitHub Actions**: CI (빌드·감사), CodeQL 보안 분석, Docker 이미지 자동 배포
- **다크/라이트 테마** 및 **줌(Zoom)** 기능
- **TTS(Web Speech API)**: 채팅 및 후원 메시지 음성 읽기
