"use client";
import Link from "next/link";
import { useState } from "react";
import styles from "./user-auth-form.module.css";

export function UserAuthForm({ mode }: { mode: "login" | "register" }) {
  const isLogin = mode === "login";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setLoading(true);
    try {
      const response = await fetch(`/api/auth/${mode}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username, password }) });
      const body = await response.json();
      if (!response.ok) { setError(body.error === "USERNAME_TAKEN" ? "이미 사용 중인 아이디입니다." : body.error === "INVALID_CREDENTIALS" ? "아이디는 3~32자, 비밀번호는 8~128자여야 합니다." : "처리할 수 없습니다. 입력 내용을 확인해 주세요."); return; }
      if (isLogin) window.location.assign("/"); else setDone(true);
    } catch { setError("네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요."); }
    finally { setLoading(false); }
  }
  return <section className={styles.wrapper}><form className={styles.card} onSubmit={submit} noValidate>
    <div className={styles.icon} aria-hidden="true">⚡</div><p className={styles.eyebrow}>STOCKMAN QUANT</p>
    <h1>{isLogin ? "다시 만나서 반가워요" : "StockMan 시작하기"}</h1>
    <p className={styles.description}>{isLogin ? "계정에 로그인하고 관심종목과 차트를 계속 확인하세요." : "간단한 계정으로 나만의 관심종목을 관리하세요."}</p>
    <div className={styles.fields}><label className={styles.field} htmlFor="auth-username"><span>아이디</span><input id="auth-username" value={username} onChange={event => setUsername(event.target.value)} placeholder="영문, 숫자, 밑줄 3~32자" autoComplete="username" required /></label>
      <label className={styles.field} htmlFor="auth-password"><span>비밀번호</span><input id="auth-password" type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder="8자 이상 입력" autoComplete={isLogin ? "current-password" : "new-password"} minLength={8} required /></label></div>
    {error && <p className={styles.error} role="alert">{error}</p>}{done && <p className={styles.success} role="status">가입이 완료되었습니다. 로그인해 주세요.</p>}
    <button className={styles.submit} type="submit" disabled={loading}>{loading ? "처리 중…" : isLogin ? "로그인" : "회원가입"}<span aria-hidden="true">→</span></button>
    <p className={styles.switch}>{isLogin ? "아직 계정이 없나요?" : "이미 계정이 있나요?"} <Link href={isLogin ? "/register" : "/login"}>{isLogin ? "회원가입" : "로그인"}</Link></p>
  </form></section>;
}
