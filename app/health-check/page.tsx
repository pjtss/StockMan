import { getHealthSnapshot } from "@/lib/health-check";

export const dynamic = "force-dynamic";

function Check({ label, ok }: { label: string; ok: boolean }) {
  return <div className="healthCheck"><span className={ok ? "healthDot healthOk" : "healthDot healthBad"} />{label}<strong>{ok ? "정상" : "확인 필요"}</strong></div>;
}

function metricsText(metrics: Record<string, unknown> | undefined) {
  if (!metrics || Object.keys(metrics).length === 0) return "결과 지표 없음";
  return Object.entries(metrics).map(([key, value]) => `${key}=${String(value)}`).join(" · ");
}

export default async function HealthCheckPage() {
  const health = await getHealthSnapshot();
  const missingTables = health.database.missingTables;
  return <main className="healthPage"><header><p className="healthEyebrow">STOCKMAN OPERATIONS</p><h1>시스템 상태 점검</h1><p>비밀값을 제외한 현재 배포·애플리케이션·데이터베이스 상태입니다.</p></header><section className="healthStatus"><span className={health.status === "ok" ? "healthDot healthOk" : "healthDot healthBad"} />{health.status === "ok" ? "정상 운영 중" : "일부 점검 필요"}<small>{new Date(health.checkedAt).toLocaleString("ko-KR")}</small></section><section className="healthGrid"><article><h2>배포 정보</h2><dl><dt>서비스</dt><dd>{health.service.name}</dd><dt>버전</dt><dd>{health.service.version}</dd><dt>커밋</dt><dd>{health.service.commit}</dd><dt>Node.js</dt><dd>{health.service.node}</dd><dt>가동 시간</dt><dd>{health.service.uptimeSeconds.toLocaleString()}초</dd></dl></article><article><h2>데이터베이스</h2><Check label="DB 연결" ok={health.checks.databaseConnection} /><Check label="스키마 준비" ok={health.checks.schema} /><Check label="Flyway 마이그레이션" ok={health.checks.flyway} /><p className="healthMuted">버전: {health.database.flywayVersion || "없음"}</p><p className="healthMuted">응답: {health.database.latencyMs}ms</p>{missingTables.length > 0 && <p className="healthMuted">누락 테이블: {missingTables.join(", ")}</p>}</article><article><h2>필수 설정</h2><Check label="필수 환경변수" ok={health.checks.requiredEnv} />{Object.entries(health.environment).map(([key, present]) => <div className="healthEnv" key={key}><span>{key}</span><b>{present ? "설정됨" : "미설정"}</b></div>)}</article></section><section className="healthGrid"><article><h2>자동화 커버리지</h2><p className="healthMuted">OCI cron 등록 {health.automationCoverage.observed.length}/{health.automationCoverage.expected.length}</p>{health.automationCoverage.neverRun.length > 0 ? <p className="healthMuted">실행 이력 없음: {health.automationCoverage.neverRun.join(", ")}</p> : <p className="healthMuted">등록된 모든 자동화에 실행 이력이 있습니다.</p>}</article><article><h2>최근 자동화 실행</h2>{Object.entries(health.automation).length === 0 ? <p className="healthMuted">실행 이력 없음</p> : Object.entries(health.automation).map(([key, run]) => <div className="healthEnv" key={key}><span>{key}</span><div><b>{run.status}</b><small className="healthMuted">{metricsText(run.metrics)}</small></div></div>)}</article></section></main>;
}
