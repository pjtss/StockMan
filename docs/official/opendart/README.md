# OpenDART 공식 문서 기준

확인일: 2026-08-29

## 공식 출처

- [OpenDART 공식 사이트](https://opendart.fss.or.kr/)
- [오픈API 서비스 목록](https://opendart.fss.or.kr/intro/infoApiList.do)
- [개발가이드](https://opendart.fss.or.kr/guide/main.do)
- [재무정보 일괄다운로드](https://opendart.fss.or.kr/disclosureinfo/fnltt/dwld/main.do)

## 프로젝트 적용 범위

- 정기보고서 주요 재무정보
- 단일회사 재무제표
- 단일회사 주요계정
- 단일회사 주요 재무지표
- XBRL 재무제표 원문 및 일괄 다운로드

OpenDART가 제공하는 재무정보는 제출인이 작성한 공시서류에서 추출된 정보이므로, 원문 공시와 비교 가능한 원문 식별자와 수집 시각을 함께 저장한다.

## 구현 원칙

1. 회사 식별은 종목코드와 DART 고유번호를 분리한다.
2. 보고서 종류·사업연도·보고기간·제출일을 모두 저장한다.
3. 정정 보고서는 기존 값을 삭제하지 않고 새 제출 버전으로 보존한다.
4. API 응답의 상태코드·메시지·원문을 수집 이력에 남긴다.
5. 인증키는 소스 코드와 문서에 저장하지 않는다.
