import { useEffect, useRef, useState } from "react";
import Globe from "react-globe.gl";
import type { Country } from "./data";
export default function World({
  countries,
  select,
  fallback,
}: {
  countries: Country[];
  select: (s: string) => void;
  fallback: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 600, h: 460 });
  useEffect(() => {
    const canvas = document.createElement("canvas");
    if (!canvas.getContext("webgl2")) {
      fallback();
      return;
    }
    const observer = new ResizeObserver(([entry]) =>
      setSize({
        w: entry.contentRect.width,
        h: Math.min(500, entry.contentRect.width),
      }),
    );
    if (root.current) observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={root} className="globe">
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
        pointColor={() => "#a2f3cf"}
        pointAltitude={0.012}
        pointRadius={0.45}
        pointLabel={(d) => {
          const c = d as Country;
          return `${c.code} · ${c.count} channels (country location)`;
        }}
        onPointClick={(d) => select((d as Country).code)}
        animateIn={false}
      />
    </div>
  );
}
