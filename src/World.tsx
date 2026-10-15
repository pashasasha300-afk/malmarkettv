import { useEffect, useRef, useState } from "react";
import Globe from "react-globe.gl";
import type { Country } from "./data";
export default function World({
  countries,
  select,
  fallback,
  compact = false,
}: {
  countries: Country[];
  select: (s: string) => void;
  fallback: () => void;
  compact?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 }),
    [supported, setSupported] = useState(false);
  const fallbackRef = useRef(fallback);
  fallbackRef.current = fallback;
  useEffect(() => {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("webgl2");
    if (!context) {
      fallbackRef.current();
      return;
    }
    context.getExtension("WEBGL_lose_context")?.loseContext();
    setSupported(true);
    const observer = new ResizeObserver(([entry]) =>
      setSize({
        w: Math.floor(entry.contentRect.width),
        h: Math.min(compact ? 280 : 560, Math.floor(entry.contentRect.width)),
      }),
    );
    if (root.current) observer.observe(root.current);
    return () => observer.disconnect();
  }, [compact]);
  return (
    <div
      ref={root}
      className="globe"
      style={{ minHeight: compact ? 220 : 320 }}
    >
      {supported && size.w > 0 && (
        <Globe
          width={size.w}
          height={size.h}
          backgroundColor="#0b1117"
          globeImageUrl="/earth.jpg"
          showAtmosphere
          atmosphereColor="#5ddac6"
          atmosphereAltitude={0.13}
          pointsData={countries}
          pointLat="lat"
          pointLng="lng"
          pointColor={(d) => ((d as Country).count ? "#a2f3cf" : "#657970")}
          pointAltitude={0.012}
          pointRadius={0.45}
          pointLabel={(d) => {
            const c = d as Country;
            return `${c.name} · ${c.count} 个频道（国家级位置）`;
          }}
          onPointClick={(d) => select((d as Country).code)}
          animateIn={false}
        />
      )}
    </div>
  );
}
