"use client";

import { useEffect, useState } from "react";
import { getKeywords, toggleKeyword } from "@/lib/keywords";
import styles from "./keyword-manager.module.css";

interface KeywordManagerProps {
  onKeywordsChange: (keywords: string[]) => void;
}

export function KeywordManager({ onKeywordsChange }: KeywordManagerProps) {
  const [keywords, setKeywords] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState("");

  useEffect(() => {
    const initial = getKeywords();
    setKeywords(initial);
    onKeywordsChange(initial);
  }, [onKeywordsChange]);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;
    
    // Check if it already exists to prevent duplicate toggle behavior
    if (keywords.includes(inputValue.trim())) {
      setInputValue("");
      return;
    }

    const updated = toggleKeyword(inputValue);
    setKeywords(updated);
    onKeywordsChange(updated);
    setInputValue("");
  };

  const handleRemove = (kw: string) => {
    const updated = toggleKeyword(kw);
    setKeywords(updated);
    onKeywordsChange(updated);
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3 className={styles.title}>나만의 키워드 스캐너</h3>
        <p className={styles.desc}>관심 키워드가 공시에 등장하면 강렬하게 하이라이트 됩니다.</p>
      </div>

      <form onSubmit={handleAdd} className={styles.inputGroup}>
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="예: HBM, 무상증자, 인수합병"
          className={styles.input}
        />
        <button type="submit" className={styles.button}>추가</button>
      </form>

      <div className={styles.list}>
        {keywords.length === 0 ? (
          <p className={styles.empty}>등록된 키워드가 없습니다.</p>
        ) : (
          keywords.map((kw) => (
            <span key={kw} className={styles.badge}>
              {kw}
              <button 
                type="button" 
                onClick={() => handleRemove(kw)}
                className={styles.removeBtn}
                aria-label="제거"
              >
                ✕
              </button>
            </span>
          ))
        )}
      </div>
    </div>
  );
}
