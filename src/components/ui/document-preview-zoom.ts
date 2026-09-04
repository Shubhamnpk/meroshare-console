import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 3;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export interface ZoomPanState {
  zoom: number;
  panX: number;
  panY: number;
}

interface ContentSize {
  w: number;
  h: number;
}

/**
 * Transform-based zoom + pan for the in-app document viewer.
 *
 * Content is laid out at `renderScale`-multiplied dimensions and visually
 * scaled via `transform: translate(panX,panY) scale(zoom / renderScale)` with
 * `transform-origin: 0 0`. Zoom math is pure state (no scroll manipulation),
 * so the point under the cursor/fingers stays fixed and nothing jumps.
 */
export function usePreviewZoomPan(
  containerRef: RefObject<HTMLDivElement | null>,
  contentSize: ContentSize | null,
  renderScale: number,
  enabled: boolean,
) {
  const [state, setState] = useState<ZoomPanState>({ zoom: 1, panX: 0, panY: 0 });
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const contentSizeRef = useRef(contentSize);
  useEffect(() => {
    contentSizeRef.current = contentSize;
  }, [contentSize]);

  const scaleOf = useCallback((z: number) => z / renderScale, [renderScale]);

  const getContainerRect = useCallback(
    () => containerRef.current?.getBoundingClientRect() ?? null,
    [containerRef],
  );

  const centerPan = useCallback(
    (z: number, cs: ContentSize | null) => {
      const rect = getContainerRect();
      if (!rect || !cs) return { panX: 0, panY: 0 };
      const s = scaleOf(z);
      return {
        panX: rect.width >= cs.w * s ? (rect.width - cs.w * s) / 2 : 16,
        panY: rect.height >= cs.h * s ? (rect.height - cs.h * s) / 2 : 16,
      };
    },
    [getContainerRect, scaleOf],
  );

  /** Keep content within the container: center when it fits, bound edges with margin. */
  const clampPan = useCallback(
    (pan: { panX: number; panY: number }, z: number, cs: ContentSize | null) => {
      const rect = getContainerRect();
      if (!rect || !cs) return pan;
      const s = scaleOf(z);
      const PAD = 24;
      const clampAxis = (v: number, viewport: number, content: number) => {
        if (content <= viewport) return (viewport - content) / 2;
        return clamp(v, viewport - content - PAD, PAD);
      };
      return {
        panX: clampAxis(pan.panX, rect.width, cs.w * s),
        panY: clampAxis(pan.panY, rect.height, cs.h * s),
      };
    },
    [getContainerRect, scaleOf],
  );

  const fitToView = useCallback(() => {
    const cp = centerPan(1, contentSizeRef.current);
    setState({ zoom: 1, panX: cp.panX, panY: cp.panY });
  }, [centerPan]);

  /** Zoom toward a point in container-relative coordinates, keeping it fixed. */
  const zoomAt = useCallback(
    (nextZoom: number, relX: number, relY: number) => {
      const s = stateRef.current;
      const z = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
      const curScale = scaleOf(s.zoom);
      const newScale = scaleOf(z);
      const contentX = (relX - s.panX) / curScale;
      const contentY = (relY - s.panY) / curScale;
      const p = clampPan(
        { panX: relX - contentX * newScale, panY: relY - contentY * newScale },
        z,
        contentSizeRef.current,
      );
      setState({ zoom: z, panX: p.panX, panY: p.panY });
    },
    [scaleOf, clampPan],
  );

  const zoomCenter = useCallback(
    (nextZoom: number) => {
      const rect = getContainerRect();
      if (!rect) return;
      zoomAt(nextZoom, rect.width / 2, rect.height / 2);
    },
    [getContainerRect, zoomAt],
  );

  // Recenter to fit whenever the content becomes available / changes size.
  const csw = contentSize?.w;
  const csh = contentSize?.h;
  useEffect(() => {
    if (!csw || !csh || !enabled) return;
    const cp = centerPan(1, { w: csw, h: csh });
    setState({ zoom: 1, panX: cp.panX, panY: cp.panY });
  }, [csw, csh, enabled, centerPan]);

  // Wheel: ctrl/meta zooms at the cursor, otherwise pans.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !enabled) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        const factor = Math.exp(-e.deltaY * 0.002);
        zoomAt(stateRef.current.zoom * factor, e.clientX - rect.left, e.clientY - rect.top);
      } else {
        setState((s) => {
          const p = clampPan(
            { panX: s.panX - e.deltaX, panY: s.panY - e.deltaY },
            s.zoom,
            contentSizeRef.current,
          );
          return { ...s, panX: p.panX, panY: p.panY };
        });
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [containerRef, enabled, zoomAt, clampPan]);

  // Mouse drag pan.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !enabled) return;
    let dragging = false;
    let pointerId = -1;
    let startX = 0;
    let startY = 0;
    let startPanX = 0;
    let startPanY = 0;
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || e.pointerType === "touch") return;
      dragging = true;
      pointerId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      startPanX = stateRef.current.panX;
      startPanY = stateRef.current.panY;
      el.style.cursor = "grabbing";
      e.preventDefault();
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging || e.pointerId !== pointerId) return;
      setState((s) => {
        const p = clampPan(
          { panX: startPanX + (e.clientX - startX), panY: startPanY + (e.clientY - startY) },
          s.zoom,
          contentSizeRef.current,
        );
        return { ...s, panX: p.panX, panY: p.panY };
      });
    };
    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      pointerId = -1;
      el.style.cursor = "";
    };
    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [containerRef, enabled, clampPan]);

  // Touch: pinch zoom + drag pan (non-passive so the browser's gestures don't win).
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !enabled) return;
    let startDist = 0;
    let startZoom = 1;
    let lastMid = { x: 0, y: 0 };
    let lastPanX = 0;
    let lastPanY = 0;
    let isPanning = false;
    const dist = (a: Touch, b: Touch) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const mid = (a: Touch, b: Touch) => ({
      x: (a.clientX + b.clientX) / 2,
      y: (a.clientY + b.clientY) / 2,
    });
    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        startDist = dist(e.touches[0]!, e.touches[1]!);
        startZoom = stateRef.current.zoom;
        lastMid = mid(e.touches[0]!, e.touches[1]!);
        lastPanX = stateRef.current.panX;
        lastPanY = stateRef.current.panY;
      } else if (e.touches.length === 1) {
        isPanning = true;
        lastMid = { x: e.touches[0]!.clientX, y: e.touches[0]!.clientY };
        lastPanX = stateRef.current.panX;
        lastPanY = stateRef.current.panY;
      }
    };
    const onMove = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const d = dist(e.touches[0]!, e.touches[1]!);
        const m = mid(e.touches[0]!, e.touches[1]!);
        const rect = el.getBoundingClientRect();
        const relX = m.x - rect.left;
        const relY = m.y - rect.top;
        const nextZoom = clamp((startZoom * d) / startDist, MIN_ZOOM, MAX_ZOOM);
        const curScale = scaleOf(startZoom);
        const newScale = scaleOf(nextZoom);
        const contentX = (relX - lastPanX) / curScale;
        const contentY = (relY - lastPanY) / curScale;
        const dx = m.x - lastMid.x;
        const dy = m.y - lastMid.y;
        const nx = relX - contentX * newScale + dx;
        const ny = relY - contentY * newScale + dy;
        const p = clampPan({ panX: nx, panY: ny }, nextZoom, contentSizeRef.current);
        setState({ zoom: nextZoom, panX: p.panX, panY: p.panY });
        lastMid = m;
        lastPanX = p.panX;
        lastPanY = p.panY;
        startZoom = nextZoom;
        startDist = d;
        isPanning = false;
      } else if (e.touches.length === 1 && isPanning) {
        const dx = e.touches[0]!.clientX - lastMid.x;
        const dy = e.touches[0]!.clientY - lastMid.y;
        setState((s) => {
          const p = clampPan(
            { panX: lastPanX + dx, panY: lastPanY + dy },
            s.zoom,
            contentSizeRef.current,
          );
          return { ...s, panX: p.panX, panY: p.panY };
        });
      }
    };
    const onEnd = (e: TouchEvent) => {
      if (e.touches.length === 0) {
        isPanning = false;
        startDist = 0;
      } else if (e.touches.length === 1) {
        isPanning = true;
        lastMid = { x: e.touches[0]!.clientX, y: e.touches[0]!.clientY };
        lastPanX = stateRef.current.panX;
        lastPanY = stateRef.current.panY;
      }
    };
    el.addEventListener("touchstart", onStart, { passive: false });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: true });
    el.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [containerRef, enabled, scaleOf, clampPan]);

  // Double-click / double-tap toggles between fit and 2x at the cursor.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !enabled) return;
    const onDblClick = (e: MouseEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const s = stateRef.current;
      if (s.zoom > 1.1) {
        const cp = centerPan(1, contentSizeRef.current);
        setState({ zoom: 1, panX: cp.panX, panY: cp.panY });
      } else {
        zoomAt(2, e.clientX - rect.left, e.clientY - rect.top);
      }
    };
    el.addEventListener("dblclick", onDblClick);
    return () => el.removeEventListener("dblclick", onDblClick);
  }, [containerRef, enabled, zoomAt, centerPan]);

  return { ...state, zoomAt, zoomCenter, fitToView, setState, clampPan };
}
