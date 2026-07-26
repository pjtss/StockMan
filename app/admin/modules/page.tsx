import Link from "next/link";
import { AdminPageShell } from "@/components/admin-page-shell";
import { FEATURE_MODULES } from "@/lib/feature-modules";
import styles from "./modules.module.css";

export default function AdminModulesPage() {
  return <AdminPageShell eyebrow="FEATURE MODULES" title="기능별 운영 관리" description="기능별 ON/OFF, 스케줄, 실행 상태와 기능 전용 설정을 한 곳에서 관리합니다."><div className={styles.grid}>{FEATURE_MODULES.map((module) => <Link className={styles.card} href={module.settingsPath} key={module.key}><span>{module.key}</span><strong>{module.label}</strong><p>{module.description}</p><b>관리하기 →</b></Link>)}</div></AdminPageShell>;
}
