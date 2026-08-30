# 폭죽 애니메이션 모듈

## 목적

성공·달성·축하 이벤트에서 필요할 때만 호출할 수 있는 독립형 화면 오버레이를 제공한다.

## 사용법

```tsx
const [celebration, setCelebration] = useState(0);

<button onClick={() => setCelebration((value) => value + 1)}>축하</button>
<FireworksOverlay trigger={celebration} />
```

`trigger`가 이전 렌더링보다 증가하면 한 번 실행된다. `durationMs`로 재생 시간을, `bursts`로 폭죽 개수를 조정할 수 있다.

## 구현 기준

- 별도 UI 버튼을 포함하지 않는 캔버스 오버레이 모듈이다.
- 캔버스 입자에 x·y·z 좌표와 원근 배율을 적용해 3D 느낌을 낸다.
- 색상 팔레트, 빛 번짐, 중력, 감쇠를 적용해 화려한 폭발 효과를 만든다.
- `pointer-events: none`으로 기존 화면 조작을 방해하지 않는다.
- `prefers-reduced-motion` 환경에서는 입자 수와 폭발 횟수를 줄인다.
- Three.js 같은 추가 런타임 의존성은 사용하지 않는다.
