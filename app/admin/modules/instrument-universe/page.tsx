import { AdminPageShell } from "@/components/admin-page-shell";
import { AdminInstrumentUniverseImport } from "@/components/admin-instrument-universe-import";

export default function AdminInstrumentUniversePage() {
  return <AdminPageShell eyebrow="INSTRUMENT UNIVERSE" title="전체 종목 마스터 적재" description="KIS 국내·해외 종목 마스터 파일을 신규 유니버스 테이블에 적재합니다.">
    <AdminInstrumentUniverseImport />
  </AdminPageShell>;
}
