import { useEffect, useState } from "react";
import { loadYoWallet } from "./store";
import type { YoWallet } from "./types";

export function useYoWallet() {
  const [wallet, setWallet] = useState<YoWallet>(() => {
    try {
      return loadYoWallet(null);
    } catch {
      return { cash: 0, holdings: [], orders: [], trades: [], active: false, createdAt: "", seq: 1 };
    }
  });
  useEffect(() => {
    const bump = () => {
      try {
        setWallet(loadYoWallet(null));
      } catch {}
    };
    window.addEventListener("yobroker:change", bump);
    window.addEventListener("storage", bump);
    return () => {
      window.removeEventListener("yobroker:change", bump);
      window.removeEventListener("storage", bump);
    };
  }, []);
  return wallet;
}
