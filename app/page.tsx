"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { DashboardLayout } from "@/components/dashboard-layout";
import type { DashboardStats } from "@/lib/types";

function getFullscreenElement(): Element | null {
  const d = document as Document & {
    webkitFullscreenElement?: Element | null;
    mozFullScreenElement?: Element | null;
  };
  return document.fullscreenElement ?? d.webkitFullscreenElement ?? d.mozFullScreenElement ?? null;
}

async function requestFullscreenEl(el: HTMLElement): Promise<void> {
  const e = el as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
    mozRequestFullScreen?: () => Promise<void> | void;
  };
  if (el.requestFullscreen) await el.requestFullscreen();
  else if (e.webkitRequestFullscreen) await Promise.resolve(e.webkitRequestFullscreen());
  else if (e.mozRequestFullScreen) await Promise.resolve(e.mozRequestFullScreen());
}

async function exitFullscreenDoc(): Promise<void> {
  const d = document as Document & {
    webkitExitFullscreen?: () => Promise<void> | void;
    mozCancelFullScreen?: () => Promise<void> | void;
  };
  if (document.exitFullscreen) await document.exitFullscreen();
  else if (d.webkitExitFullscreen) await Promise.resolve(d.webkitExitFullscreen());
  else if (d.mozCancelFullScreen) await Promise.resolve(d.mozCancelFullScreen());
}

export default function Page() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [data, setData] = useState<DashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stats");
      const json = (await res.json()) as DashboardStats & { error?: string };
      if (!res.ok) {
        setError(json.error ?? `HTTP ${res.status}`);
        setData(null);
        return;
      }
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(t);
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => void load(), 5 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [load]);

  useEffect(() => {
    const sync = () => {
      const fs = getFullscreenElement();
      const root = rootRef.current;
      setFullscreen(!!root && fs === root);
    };
    sync();
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
    };
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const root = rootRef.current;
    if (!root) return;
    try {
      if (getFullscreenElement()) await exitFullscreenDoc();
      else await requestFullscreenEl(root);
    } catch {
      // Unsupported, denied, or not allowed without user gesture
    }
  }, []);

  return (
    <div
      ref={rootRef}
      className="box-border flex w-full max-w-none min-w-0 flex-col bg-background md:h-screen md:min-h-0 md:overflow-hidden [&:fullscreen]:h-[100dvh] [&:fullscreen]:max-h-[100dvh] [&:fullscreen]:min-h-[100dvh] [&:fullscreen]:overflow-hidden"
    >
      {error && (
        <div className="shrink-0 px-4 py-3 bg-[rgba(255,87,87,0.15)] border-b border-[#ff5757]/35 text-[#ff5757] text-sm">
          {error}
        </div>
      )}

      {loading && !data && (
        <div className="flex items-center justify-center flex-1 h-screen">
          <p className="text-[rgba(245,245,243,0.38)] animate-pulse text-sm">
            Loading…
          </p>
        </div>
      )}

      {data && (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col md:overflow-hidden">
          <DashboardLayout data={data} />
        </div>
      )}

      <footer className="shrink-0 px-4 py-3 flex items-center justify-between gap-4">
        <span className="text-sm font-semibold uppercase tracking-[0.12em] text-[rgba(245,245,243,0.38)]">
          Webhouse OS
        </span>
        <div className="flex items-center gap-4">
          {data && (
            <span className="text-sm text-[rgba(245,245,243,0.38)]">
              {new Date(data.generatedAt).toLocaleString("en-AU", {
                dateStyle: "short",
                timeStyle: "short",
              })}
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void toggleFullscreen()}
            className="text-sm h-8 px-2 text-[rgba(245,245,243,0.38)] hover:text-foreground"
            aria-pressed={fullscreen}
            title={fullscreen ? "Exit full screen (Esc)" : "Hide browser UI (full screen)"}
          >
            {fullscreen ? "Exit full screen" : "Full screen"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
            className="text-sm h-8 px-2 text-[rgba(245,245,243,0.38)] hover:text-foreground"
          >
            {loading ? "Loading…" : "Refresh"}
          </Button>
        </div>
      </footer>
    </div>
  );
}
