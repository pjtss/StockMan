import { getHealthSnapshot } from "@/lib/health-check";

export const dynamic = "force-dynamic";

function Check({ label, ok }: { label: string; ok: boolean }) {
  return <div className="healthCheck"><span className={ok ? "healthDot healthOk" : "healthDot healthBad"} />{label}<strong>{ok ? "정상" : "확인 필요"}</strong></div>;
}

export default async function HealthCheckPage() {
  const health = await getHealthSnapshot();
  return <main className="healthPage"><header><p className="healthEyebrow">STOCKMAN OPERATIONS</p><h1>시스템 상태 점검</h1><p>비밀값을 제외한 현재 배포·애플리케이션·데이터베이스 상태입니다.</p></header><section className="healthStatus"><span className={health.status === "ok" ? "healthDot healthOk" : "healthDot healthBad"} />{health.status === "ok" ? "정상 운영 중" : "일부 점검 필요"}<small>{new Date(health.checkedAt).toLocaleString("ko-KR")}</small></section><section className="healthGrid"><article><h2>배포 정보</h2><dl><dt>서비스</dt><dd>{health.service.name}</dd><dt>버전</dt><dd>{health.service.version}</dd><dt>커밋</dt><dd>{health.service.commit}</dd><dt>Node.js</dt><dd>{health.service.node}</dd><dt>가동 시간</dt><dd>{health.service.uptimeSeconds.toLocaleString()}초</dd></dl></article><article><h2>데이터베이스</h2><Check label="연결" ok={health.checks.database} /><Check label="Flyway 마이그레이션" ok={health.checks.flyway} /><p className="healthMuted">버전: {health.database.flywayVersion || "없음"}</p><p className="healthMuted">응답: {health.database.latencyMs}ms</p></article><article><h2>필수 설정</h2><Check label="필수 환경변수" ok={health.checks.requiredEnv} />{Object.entries(health.environment).map(([key, present]) => <div className="healthEnv" key={key}><span>{key}</span><b>{present ? "설정됨" : "미설정"}</b></div>)}</article></section></main>;
}
