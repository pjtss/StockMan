# 미국주식 공매도 원가·압박구간·숏스퀴즈 탐지 시스템 설계 명세서

## 1. 목적

본 시스템은 미국 주식의 공매도 데이터를 수집·분석하여 다음 정보를 **추정**하는 것을 목적으로 한다.

| 목표 | 설명 |
|---|---|
| 공매도 진입 가격대 | Short Sale 거래가 집중된 가격 구간 추정 |
| 공매도 평균 원가 | 현재 잔존 숏 포지션의 평균 진입가 추정 |
| 공매도 손익 상태 | 현재가 대비 숏 포지션 수익/손실 추정 |
| 공매도 압박 구간 | 숏 손실이 커지기 시작하는 가격대 탐지 |
| 숏스퀴즈 가능성 | Short Interest, CTB, 거래량 등을 종합해 점수화 |
| 급등주 선별 | 기존 급등주 스캐너의 추가 판단지표로 활용 |

> 개별 투자자·기관의 실제 공매도 진입가격이나 강제청산가격을 알아내는 시스템이 아니다.

---

## 2. 핵심 개념

공매도 흐름:

**Borrow → Short Sale → Position 유지 → Buy to Cover**

공매도 가격 손익의 기준은 **주식을 빌린 시점이 아니라 Short Sale 체결가격**이다.

따라서 시스템에서 계산할 핵심 값은 다음과 같다.

### Estimated Short Cost Basis

현재 살아 있을 가능성이 높은 숏 포지션의 **추정 평균 진입가격**.

- **현재가 < 추정 숏 원가** → 숏 투자자 수익권
- **현재가 ≈ 추정 숏 원가** → 손익분기 구간
- **현재가 > 추정 숏 원가** → 숏 투자자 손실권

---

## 3. 분석 대상

| 항목 | 범위 |
|---|---|
| 시장 | NASDAQ / NYSE / AMEX |
| 자산 | 미국 개별 보통주 |
| ETF | 제외 |
| Leveraged ETF | 제외 |
| SPAC | 필요 시 별도 처리 |
| 우선주 | 기본 제외 |
| ADR | 포함 가능 |
| 분석 단위 | 티커 |

기존 급등주 스캐너 Universe와 동일한 종목군을 사용할 수 있다.

---

## 4. 필요 데이터

### 4.1 필수 데이터

| 데이터 | 역할 | 중요도 |
|---|---|---:|
| Short Sale 가격 | 숏 진입가격 추정 | ★★★★★ |
| Short Sale 수량 | 가격대별 숏 집중도 계산 | ★★★★★ |
| Short Interest | 현재 미청산 숏 규모 | ★★★★★ |
| Float | SI / Float 계산 | ★★★★★ |
| 현재가 | 숏 손익 계산 | ★★★★★ |
| 거래량 | Cover 가능성 판단 | ★★★★★ |
| 평균 거래량 | Days To Cover 계산 | ★★★★ |

### 4.2 고급 데이터

| 데이터 | 역할 |
|---|---|
| Cost To Borrow | 숏 포지션 유지 부담 |
| Short Availability | 추가 공매도 가능 물량 |
| Utilization | 대차시장 포화 상태 |
| Shares On Loan | 실제 대차 규모 |
| Average Age On Loan | 현재 숏의 생성 시점 추정 |
| DTC | 숏 청산 난이도 |
| RVOL | 급격한 매수압력 탐지 |
| Intraday Price | 실시간 압박구간 돌파 판단 |

---

## 5. 데이터 소스 설계

### 무료 구성

| 데이터 | 후보 소스 |
|---|---|
| Short Sale Volume | FINRA |
| Short Sale Transaction | FINRA |
| Short Interest | FINRA / Nasdaq / 거래소 |
| 가격 | KIS Open API |
| 거래량 | KIS Open API |
| Float | 기존 Float 공급원 |
| RVOL | 자체 계산 |
| DTC | 자체 계산 |

무료 버전의 핵심은 **FINRA + KIS + Float 데이터** 조합으로 한다.

### 유료 확장

| 서비스 | 주요 추가 데이터 |
|---|---|
| ORTEX | Estimated SI, CTB, Utilization, Average Age |
| S3 Partners | Estimated SI, Short P&L, Squeeze 관련 데이터 |
| NYSE | 거래소 Short Sale 데이터 |
| Cboe | Short Trade 데이터 |

### 권장 단계

1. 무료 데이터 기반 구현
2. ORTEX 또는 유사 대차 데이터 추가
3. 거래소별 Short Trade 데이터 추가

---

## 6. 주요 분석 지표

### 6.1 Short Volume Profile

Short Sale 거래를 가격 구간별로 집계한다.

| 가격대 | Short Volume | 비중 |
|---:|---:|---:|
| $2.80~2.89 | 120K | 8% |
| $2.90~2.99 | 310K | 20% |
| **$3.00~3.09** | **680K** | **44%** |
| $3.10~3.19 | 280K | 18% |
| $3.20~ | 150K | 10% |

이를 통해 숏 거래가 가장 많이 발생한 **Short Cost Zone**을 찾는다.

---

## 7. Estimated Short VWAP

Short Sale 가격과 거래량으로 VWAP를 계산한다.

**Σ(Short Price × Short Volume) / Σ Short Volume**

예:

- Estimated Short VWAP: **$3.06**
- 현재가: **$3.32**
- 단순 기준 숏 손실: 약 **8.5%**

단순 Short VWAP는 이미 청산된 숏도 포함하므로 그대로 사용하지 않는다.

---

## 8. 잔존 숏 원가 추정

과거 발생한 모든 Short Sale이 현재 존재한다고 가정하면 안 된다.

따라서 Short Interest 변화를 이용해 **잔존 포지션을 추정**한다.

### 기본 원칙

- Short Interest 증가 → 신규 숏 포지션 가중치 증가
- Short Interest 감소 → 기존 Short Position 일부 청산된 것으로 처리
- 오래된 Short Sale → 현재 잔존 가능성을 낮게 평가
- 최근 Short Sale → 높은 가중치 적용

---

## 9. 시간 감쇠

Short Sale 거래는 시간이 지날수록 잔존 가능성을 낮게 본다.

| Short 발생 시점 | 가중치 |
|---|---:|
| 최근 | 높음 |
| 중기 | 보통 |
| 오래됨 | 낮음 |

Average Age On Loan 데이터가 존재하면 시간 감쇠 모델을 더욱 정밀하게 조정한다.

---

## 10. Estimated Active Short Cost Basis

최종적으로 다음 요소를 합쳐 계산한다.

**Short Sale Price × Short Volume × 잔존 가능성 × 시간 가중치 × Short Interest 변화량**

그 결과를 **Estimated Active Short Cost Basis**로 정의한다.

예: **$3.08**

---

## 11. 숏 손익 상태

현재가를 Estimated Active Short Cost Basis와 비교한다.

| 현재 가격 상태 | 판단 |
|---|---|
| Short Cost 대비 -20% 이하 | 숏 매우 안전 |
| -10 ~ -20% | 숏 수익권 |
| -5 ~ +5% | 손익분기 구간 |
| +5 ~ +10% | 숏 압박 시작 |
| +10 ~ +20% | 강한 압박 |
| +20% 이상 | 매우 강한 압박 |

절대적인 강제청산 기준으로 사용하지 않는다.

---

## 12. Borrow Pressure

가격 손실뿐 아니라 대차비용도 반영한다.

평가 대상:

- Cost To Borrow
- Utilization
- Short Availability
- Shares On Loan

| 상태 | 의미 |
|---|---|
| CTB 낮음 | 숏 유지 부담 낮음 |
| CTB 급등 | 숏 유지비용 증가 |
| Utilization 100% 근접 | 대차 공급 부족 |
| Short Availability 감소 | 신규 숏 공격 제한 |

---

## 13. Short Interest Pressure

### SI % Float

**Short Interest / Float × 100**

| SI % Float | 평가 |
|---:|---|
| <5% | 낮음 |
| 5~10% | 보통 |
| 10~20% | 높음 |
| 20~30% | 매우 높음 |
| >30% | 극단적 |

단독으로 숏스퀴즈 판단에 사용하지 않는다.

---

## 14. Days To Cover

**Short Interest / 평균 거래량**

예:

- Short Interest: 5,000,000주
- 평균 거래량: 1,000,000주
- DTC: **5일**

DTC가 높을수록 숏 포지션 전체가 빠르게 청산하기 어려운 상태로 본다.

---

## 15. 거래량 압력

숏스퀴즈에는 단순 숏 비율보다 **실제 매수세 발생 여부**가 중요하다.

| 지표 | 의미 |
|---|---|
| RVOL | 평소 대비 거래량 |
| 거래대금 증가 | 실제 자금 유입 |
| Volume Breakout | 거래량 폭발 |
| Price Breakout | 저항선 돌파 |
| VWAP | 장중 매수우위 판단 |

---

## 16. 기술적 돌파 결합

숏 데이터만으로 신호를 발생시키지 않는다.

다음 조건이 동반될 경우 높은 점수를 준다.

- 이전 고점 돌파
- 장기 매물대 돌파
- VWAP 상향 돌파
- 거래량 급증
- 볼린저밴드 상단 돌파
- MACD 상승
- DMI `+DI > -DI`
- ADX 상승
- OBV 상승
- ADL 상승
- MFI 상승
- Golden Cross

---

## 17. Short Pressure Zone

| 가격 | 상태 |
|---:|---|
| < $2.80 | 숏 안전구간 |
| $2.80~3.05 | 숏 수익 축소 |
| **$3.05~3.10** | **추정 숏 원가** |
| $3.10~3.25 | 압박구간 |
| $3.25~3.40 | 강한 압박 |
| > $3.40 | Squeeze Risk Zone |

이는 강제청산 가격을 의미하지 않는다.

**시장 내 숏 포지션에 손실 압력이 커질 가능성이 높은 가격대**를 의미한다.

---

## 18. Squeeze Score

최종 결과를 0~100점으로 표준화한다.

| 요소 | 배점 |
|---|---:|
| SI % Float | 15 |
| Estimated Short P/L | 20 |
| Cost To Borrow | 10 |
| Utilization | 10 |
| Short Availability | 5 |
| Days To Cover | 10 |
| RVOL | 10 |
| 거래량 증가 | 5 |
| 가격 돌파 | 10 |
| 기술적 추세 | 5 |
| **합계** | **100** |

---

## 19. 점수 등급

| 점수 | 등급 | 해석 |
|---:|---|---|
| 0~39 | LOW | Squeeze 가능성 낮음 |
| 40~59 | WATCH | 관찰 |
| 60~74 | HIGH | 조건 양호 |
| 75~89 | VERY HIGH | 강한 후보 |
| 90~100 | EXTREME | 최우선 감시 |

---

## 20. 강한 숏스퀴즈 후보 조건

### 숏 구조

- SI % Float 높음
- CTB 높음 또는 상승
- Utilization 높음
- Availability 감소
- DTC 높음

### 가격 구조

- 현재가 > Estimated Short Cost Basis
- 주요 Short Cost Zone 상향 돌파
- 이전 고점 돌파

### 수급 구조

- RVOL 급증
- 거래대금 증가
- OBV 상승
- ADL 상승

### 기술 구조

- MACD 강세
- DMI 강세
- Golden Cross
- 추세 강도 상승

---

## 21. 탐지 상태

| 상태 | 의미 |
|---|---|
| NORMAL | 특별한 Short Pressure 없음 |
| WATCH | 숏 구조상 관심 필요 |
| PRESSURE | 숏 손실 발생 |
| HIGH_PRESSURE | 숏 손실 + 대차 압박 |
| SQUEEZE_READY | 숏 구조 + 거래량 + 가격 돌파 |
| SQUEEZE_ACTIVE | 급격한 가격/거래량 상승 진행 |

---

## 22. SQUEEZE_READY 예시

| 지표 | 값 |
|---|---:|
| Float | 8M |
| Short Interest | 2.4M |
| SI Float | 30% |
| Estimated Short Cost | $2.85 |
| Current | $3.18 |
| Short P/L | -11.6% |
| CTB | 110% |
| Utilization | 99% |
| Availability | 15K |
| DTC | 4.1 |
| RVOL | 5.8x |

현재가가 주요 저항선을 돌파한 경우 **SQUEEZE_READY** 또는 **VERY HIGH**로 분류한다.

---

## 23. 출력 명세

| 항목 | 예시 |
|---|---|
| 티커 | ABC |
| 현재가 | $3.18 |
| Estimated Short Cost | $2.85 |
| Short P/L | -11.6% |
| SI Float | 30.2% |
| CTB | 110% |
| Utilization | 99% |
| Availability | 15K |
| DTC | 4.1 |
| RVOL | 5.8x |
| Pressure Zone | $2.85~3.30 |
| Squeeze Score | **91** |
| 상태 | **EXTREME** |

---

## 24. 최종 사용자 화면

### ABC — SQUEEZE EXTREME · 91점

| 구분 | 값 |
|---|---:|
| 현재가 | $3.18 |
| 숏 추정 원가 | **$2.85** |
| 숏 손실 추정 | **-11.6%** |
| SI / Float | **30.2%** |
| CTB | **110%** |
| Utilization | **99%** |
| Short Available | **15K** |
| DTC | **4.1일** |
| RVOL | **5.8x** |
| 핵심 압박구간 | **$3.10~3.30** |

판정:

**현재 숏 평균 원가 상단을 돌파했으며 대차 공급도 매우 부족하다. 거래량 증가와 $3.30 돌파가 동반될 경우 숏스퀴즈 위험이 크게 증가한 상태.**

---

## 25. 알림 조건

### 조건 A — 신규 Squeeze Ready

Squeeze Score가 처음으로 **75점 이상**

### 조건 B — Extreme

Squeeze Score **90점 이상**

### 조건 C — Short Cost Breakout

현재가가 Estimated Short Cost Basis를 강한 거래량과 함께 상향 돌파

### 조건 D — Pressure Zone Breakout

High Pressure Zone 상단 돌파

---

## 26. 기존 급등주 탐지 시스템과의 관계

본 모듈은 독립적인 매수 스캐너가 아니다.

**뉴스/호재  
→ Float / 거래대금  
→ 일봉 기술적 추세  
→ Short Structure  
→ Short Cost Basis  
→ Short Pressure  
→ Squeeze Score  
→ 최종 급등 가능성 평가**

즉, 본 시스템의 역할은:

**“이미 상승 조건을 갖춘 종목에서 공매도가 상승폭을 증폭시킬 가능성이 있는지 판단하는 것”**

이다.

---

## 27. 데이터 신뢰도 관리

| 등급 | 조건 |
|---|---|
| A | Short 거래 + SI + 대차 데이터 모두 확보 |
| B | Short 거래 + SI 확보 |
| C | Short Volume + SI |
| D | SI만 존재 |

예:

**Squeeze Score 91 / Data Confidence A**

---

## 28. 시스템의 한계

본 시스템으로 알 수 없는 정보:

- 특정 헤지펀드의 숏 진입가격
- 개별 투자자의 숏 진입가격
- 개별 계좌의 증거금
- 실제 Margin Call 가격
- 정확한 강제청산 가격
- Short Sale 이후 실제 어떤 포지션이 Cover됐는지
- 헤지 포지션 존재 여부

따라서 시스템 결과는 모두 **Estimated / 추정**이라는 성격을 유지한다.

---

## 29. 핵심 설계 원칙

1. **Short Volume ≠ Short Interest**
2. 단순 Short VWAP를 현재 숏 평균 원가라고 부르지 않는다.
3. Short Interest 변화를 통해 잔존 가능성을 보정한다.
4. 숏스퀴즈는 공매도 데이터만으로 판단하지 않는다.
5. 반드시 가격 돌파와 거래량 유입을 동시에 본다.
6. 정확한 강제청산가격을 제공한다고 표현하지 않는다.
7. 데이터 부족 시 신뢰도 등급을 낮춘다.

---

## 30. 최종 시스템 정의

본 시스템은:

> **가격별 Short Sale 거래, Short Interest, Float, 대차시장 상태, 가격 및 거래량 데이터를 결합해 현재 잔존 공매도의 평균 원가와 손실 압박 구간을 추정하고, 실제 가격 돌파 및 거래량 유입 발생 시 숏스퀴즈 가능성을 점수화하는 분석 시스템**

으로 정의한다.

### 핵심 산출값

1. **Estimated Short Cost Basis**
2. **Short Cost Zone**
3. **Estimated Short P/L**
4. **Short Pressure Zone**
5. **Borrow Pressure**
6. **Squeeze Score**
7. **Squeeze State**
8. **Data Confidence**
