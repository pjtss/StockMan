# FDA 승인 일정 운영 문서

## 목적과 범위

이 문서는 미국 FDA의 의약품·생물의약품 허가 심사 목표일(PDUFA)과 FDA가 공지한 승인 결과를 지속적으로 기록·갱신하는 운영 기준이다. 의료기기 승인과 자문위원회 일정은 약물 PDUFA와 혼합하지 않고 별도 구분한다. 이 문서는 투자 판단이나 승인 확률을 제공하지 않는다.

기능 데이터 계약과 일정 화면은 [`../architecture/market-event-calendar-design.md`](../architecture/market-event-calendar-design.md), 개별 이벤트 분석은 [`us-market-event-analysis-standard.md`](./us-market-event-analysis-standard.md)를 따른다.

## 자료 출처와 확정도

1. **승인/거절/연장 결과**: FDA 공지, Drugs@FDA 및 FDA 승인 서한을 우선 사용한다. FDA가 모든 승인 또는 라벨 변경을 뉴스 기사로 공지하지 않으므로 FDA 뉴스룸 검색만으로 완전한 목록이라 단정하지 않는다.
2. **미래 PDUFA 목표일**: FDA는 전체 미래 PDUFA 목표일 달력을 공개하지 않는다. 회사 IR 보도자료, SEC 공시 또는 FDA의 개별 심사 자료에 날짜가 명시된 경우 해당 원문을 직접 연결해 `확정 목표일`로 기록한다.
3. 제3자 일정 사이트는 후보 발견 및 중복·지연 확인에만 사용한다. 이를 단독 근거로 확정하지 않는다.
4. ClinicalTrials.gov의 예상 주요 완료일, 회사의 분기 전망, 업계 예상일은 FDA 결정일과 구분해 각각 `임상 예상일` 또는 `비확정 일정`으로 기록한다.

## 상태 정의

| 상태 | 의미 |
|---|---|
| `확정 목표일` | 회사/FDA/SEC 1차 자료에 특정 PDUFA 목표일이 명시됨. 승인 결과는 미확정 |
| `비확정 일정` | 월·분기 범위 또는 제3자 추정만 있고 공식 특정일은 없음 |
| `조기 결정` | PDUFA 목표일 전에 FDA 결정이 확인됨. 실제 조치일과 목표일을 모두 보존 |
| `완료` | FDA가 승인, CRL, 거절, 철회 등 실제 조치를 공식 자료로 확인함 |
| `연장/변경` | FDA 또는 회사가 목표일 변경을 확인함. 이전 날짜를 이력으로 보존하고 새 날짜를 현재값으로 지정 |
| `검증 필요` | 상충, 파트너 중복, 원문 접근 불가 또는 출처의 최신성 불명으로 추가 확인이 필요함 |

PDUFA 목표일은 FDA의 심사 목표일이지 승인 보장, 발표 시각 또는 시장 반응 시각이 아니다. 날짜만 공지된 경우 ET 시각을 추정하지 않는다. 10월 미국 동부시간은 EDT(UTC−4)이므로 KST(UTC+9)로 환산할 때 날짜가 다음 날로 넘어갈 수 있다.

## 기록 필드

각 이벤트에 다음을 기록한다. 동일한 신청의 공동개발·사업화 파트너는 단일 신청 식별자로 묶고, 공개시장 티커만 복수 표기한다.

- 업체명, 티커, 신청 식별자, 제품/후보물질 및 일반명
- 적응증, 환자군, 신청 유형(NDA/BLA/sNDA/sBLA 등), 심사 유형(표준/우선/가속)
- 상태, 최초 목표일, 최신 목표일, 실제 결정일, 결정 결과
- ET 날짜·시각과 KST 날짜·시각(시각이 공식적으로 알려진 경우에 한함)
- 핵심 임상 근거와 수치, 반대 근거·규제 쟁점
- 원문 제목, 발행일, 출처 유형, 직접 URL, 마지막 대조일(KST)
- 미확인 사항 및 다음 확인 시점

공식 수치가 공개되지 않으면 `공식 수치 미공개`로 남긴다. 추정 승인확률, 임의 TAM·매출, 가격목표를 기록하지 않는다.

## 갱신 절차

1. 매월 초 대상 월의 후보 목표일을 수집한다. FDA 공식 자료, 회사 IR, SEC 공시를 우선 조회한다.
2. 각 후보의 원문에서 신청·제품·적응증·특정 목표일·심사 유형을 확인한다. 같은 신청을 파트너별로 중복 계상하지 않는다.
3. 예정일 5영업일 전, 목표일 당일, 이후 첫 영업일에 회사 IR/SEC와 FDA 공개 자료를 다시 확인한다. 조기결정·연장·CRL·승인은 상태와 실제 날짜를 업데이트하고 이전 값은 기록 이력에 남긴다.
4. FDA 공개 자료와 회사 설명이 다르면 양쪽 문구와 발행일을 보존하고 차이를 `검증 필요`로 표시한다.
5. 운영 캘린더 연동은 설계 문서와 API 계약을 따른다. 이번 운영 문서만으로 DB·API·예약 작업을 변경하지 않는다.
6. 검토자는 날짜·링크·중복·시간대 변환을 재확인하고 작업 목적, 범위, 변경 파일, 검증 및 배포 여부를 `DEVELOPMENT_LOG.md`에 기록한다.

## 2026년 10월 기준 일정

**기준일: 2026-10-04 KST.** 공식 회사 발표·공시에서 특정 목표일을 확인한 약물 심사만 아래 예정 목록에 둔다. 각 날짜는 목표일이며 결과가 아니다.

| 최신 상태 | PDUFA 목표일 ET → KST | 회사·티커 | 제품·신청 | 적응증/핵심 메모 | 1차 자료 |
|---|---|---|---|---|---|
| 확정 목표일 | 10/4 → 10/5 | Merck·Eisai (MRK) | WELIREG + LENVIMA 보충 신청 | 진행성 신세포암 | [Merck 2026 Q2 10-Q](https://www.merck.com/wp-content/uploads/sites/124/2026/08/MRK-06.30.2026-10Q-FINAL.pdf) |
| 확정 목표일 | 10/9 → 10/10 | Genentech/Roche (RHHBY) | Tecentriq 및 Tecentriq Hybreza sBLA | 수술 후 3기 dMMR/MSI-H 결장암. 3상 ATOMIC 712명; 회사 발표 DFS 36개월 86% 대 76% | [Genentech 발표](https://www.gene.com/media/press-releases/15116/2026-06-10/fda-grants-priority-review-for-genentech) |
| 확정 목표일 | 10/10 → 10/11 | Merck·Daiichi Sankyo (MRK) | Ifinatamab deruxtecan BLA | 백금계 요법 후 진행한 확장기 소세포폐암; 2상 근거, 우선심사 | [Merck 발표](https://www.merck.com/news/ifinatamab-deruxtecan-granted-priority-review-in-the-u-s-for-adult-patients-with-previously-treated-extensive-stage-small-cell-lung-cancer-who-experienced-disease-progression-on-or-after-platinum-bas/) |
| 확정 목표일 | 10/15 → 10/16 | Genentech/Roche (RHHBY) | Enspryng sBLA | 갑상선 안병증; 회사 발표상 10/15까지 결정 예상 | [Genentech 발표](https://www.gene.com/media/press-releases/15118/2026-06-29/fda-grants-priority-review-to-genentechs) |
| 확정 목표일 | 10/17 → 10/18 | Opus Genetics·Viatris (IRD/VTRS) | Phentolamine ophthalmic solution 0.75% sNDA | 노안; 파트너별 두 건이 아니라 같은 신청 한 건 | [Opus 발표](https://ir.opusgtx.com/press-releases/detail/519/opus-genetics-announces-fda-acceptance-of-supplemental-new-drug-application-for-phentolamine-ophthalmic-solution-0-75-for-the-treatment-of-presbyopia) |
| 확정 목표일 | 10/26 → 10/27 | GSK (GSK) | Bepirovirsen NDA | 성인 만성 B형간염; 우선심사·혁신치료제 지정 | [GSK 발표](https://www.gsk.com/en-gb/media/press-releases/bepirovirsen-accepted-for-priority-review-and-granted-breakthrough-therapy-designation-by-the-us-fda/) |
| 확정 목표일 | 10/29 → 10/30 | Sun Pharma | ILUMYA sBLA | 성인 활동성 건선성 관절염 | [Sun Pharma 발표](https://sunpharma.com/wp-content/uploads/2026/03/Sun-Pharma-Announces-US-FDA-Acceptance-of-sBLA-Application-for-ILUMYA.pdf) |
| 확정 목표일 | 10/30 → 10/31 | INOVIO (INO) | INO-3107 BLA | 성인 재발성 호흡기 유두종증; FDA의 가속승인 경로 적격성 잠재 검토 문제가 회사 공시에 기재됨 | [INOVIO 발표](https://ir.inovio.com/news/news-details/2025/FDA-Accepts-for-Review-INOVIOs-BLA-for-INO-3107-for-the-Treatment-of-Adults-with-Recurrent-Respiratory-Papillomatosis-RRP/default.aspx) |

### 10월 완료 승인 기록

| 실제 조치일 | 상태·기관 | 제품/조치 | 세부사항 | 원문 |
|---|---|---|---|---|
| 10/1/2026 | 완료·FDA 의료기기 | Autus Size-Adjustable Valve | 선천성 폐동맥판 질환 소아 대상 조절식 판막; 약물 PDUFA와 별도 분류 | [FDA 승인 공지](https://www.fda.gov/news-events/press-announcements/fda-approves-first-heart-valve-designed-grow-children) |
| 10/2/2026 | 완료·FDA 약물 | Pirtobrutinib (Jaypirca) | 17p 결손이 알려지지 않은 성인 미치료 CLL/SLL 적응증 승인 | [FDA 승인 공지](https://www.fda.gov/drugs/resources-information-approved-drugs/fda-approves-pirtobrutinib-previously-untreated-chronic-lymphocytic-leukemia-or-small-lymphocytic) |

FDA는 모든 의약품 승인·라벨 변경을 보도자료로 알리지 않을 수 있다. 따라서 완료 승인 표는 확인된 공지의 기록이지, 해당 월의 FDA 승인 전체 목록이라고 보장하지 않는다.

## 확인 및 감사 체크리스트

- [ ] 모든 예정 행에 1차 원문과 정확한 신청/적응증이 연결됨
- [ ] 목표일과 실제 조치일이 서로 다른 필드/상태로 보존됨
- [ ] 공동개발 파트너의 동일 신청을 한 번만 계상함
- [ ] 조기결정·연장·철회·CRL을 삭제하지 않고 이력으로 남김
- [ ] ET/KST 날짜 환산을 검산했고 미공개 발표 시각은 비워 둠
- [ ] FDA 뉴스룸의 비전수 공지 가능성과 비공식 집계의 지연·중복을 명시함
- [ ] 마지막 확인 시각과 변경/검증 결과를 DEVELOPMENT_LOG.md에 기록함

