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
    evaluation?: { mfiThreshold?: number; obvSignalPeriod?: number; obvSignalAboveDays?: number; obvSignalCrossLookback?: number; trendMinScore?: number; trendMinRvol?: number; trendMinMfi?: number; trendMaxMfi?: number; trendRequirePriceTrend?: boolean; trendRequireDailyBreakout?: boolean };
    marketRss?: { enabledSources?: string[] };
    secEdgar?: { ciks?: string[]; syncXbrl?: boolean; discordBatch?: number };
    vwapPolicy?: Record<string, number | boolean>;
    bollingerPolicy?: { timeframe?: "D" | "W" | "M"; period?: number; stdDevMultiplier?: number; minPrice?: number; minVolume?: number; minTurnoverRatio?: number };
    krBollingerPolicy?: { timeframe?: "D" | "W" | "M"; period?: number; stdDevMultiplier?: number; minPrice?: number; minVolume?: number; minTurnoverRatio?: number };
    newsLookup?: { defaultPeriod?: "today" | "3d" | "7d" | "1m" };
    minuteBollingerPolicy?: { topN?: number; period?: number; stdDevMultiplier?: number; minChangeRate?: number };
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
    evaluation: { mfiThreshold: 30, obvSignalPeriod: 9, obvSignalAboveDays: 3, obvSignalCrossLookback: 5, trendMinScore: 70, trendMinRvol: 1.5, trendMinMfi: 50, trendMaxMfi: 85, trendRequirePriceTrend: true, trendRequireDailyBreakout: true },
    vwapPolicy: { minAbovePercent: 0, minVolume: 0, minTradeValue: 0, minPointCount: 1, minTurnoverRatio: 0, requireComplete: true },
    bollingerPolicy: { timeframe: "D", period: 20, stdDevMultiplier: 2, minPrice: 0, minVolume: 0, minTurnoverRatio: 0 },
    krBollingerPolicy: { timeframe: "D", period: 20, stdDevMultiplier: 2, minPrice: 0, minVolume: 0, minTurnoverRatio: 0 },
    marketRss: { enabledSources: [...MARKET_RSS_SOURCES] },
    secEdgar: { ciks: [], syncXbrl: false, discordBatch: 10 },
    newsLookup: { defaultPeriod: "today" },
    minuteBollingerPolicy: { topN: 30, period: 20, stdDevMultiplier: 2, minChangeRate: 0 },
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
        setSettings({ ...DEFAULT_SETTINGS, intervalSeconds: defaultInterval, ...value, scheduleMode: value.scheduleMode === "weekly-range" ? "weekly-range" : "daily-window", startDay: Number.isInteger(value.startDay) ? Number(value.startDay) : days[0], endDay: Number.isInteger(value.endDay) ? Number(value.endDay) : days[days.length - 1], featureSettings: { ...DEFAULT_SETTINGS.featureSettings, ...value.featureSettings, discordFormat: { ...DEFAULT_SETTINGS.featureSettings?.discordFormat, ...value.featureSettings?.discordFormat }, evaluation: { ...DEFAULT_SETTINGS.featureSettings?.evaluation, ...value.featureSettings?.evaluation }, marketRss: { ...DEFAULT_SETTINGS.featureSettings?.marketRss, ...value.featureSettings?.marketRss }, secEdgar: { ...DEFAULT_SETTINGS.featureSettings?.secEdgar, ...value.featureSettings?.secEdgar }, vwapPolicy: { ...DEFAULT_SETTINGS.featureSettings?.vwapPolicy, ...value.featureSettings?.vwapPolicy }, bollingerPolicy: { ...DEFAULT_SETTINGS.featureSettings?.bollingerPolicy, ...value.featureSettings?.bollingerPolicy }, krBollingerPolicy: { ...DEFAULT_SETTINGS.featureSettings?.krBollingerPolicy, ...value.featureSettings?.krBollingerPolicy }, newsLookup: { ...DEFAULT_SETTINGS.featureSettings?.newsLookup, ...value.featureSettings?.newsLookup }, minuteBollingerPolicy: { ...DEFAULT_SETTINGS.featureSettings?.minuteBollingerPolicy, ...value.featureSettings?.minuteBollingerPolicy } } });
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
  const trendMinScore = settings.featureSettings?.evaluation?.trendMinScore ?? 70;
  const trendMinRvol = settings.featureSettings?.evaluation?.trendMinRvol ?? 1.5;
  const trendMinMfi = settings.featureSettings?.evaluation?.trendMinMfi ?? 50;
  const trendMaxMfi = settings.featureSettings?.evaluation?.trendMaxMfi ?? 85;
  const trendRequirePriceTrend = settings.featureSettings?.evaluation?.trendRequirePriceTrend ?? true;
  const trendRequireDailyBreakout = settings.featureSettings?.evaluation?.trendRequireDailyBreakout ?? true;
  const enabledRssSources = settings.featureSettings?.marketRss?.enabledSources || [...MARKET_RSS_SOURCES];
  const secEdgar = settings.featureSettings?.secEdgar || { ciks: [], syncXbrl: false, discordBatch: 10 };
  const newsLookup = settings.featureSettings?.newsLookup || { defaultPeriod: "today" as const };
  const minuteBollingerPolicy = settings.featureSettings?.minuteBollingerPolicy || { topN: 30, period: 20, stdDevMultiplier: 2, minChangeRate: 0 };
  const updatePolicy = (key: string, value: number | boolean) => setSettings({ ...settings, featureSettings: { ...settings.featureSettings, vwapPolicy: { ...policy, [key]: value } } });
  const updateBollingerPolicy = (key: "timeframe" | "period" | "stdDevMultiplier" | "minPrice" | "minVolume" | "minTurnoverRatio", value: number | "D" | "W" | "M") => setSettings({ ...settings, featureSettings: { ...settings.featureSettings, bollingerPolicy: { ...bollingerPolicy, [key]: value } } });
  const updateKrBollingerPolicy = (key: "timeframe" | "period" | "stdDevMultiplier" | "minPrice" | "minVolume" | "minTurnoverRatio", value: number | "D" | "W" | "M") => setSettings({ ...settings, featureSettings: { ...settings.featureSettings, krBollingerPolicy: { ...krBollingerPolicy, [key]: value } } });
  const updateWebhook = (value: string) => setSettings({ ...settings, featureSettings: { ...settings.featureSettings, discordFormat: { ...settings.featureSettings?.discordFormat, webhookUrl: value } } });
  const updateDebugWebhook = (value: string) => setSettings({ ...settings, featureSettings: { ...settings.featureSettings, discordFormat: { ...settings.featureSettings?.discordFormat, debugWebhookUrl: value } } });
  const updateMfiThreshold = (value: number) => setSettings({ ...settings, featureSettings: { ...settings.featureSettings, evaluation: { ...settings.featureSettings?.evaluation, mfiThreshold: value } } });
  const updateObvPolicy = (key: "obvSignalPeriod" | "obvSignalAboveDays" | "obvSignalCrossLookback", value: number) => setSettings({ ...settings, featureSettings: { ...settings.featureSettings, evaluation: { ...settings.featureSettings?.evaluation, [key]: value } } });
  const updateTrendPolicy = (key: "trendMinScore" | "trendMinRvol" | "trendMinMfi" | "trendMaxMfi" | "trendRequirePriceTrend" | "trendRequireDailyBreakout", value: number | boolean) => setSettings({ ...settings, featureSettings: { ...settings.featureSettings, evaluation: { ...settings.featureSettings?.evaluation, [key]: value } } });
  const updateRssSources = (source: string, enabled: boolean) => setSettings({ ...settings, featureSettings: { ...settings.featureSettings, marketRss: { enabledSources: enabled ? [...new Set([...enabledRssSources, source])] : enabledRssSources.filter((value) => value !== source) } } });
  const updateSecEdgar = (key: "ciks" | "syncXbrl" | "discordBatch", value: string[] | boolean | number) => setSettings({ ...settings, featureSettings: { ...settings.featureSettings, secEdgar: { ...secEdgar, [key]: value } } });
  const updateNewsLookup = (value: "today" | "3d" | "7d" | "1m") => setSettings({ ...settings, featureSettings: { ...settings.featureSettings, newsLookup: { defaultPeriod: value } } });
  const updateMinuteBollinger = (key: "topN" | "period" | "stdDevMultiplier" | "minChangeRate", value: number) => setSettings({ ...settings, featureSettings: { ...settings.featureSettings, minuteBollingerPolicy: { ...minuteBollingerPolicy, [key]: value } } });

  return <section className={styles.panel}>
    <div><h2>공통 운영 설정</h2><p>ON/OFF, KST 활성화 범위, 실행 간격, 알림 쿨다운은 기능별로 관리합니다.</p></div>
    <label className={styles.toggle}><input type="checkbox" checked={settings.enabled} onChange={(event) => setSettings({ ...settings, enabled: event.target.checked })} /><span>기능 활성화</span></label>
    <div className={styles.fields}><label>스케줄 방식<select value={settings.scheduleMode} onChange={(event) => setSettings({ ...settings, scheduleMode: event.target.value as ModuleSettings["scheduleMode"] })}><option value="daily-window">선택 요일마다 반복</option><option value="weekly-range">주간 연속 범위</option></select></label>{settings.scheduleMode === "weekly-range" ? <><label>시작 요일<select value={settings.startDay} onChange={(event) => setSettings({ ...settings, startDay: Number(event.target.value) })}>{weekdays.map((label, day) => <option key={day} value={day}>{label}요일</option>)}</select></label><label>시작 시각<input type="time" value={settings.startTime} onChange={(event) => setSettings({ ...settings, startTime: event.target.value })} /></label><label>종료 요일<select value={settings.endDay} onChange={(event) => setSettings({ ...settings, endDay: Number(event.target.value) })}>{weekdays.map((label, day) => <option key={day} value={day}>{label}요일</option>)}</select></label><label>종료 시각<input type="time" value={settings.endTime} onChange={(event) => setSettings({ ...settings, endTime: event.target.value })} /></label></> : <><label>시작 시각<input type="time" value={settings.startTime} onChange={(event) => setSettings({ ...settings, startTime: event.target.value })} /></label><label>종료 시각<input type="time" value={settings.endTime} onChange={(event) => setSettings({ ...settings, endTime: event.target.value })} /></label></>}<label>알림 쿨다운(초)<input type="number" min="0" value={settings.cooldownSeconds} onChange={(event) => setSettings({ ...settings, cooldownSeconds: Number(event.target.value) })} /></label>{settings.intervalSeconds !== undefined && <label>실행 간격(초)<input type="number" min={moduleKey === "us-daily-indicators" || moduleKey === "us-obv" || moduleKey === "us-daily-cache" || moduleKey === "us-daily-open-cache" || moduleKey === "us-daily-breakout" ? 60 : 5} value={settings.intervalSeconds} onChange={(event) => setSettings({ ...settings, intervalSeconds: Number(event.target.value) })} /></label>}</div>
    {settings.scheduleMode === "daily-window" && <div className={styles.fields}>{weekdays.map((label, day) => <label key={day}><input type="checkbox" checked={settings.activeDays.includes(day)} onChange={(event) => setSettings({ ...settings, activeDays: event.target.checked ? [...settings.activeDays, day].sort() : settings.activeDays.filter((value) => value !== day) })} /> {label}</label>)}</div>}
    <p className={styles.scheduleHint}>KST 기준입니다. 주간 연속 범위는 시작 시점부터 종료 시점까지, 반복 방식은 선택한 요일마다 적용됩니다. 종료 시각은 포함하지 않습니다.</p>
    {moduleKey === "market-rss" && <><h3>RSS 출처</h3><div className={styles.fields}>{MARKET_RSS_SOURCES.map((source) => <label key={source}><input type="checkbox" checked={enabledRssSources.includes(source)} onChange={(event) => updateRssSources(source, event.target.checked)} /> {source}</label>)}</div><p className={styles.scheduleHint}>선택한 출처만 통합 RSS 파이프라인에서 수집합니다. SEC EDGAR RSS도 이 설정에 포함됩니다.</p></>}
    {moduleKey === "sec-realtime" && <><h3>SEC Submissions 설정</h3><label>CIK 목록 (쉼표 또는 줄바꿈)<p>공개 CIK만 입력합니다. 비워두면 SEC_SYNC_CIKS 환경변수를 사용합니다.</p><textarea value={(secEdgar.ciks || []).join(",")} placeholder="0001855485,0001820875" onChange={(event) => updateSecEdgar("ciks", event.target.value.split(/[\s,]+/).map((value) => value.replace(/\D/g, "")).filter(Boolean))} /></label><div className={styles.fields}><label><input type="checkbox" checked={secEdgar.syncXbrl === true} onChange={(event) => updateSecEdgar("syncXbrl", event.target.checked)} /> Company Facts/XBRL 동기화</label><label>Discord 배치 수<input type="number" min="1" max="100" value={Number(secEdgar.discordBatch ?? 10)} onChange={(event) => updateSecEdgar("discordBatch", Number(event.target.value))} /></label></div><p className={styles.scheduleHint}>SEC Submissions는 RSS와 별도이며, SEC 전용 Discord Webhook을 사용합니다.</p></>}
    {moduleKey === "us-news-radar" && <><h3>Discord 티커 뉴스 조회 설정</h3><div className={styles.fields}><label>기간 미입력 시 기본 기간<select value={newsLookup.defaultPeriod} onChange={(event) => updateNewsLookup(event.target.value as "today" | "3d" | "7d" | "1m")}><option value="today">오늘</option><option value="3d">최근 3일</option><option value="7d">최근 7일</option><option value="1m">최근 1개월</option></select></label></div><p className={styles.scheduleHint}>Discord에서 <strong>/news symbol:AAPL</strong>처럼 티커만 입력하면 이 기본 기간으로 KIS 뉴스를 조회합니다.</p></>}
    {moduleKey === "us-minute-bollinger-band" && <><h3>1분봉 볼린저밴드 조건</h3><div className={styles.fields}><label>상승률 TOP N<input type="number" min="1" max="100" value={Number(minuteBollingerPolicy.topN ?? 30)} onChange={(event) => updateMinuteBollinger("topN", Number(event.target.value))} /></label><label>볼린저 기간(분)<input type="number" min="2" max="120" value={Number(minuteBollingerPolicy.period ?? 20)} onChange={(event) => updateMinuteBollinger("period", Number(event.target.value))} /></label><label>표준편차 배수<input type="number" min="0.1" max="10" step="0.1" value={Number(minuteBollingerPolicy.stdDevMultiplier ?? 2)} onChange={(event) => updateMinuteBollinger("stdDevMultiplier", Number(event.target.value))} /></label><label>최소 등락률(%)<input type="number" step="0.1" value={Number(minuteBollingerPolicy.minChangeRate ?? 0)} onChange={(event) => updateMinuteBollinger("minChangeRate", Number(event.target.value))} /></label></div><p className={styles.scheduleHint}>NAS·AMS·NYS별 상승률 TOP N을 대상으로 ETF·레버리지·파생상품을 제외하고 KIS 1분봉 종가가 하단선 이하인 종목을 탐지합니다.</p></>}
    <label>기능 전용 Discord Webhook URL<p>비워두면 해당 기능의 환경변수 fallback을 사용합니다.</p><input type="url" value={webhookUrl} placeholder="https://discord.com/api/webhooks/..." onChange={(event) => updateWebhook(event.target.value)} /></label>
    <label>디버깅 전용 Discord Webhook URL<p>실패·재시도·복구 통계만 전송합니다. 비워두면 STOCKMAN_DEBUG_DISCORD_WEBHOOK_URL을 사용합니다.</p><input type="url" value={debugWebhookUrl} placeholder="https://discord.com/api/webhooks/..." onChange={(event) => updateDebugWebhook(event.target.value)} /></label>
    {moduleKey === "us-daily-indicators" && <><div className={styles.fields}><label>MFI 과매도 기준<input type="number" min="0" max="100" value={mfiThreshold} onChange={(event) => updateMfiThreshold(Number(event.target.value))} /></label></div><h3>일봉 OBV Signal 조건</h3><div className={styles.fields}><label>Signal EMA 기간<input type="number" min="2" max="100" value={obvSignalPeriod} onChange={(event) => updateObvPolicy("obvSignalPeriod", Number(event.target.value))} /></label><label>Signal 상회 연속 일수<input type="number" min="1" max="20" value={obvSignalAboveDays} onChange={(event) => updateObvPolicy("obvSignalAboveDays", Number(event.target.value))} /></label><label>최근 골든크로스 확인 기간<input type="number" min="1" max="30" value={obvSignalCrossLookback} onChange={(event) => updateObvPolicy("obvSignalCrossLookback", Number(event.target.value))} /></label></div><p className={styles.scheduleHint}>최근 OBV가 이전 구간보다 증가하고, OBV가 Signal 선 위에 설정 일수만큼 연속 유지되며, 설정 기간 내 골든크로스가 발생한 종목만 후보가 됩니다.</p><h3>급등 추세 통합 점수 조건</h3><div className={styles.fields}><label>최소 종합점수<input type="number" min="0" max="100" value={trendMinScore} onChange={(event) => updateTrendPolicy("trendMinScore", Number(event.target.value))} /></label><label>최소 거래량 RVOL<input type="number" min="0" step="0.1" value={trendMinRvol} onChange={(event) => updateTrendPolicy("trendMinRvol", Number(event.target.value))} /></label><label>최소 MFI<input type="number" min="0" max="100" value={trendMinMfi} onChange={(event) => updateTrendPolicy("trendMinMfi", Number(event.target.value))} /></label><label>최대 MFI<input type="number" min="0" max="100" value={trendMaxMfi} onChange={(event) => updateTrendPolicy("trendMaxMfi", Number(event.target.value))} /></label><label><input type="checkbox" checked={trendRequirePriceTrend} onChange={(event) => updateTrendPolicy("trendRequirePriceTrend", event.target.checked)} /> MA20·MA60 상승 추세 필수</label><label><input type="checkbox" checked={trendRequireDailyBreakout} onChange={(event) => updateTrendPolicy("trendRequireDailyBreakout", event.target.checked)} /> 당일 시가 5일 고가 돌파 필수</label></div><p className={styles.scheduleHint}>OBV·MACD·MFI·볼린저밴드·DMI·거래량과 당일 시가 돌파를 함께 평가합니다. 돌파 기준은 당일 시가가 이전 5거래일 고가보다 높은지이며 DB 저장 일봉만 사용합니다.</p></>}
    {moduleKey === "us-vwap" && <><h3>VWAP 필터</h3><div className={styles.fields}><label>최소 상회율(%)<input type="number" min="0" step="0.1" value={Number(policy.minAbovePercent ?? 0)} onChange={(event) => updatePolicy("minAbovePercent", Number(event.target.value))} /></label><label>시총 대비 거래대금 최소(%)<input type="number" min="0" step="0.1" value={Number(policy.minTurnoverRatio ?? 0)} onChange={(event) => updatePolicy("minTurnoverRatio", Number(event.target.value))} /></label><label>최소 거래량<input type="number" min="0" value={Number(policy.minVolume ?? 0)} onChange={(event) => updatePolicy("minVolume", Number(event.target.value))} /></label><label>최소 거래대금(USD)<input type="number" min="0" value={Number(policy.minTradeValue ?? 0)} onChange={(event) => updatePolicy("minTradeValue", Number(event.target.value))} /></label><label>최소 데이터 포인트<input type="number" min="1" value={Number(policy.minPointCount ?? 1)} onChange={(event) => updatePolicy("minPointCount", Number(event.target.value))} /></label></div><label className={styles.toggle}><input type="checkbox" checked={policy.requireComplete !== false} onChange={(event) => updatePolicy("requireComplete", event.target.checked)} /><span>전체 세션 데이터 완료만 허용</span></label></>}
    {moduleKey === "us-bollinger-band" && <><h3>일봉 볼린저밴드 하단 이탈 필터</h3><div className={styles.fields}><label>기간(거래일)<input type="number" min="2" max="200" value={Number(bollingerPolicy.period ?? 20)} onChange={(event) => updateBollingerPolicy("period", Number(event.target.value))} /></label><label>표준편차 배수<input type="number" min="0.1" max="10" step="0.1" value={Number(bollingerPolicy.stdDevMultiplier ?? 2)} onChange={(event) => updateBollingerPolicy("stdDevMultiplier", Number(event.target.value))} /></label><label>최소 주가(USD)<input type="number" min="0" step="0.01" value={Number(bollingerPolicy.minPrice ?? 0)} onChange={(event) => updateBollingerPolicy("minPrice", Number(event.target.value))} /></label><label>최소 거래량<input type="number" min="0" value={Number(bollingerPolicy.minVolume ?? 0)} onChange={(event) => updateBollingerPolicy("minVolume", Number(event.target.value))} /></label><label>시총 대비 거래대금 최소(%)<input type="number" min="0" step="0.1" value={Number(bollingerPolicy.minTurnoverRatio ?? 0)} onChange={(event) => updateBollingerPolicy("minTurnoverRatio", Number(event.target.value))} /></label></div><p className={styles.scheduleHint}>최근 완료 일봉의 종가가 하단선 이하인 종목만 통과합니다. 현재 진행 중인 미국 시장일 캔들은 계산에서 제외합니다.</p></>}
    {moduleKey === "kr-bollinger-band" && <><h3>국내 일봉 볼린저밴드 하단 이탈 필터</h3><div className={styles.fields}><label>기간(거래일)<input type="number" min="2" max="200" value={Number(krBollingerPolicy.period ?? 20)} onChange={(event) => updateKrBollingerPolicy("period", Number(event.target.value))} /></label><label>표준편차 배수<input type="number" min="0.1" max="10" step="0.1" value={Number(krBollingerPolicy.stdDevMultiplier ?? 2)} onChange={(event) => updateKrBollingerPolicy("stdDevMultiplier", Number(event.target.value))} /></label><label>최소 주가(원)<input type="number" min="0" value={Number(krBollingerPolicy.minPrice ?? 0)} onChange={(event) => updateKrBollingerPolicy("minPrice", Number(event.target.value))} /></label><label>최소 거래량<input type="number" min="0" value={Number(krBollingerPolicy.minVolume ?? 0)} onChange={(event) => updateKrBollingerPolicy("minVolume", Number(event.target.value))} /></label><label>시총 대비 거래대금 최소(%)<input type="number" min="0" step="0.1" value={Number(krBollingerPolicy.minTurnoverRatio ?? 0)} onChange={(event) => updateKrBollingerPolicy("minTurnoverRatio", Number(event.target.value))} /></label></div><p className={styles.scheduleHint}>국내 통합 티커의 DB 저장 일봉 종가가 하단선 이하인 종목만 통과합니다. KIS 일봉 원본은 별도 갱신 API에서 저장합니다.</p></>}
    {(moduleKey === "us-bollinger-band" || moduleKey === "kr-bollinger-band") && <div className={styles.fields}><label>조회 봉 주기<select value={(moduleKey === "us-bollinger-band" ? bollingerPolicy.timeframe : krBollingerPolicy.timeframe) ?? "D"} onChange={(event) => moduleKey === "us-bollinger-band" ? updateBollingerPolicy("timeframe", event.target.value as "D" | "W" | "M") : updateKrBollingerPolicy("timeframe", event.target.value as "D" | "W" | "M")}><option value="D">일봉</option><option value="W">주봉</option><option value="M">월봉</option></select></label><p className={styles.scheduleHint}>티커별 KIS 저장 캔들 주기를 선택합니다. 저장된 주기 데이터만 탐지에 사용합니다.</p></div>}
    <div className={styles.footer}><span>{message}</span><button onClick={() => void save()}>설정 저장</button></div>
  </section>;
}
