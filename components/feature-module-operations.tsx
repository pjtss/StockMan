"use client";

import { useEffect, useState } from "react";
import type { FeatureModuleKey } from "@/lib/feature-modules";
import { MARKET_RSS_SOURCES } from "@/lib/market-rss-sources";
import styles from "./feature-module-operations.module.css";

type ModuleSettings = {
  enabled: boolean;
  startTime: string;
  endTime: string;
  scheduleMode: "daily-window" | "weekly-range";
  startDay: number;
  endDay: number;
  cooldownSeconds: number;
  intervalSeconds: number;
  activeDays: number[];
  featureSettings?: {
    discordFormat?: { webhookUrl?: string; debugWebhookUrl?: string };
    evaluation?: { mfiThreshold?: number; obvSignalPeriod?: number; obvSignalAboveDays?: number; obvSignalCrossLookback?: number };
    marketRss?: { enabledSources?: string[] };
    secEdgar?: { ciks?: string[]; syncXbrl?: boolean; discordBatch?: number };
    vwapPolicy?: Record<string, number | boolean>;
    bollingerPolicy?: { period?: number; stdDevMultiplier?: number; minPrice?: number; minVolume?: number; minTurnoverRatio?: number };
    krBollingerPolicy?: { period?: number; stdDevMultiplier?: number; minPrice?: number; minVolume?: number; minTurnoverRatio?: number };
  };
};

const DEFAULT_SETTINGS: ModuleSettings = {
  enabled: true,
  startTime: "17:00",
  endTime: "02:00",
  scheduleMode: "daily-window",
  startDay: 1,
  endDay: 5,
  cooldownSeconds: 60,
  intervalSeconds: 600,
  activeDays: [1, 2, 3, 4, 5],
  featureSettings: {
    discordFormat: { webhookUrl: "" },
    evaluation: { mfiThreshold: 30, obvSignalPeriod: 9, obvSignalAboveDays: 3, obvSignalCrossLookback: 5 },
    vwapPolicy: { minAbovePercent: 0, minVolume: 0, minTradeValue: 0, minPointCount: 1, minTurnoverRatio: 0, requireComplete: true },
    bollingerPolicy: { period: 20, stdDevMultiplier: 2, minPrice: 0, minVolume: 0, minTurnoverRatio: 0 },
    krBollingerPolicy: { period: 20, stdDevMultiplier: 2, minPrice: 0, minVolume: 0, minTurnoverRatio: 0 },
    marketRss: { enabledSources: [...MARKET_RSS_SOURCES] },
    secEdgar: { ciks: [], syncXbrl: false, discordBatch: 10 },
  },
};

export function FeatureModuleOperations({ moduleKey }: { moduleKey: FeatureModuleKey }) {
  const [settings, setSettings] = useState<ModuleSettings>(DEFAULT_SETTINGS);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void fetch(`/api/admin/feature-modules/${moduleKey}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((value) => {
        const days = Array.isArray(value.activeDays) && value.activeDays.length ? value.activeDays.map(Number).sort((a: number, b: number) => a - b) : [1, 2, 3, 4, 5];
        const defaultInterval = moduleKey === "us-obv" || moduleKey === "us-daily-breakout" ? 60 : moduleKey === "us-daily-open-cache" ? 3600 : DEFAULT_SETTINGS.intervalSeconds;
        setSettings({ ...DEFAULT_SETTINGS, intervalSeconds: defaultInterval, ...value, scheduleMode: value.scheduleMode === "weekly-range" ? "weekly-range" : "daily-window", startDay: Number.isInteger(value.startDay) ? Number(value.startDay) : days[0], endDay: Number.isInteger(value.endDay) ? Number(value.endDay) : days[days.length - 1], featureSettings: { ...DEFAULT_SETTINGS.featureSettings, ...value.featureSettings, discordFormat: { ...DEFAULT_SETTINGS.featureSettings?.discordFormat, ...value.featureSettings?.discordFormat }, evaluation: { ...DEFAULT_SETTINGS.featureSettings?.evaluation, ...value.featureSettings?.evaluation }, marketRss: { ...DEFAULT_SETTINGS.featureSettings?.marketRss, ...value.featureSettings?.marketRss }, secEdgar: { ...DEFAULT_SETTINGS.featureSettings?.secEdgar, ...value.featureSettings?.secEdgar }, vwapPolicy: { ...DEFAULT_SETTINGS.featureSettings?.vwapPolicy, ...value.featureSettings?.vwapPolicy }, bollingerPolicy: { ...DEFAULT_SETTINGS.featureSettings?.bollingerPolicy, ...value.featureSettings?.bollingerPolicy }, krBollingerPolicy: { ...DEFAULT_SETTINGS.featureSettings?.krBollingerPolicy, ...value.featureSettings?.krBollingerPolicy } } });
      });
  }, [moduleKey]);

  async function save() {
    const response = await fetch(`/api/admin/feature-modules/${moduleKey}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(settings) });
    setMessage(response.ok ? "공통 운영 설정이 저장되었습니다." : "저장 실패");
  }

  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  const policy = settings.featureSettings?.vwapPolicy || {};
  const bollingerPolicy = settings.featureSettings?.bollingerPolicy || {};
  const krBollingerPolicy = settings.featureSettings?.krBollingerPolicy || {};
  const webhookUrl = settings.featureSettings?.discordFormat?.webhookUrl || "";
  const debugWebhookUrl = settings.featureSettings?.discordFormat?.debugWebhookUrl || "";
  const mfiThreshold = settings.featureSettings?.evaluation?.mfiThreshold ?? 30;
  const obvSignalPeriod = settings.featureSettings?.evaluation?.obvSignalPeriod ?? 9;
  const obvSignalAboveDays = settings.featureSettings?.evaluation?.obvSignalAboveDays ?? 3;
  const obvSignalCrossLookback = settings.featureSettings?.evaluation?.obvSignalCrossLookback ?? 5;
  const enabledRssSources = settings.featureSettings?.marketRss?.enabledSources || [...MARKET_RSS_SOURCES];
  const secEdgar = settings.featureSettings?.secEdgar || { ciks: [], syncXbrl: false, discordBatch: 10 };
  const updatePolicy = (key: string, value: number | boolean) => setSettings({ ...settings, featureSettings: { ...settings.featureSettings, vwapPolicy: { ...policy, [key]: value } } });
  const updateBollingerPolicy = (key: "period" | "stdDevMultiplier" | "minPrice" | "minVolume" | "minTurnoverRatio", value: number) => setSettings({ ...settings, featureSettings: { ...settings.featureSettings, bollingerPolicy: { ...bollingerPolicy, [key]: value } } });
  const updateKrBollingerPolicy = (key: "period" | "stdDevMultiplier" | "minPrice" | "minVolume" | "minTurnoverRatio", value: number) => setSettings({ ...settings, featureSettings: { ...settings.featureSettings, krBollingerPolicy: { ...krBollingerPolicy, [key]: value } } });
  const updateWebhook = (value: string) => setSettings({ ...settings, featureSettings: { ...settings.featureSettings, discordFormat: { ...settings.featureSettings?.discordFormat, webhookUrl: value } } });
  const updateDebugWebhook = (value: string) => setSettings({ ...settings, featureSettings: { ...settings.featureSettings, discordFormat: { ...settings.featureSettings?.discordFormat, debugWebhookUrl: value } } });
  const updateMfiThreshold = (value: number) => setSettings({ ...settings, featureSettings: { ...settings.featureSettings, evaluation: { ...settings.featureSettings?.evaluation, mfiThreshold: value } } });
  const updateObvPolicy = (key: "obvSignalPeriod" | "obvSignalAboveDays" | "obvSignalCrossLookback", value: number) => setSettings({ ...settings, featureSettings: { ...settings.featureSettings, evaluation: { ...settings.featureSettings?.evaluation, [key]: value } } });
  const updateRssSources = (source: string, enabled: boolean) => setSettings({ ...settings, featureSettings: { ...settings.featureSettings, marketRss: { enabledSources: enabled ? [...new Set([...enabledRssSources, source])] : enabledRssSources.filter((value) => value !== source) } } });
  const updateSecEdgar = (key: "ciks" | "syncXbrl" | "discordBatch", value: string[] | boolean | number) => setSettings({ ...settings, featureSettings: { ...settings.featureSettings, secEdgar: { ...secEdgar, [key]: value } } });

  return <section className={styles.panel}>
    <div><h2>공통 운영 설정</h2><p>ON/OFF, KST 활성화 범위, 실행 간격, 알림 쿨다운은 기능별로 관리합니다.</p></div>
    <label className={styles.toggle}><input type="checkbox" checked={settings.enabled} onChange={(event) => setSettings({ ...settings, enabled: event.target.checked })} /><span>기능 활성화</span></label>
    <div className={styles.fields}><label>스케줄 방식<select value={settings.scheduleMode} onChange={(event) => setSettings({ ...settings, scheduleMode: event.target.value as ModuleSettings["scheduleMode"] })}><option value="daily-window">선택 요일마다 반복</option><option value="weekly-range">주간 연속 범위</option></select></label>{settings.scheduleMode === "weekly-range" ? <><label>시작 요일<select value={settings.startDay} onChange={(event) => setSettings({ ...settings, startDay: Number(event.target.value) })}>{weekdays.map((label, day) => <option key={day} value={day}>{label}요일</option>)}</select></label><label>시작 시각<input type="time" value={settings.startTime} onChange={(event) => setSettings({ ...settings, startTime: event.target.value })} /></label><label>종료 요일<select value={settings.endDay} onChange={(event) => setSettings({ ...settings, endDay: Number(event.target.value) })}>{weekdays.map((label, day) => <option key={day} value={day}>{label}요일</option>)}</select></label><label>종료 시각<input type="time" value={settings.endTime} onChange={(event) => setSettings({ ...settings, endTime: event.target.value })} /></label></> : <><label>시작 시각<input type="time" value={settings.startTime} onChange={(event) => setSettings({ ...settings, startTime: event.target.value })} /></label><label>종료 시각<input type="time" value={settings.endTime} onChange={(event) => setSettings({ ...settings, endTime: event.target.value })} /></label></>}<label>알림 쿨다운(초)<input type="number" min="0" value={settings.cooldownSeconds} onChange={(event) => setSettings({ ...settings, cooldownSeconds: Number(event.target.value) })} /></label>{settings.intervalSeconds !== undefined && <label>실행 간격(초)<input type="number" min={moduleKey === "us-daily-indicators" || moduleKey === "us-obv" || moduleKey === "us-daily-cache" || moduleKey === "us-daily-open-cache" || moduleKey === "us-daily-breakout" ? 60 : 5} value={settings.intervalSeconds} onChange={(event) => setSettings({ ...settings, intervalSeconds: Number(event.target.value) })} /></label>}</div>
    {settings.scheduleMode === "daily-window" && <div className={styles.fields}>{weekdays.map((label, day) => <label key={day}><input type="checkbox" checked={settings.activeDays.includes(day)} onChange={(event) => setSettings({ ...settings, activeDays: event.target.checked ? [...settings.activeDays, day].sort() : settings.activeDays.filter((value) => value !== day) })} /> {label}</label>)}</div>}
    <p className={styles.scheduleHint}>KST 기준입니다. 주간 연속 범위는 시작 시점부터 종료 시점까지, 반복 방식은 선택한 요일마다 적용됩니다. 종료 시각은 포함하지 않습니다.</p>
    {moduleKey === "market-rss" && <><h3>RSS 출처</h3><div className={styles.fields}>{MARKET_RSS_SOURCES.map((source) => <label key={source}><input type="checkbox" checked={enabledRssSources.includes(source)} onChange={(event) => updateRssSources(source, event.target.checked)} /> {source}</label>)}</div><p className={styles.scheduleHint}>선택한 출처만 통합 RSS 파이프라인에서 수집합니다. SEC EDGAR RSS도 이 설정에 포함됩니다.</p></>}
    {moduleKey === "sec-realtime" && <><h3>SEC Submissions 설정</h3><label>CIK 목록 (쉼표 또는 줄바꿈)<p>공개 CIK만 입력합니다. 비워두면 SEC_SYNC_CIKS 환경변수를 사용합니다.</p><textarea value={(secEdgar.ciks || []).join(",")} placeholder="0001855485,0001820875" onChange={(event) => updateSecEdgar("ciks", event.target.value.split(/[\s,]+/).map((value) => value.replace(/\D/g, "")).filter(Boolean))} /></label><div className={styles.fields}><label><input type="checkbox" checked={secEdgar.syncXbrl === true} onChange={(event) => updateSecEdgar("syncXbrl", event.target.checked)} /> Company Facts/XBRL 동기화</label><label>Discord 배치 수<input type="number" min="1" max="100" value={Number(secEdgar.discordBatch ?? 10)} onChange={(event) => updateSecEdgar("discordBatch", Number(event.target.value))} /></label></div><p className={styles.scheduleHint}>SEC Submissions는 RSS와 별도이며, SEC 전용 Discord Webhook을 사용합니다.</p></>}
    <label>기능 전용 Discord Webhook URL<p>비워두면 해당 기능의 환경변수 fallback을 사용합니다.</p><input type="url" value={webhookUrl} placeholder="https://discord.com/api/webhooks/..." onChange={(event) => updateWebhook(event.target.value)} /></label>
    <label>디버깅 전용 Discord Webhook URL<p>실패·재시도·복구 통계만 전송합니다. 비워두면 STOCKMAN_DEBUG_DISCORD_WEBHOOK_URL을 사용합니다.</p><input type="url" value={debugWebhookUrl} placeholder="https://discord.com/api/webhooks/..." onChange={(event) => updateDebugWebhook(event.target.value)} /></label>
    {moduleKey === "us-daily-indicators" && <><div className={styles.fields}><label>MFI 과매도 기준<input type="number" min="0" max="100" value={mfiThreshold} onChange={(event) => updateMfiThreshold(Number(event.target.value))} /></label></div><h3>일봉 OBV Signal 조건</h3><div className={styles.fields}><label>Signal EMA 기간<input type="number" min="2" max="100" value={obvSignalPeriod} onChange={(event) => updateObvPolicy("obvSignalPeriod", Number(event.target.value))} /></label><label>Signal 상회 연속 일수<input type="number" min="1" max="20" value={obvSignalAboveDays} onChange={(event) => updateObvPolicy("obvSignalAboveDays", Number(event.target.value))} /></label><label>최근 골든크로스 확인 기간<input type="number" min="1" max="30" value={obvSignalCrossLookback} onChange={(event) => updateObvPolicy("obvSignalCrossLookback", Number(event.target.value))} /></label></div><p className={styles.scheduleHint}>최근 OBV가 이전 구간보다 증가하고, OBV가 Signal 선 위에 설정 일수만큼 연속 유지되며, 설정 기간 내 골든크로스가 발생한 종목만 후보가 됩니다.</p></>}
    {moduleKey === "us-vwap" && <><h3>VWAP 필터</h3><div className={styles.fields}><label>최소 상회율(%)<input type="number" min="0" step="0.1" value={Number(policy.minAbovePercent ?? 0)} onChange={(event) => updatePolicy("minAbovePercent", Number(event.target.value))} /></label><label>시총 대비 거래대금 최소(%)<input type="number" min="0" step="0.1" value={Number(policy.minTurnoverRatio ?? 0)} onChange={(event) => updatePolicy("minTurnoverRatio", Number(event.target.value))} /></label><label>최소 거래량<input type="number" min="0" value={Number(policy.minVolume ?? 0)} onChange={(event) => updatePolicy("minVolume", Number(event.target.value))} /></label><label>최소 거래대금(USD)<input type="number" min="0" value={Number(policy.minTradeValue ?? 0)} onChange={(event) => updatePolicy("minTradeValue", Number(event.target.value))} /></label><label>최소 데이터 포인트<input type="number" min="1" value={Number(policy.minPointCount ?? 1)} onChange={(event) => updatePolicy("minPointCount", Number(event.target.value))} /></label></div><label className={styles.toggle}><input type="checkbox" checked={policy.requireComplete !== false} onChange={(event) => updatePolicy("requireComplete", event.target.checked)} /><span>전체 세션 데이터 완료만 허용</span></label></>}
    {moduleKey === "us-bollinger-band" && <><h3>일봉 볼린저밴드 하단 이탈 필터</h3><div className={styles.fields}><label>기간(거래일)<input type="number" min="2" max="200" value={Number(bollingerPolicy.period ?? 20)} onChange={(event) => updateBollingerPolicy("period", Number(event.target.value))} /></label><label>표준편차 배수<input type="number" min="0.1" max="10" step="0.1" value={Number(bollingerPolicy.stdDevMultiplier ?? 2)} onChange={(event) => updateBollingerPolicy("stdDevMultiplier", Number(event.target.value))} /></label><label>최소 주가(USD)<input type="number" min="0" step="0.01" value={Number(bollingerPolicy.minPrice ?? 0)} onChange={(event) => updateBollingerPolicy("minPrice", Number(event.target.value))} /></label><label>최소 거래량<input type="number" min="0" value={Number(bollingerPolicy.minVolume ?? 0)} onChange={(event) => updateBollingerPolicy("minVolume", Number(event.target.value))} /></label><label>시총 대비 거래대금 최소(%)<input type="number" min="0" step="0.1" value={Number(bollingerPolicy.minTurnoverRatio ?? 0)} onChange={(event) => updateBollingerPolicy("minTurnoverRatio", Number(event.target.value))} /></label></div><p className={styles.scheduleHint}>최근 완료 일봉의 종가가 하단선 이하인 종목만 통과합니다. 현재 진행 중인 미국 시장일 캔들은 계산에서 제외합니다.</p></>}
    {moduleKey === "kr-bollinger-band" && <><h3>국내 일봉 볼린저밴드 하단 이탈 필터</h3><div className={styles.fields}><label>기간(거래일)<input type="number" min="2" max="200" value={Number(krBollingerPolicy.period ?? 20)} onChange={(event) => updateKrBollingerPolicy("period", Number(event.target.value))} /></label><label>표준편차 배수<input type="number" min="0.1" max="10" step="0.1" value={Number(krBollingerPolicy.stdDevMultiplier ?? 2)} onChange={(event) => updateKrBollingerPolicy("stdDevMultiplier", Number(event.target.value))} /></label><label>최소 주가(원)<input type="number" min="0" value={Number(krBollingerPolicy.minPrice ?? 0)} onChange={(event) => updateKrBollingerPolicy("minPrice", Number(event.target.value))} /></label><label>최소 거래량<input type="number" min="0" value={Number(krBollingerPolicy.minVolume ?? 0)} onChange={(event) => updateKrBollingerPolicy("minVolume", Number(event.target.value))} /></label><label>시총 대비 거래대금 최소(%)<input type="number" min="0" step="0.1" value={Number(krBollingerPolicy.minTurnoverRatio ?? 0)} onChange={(event) => updateKrBollingerPolicy("minTurnoverRatio", Number(event.target.value))} /></label></div><p className={styles.scheduleHint}>국내 통합 티커의 DB 저장 일봉 종가가 하단선 이하인 종목만 통과합니다. KIS 일봉 원본은 별도 갱신 API에서 저장합니다.</p></>}
    <div className={styles.footer}><span>{message}</span><button onClick={() => void save()}>설정 저장</button></div>
  </section>;
}
