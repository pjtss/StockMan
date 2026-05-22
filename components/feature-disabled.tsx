import Link from "next/link";
import { PageNavigation } from "./page-navigation";
import styles from "./feature-disabled.module.css";

type PageKey =
  | "home"
  | "dart"
  | "dart-opendart-fast"
  | "sec"
  | "scanners"
  | "watchlist"
  | "notifications"
  | "scanners-us";

type FeatureDisabledProps = {
  current: PageKey;
  category: string;
  title: string;
  description: string;
};

export function FeatureDisabled(props: FeatureDisabledProps) {
  return (
    <main className={styles.page}>
      <PageNavigation current={props.current} />
      <section className={styles.panel}>
        <p className={styles.kicker}>{props.category}</p>
        <h1 className={styles.title}>{props.title}</h1>
        <p className={styles.description}>{props.description}</p>
        <div className={styles.actions}>
          <Link href="/" className={styles.primary} prefetch={false}>
            홈으로 이동
          </Link>
          <Link href="/notifications" className={styles.secondary} prefetch={false}>
            알림 센터 보기
          </Link>
        </div>
      </section>
    </main>
  );
}
