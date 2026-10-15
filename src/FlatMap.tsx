import { useRef, useState } from "react";
import type { Country } from "./data";
export function FlatMap({
  countries,
  select,
}: {
  countries: Country[];
  select: (code: string) => void;
}) {
  const [zoom, setZoom] = useState(1),
    [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(
    null,
  );
  return (
    <div style={{ width: "100%" }}>
      <div className="tools">
        <button
          aria-label="地图放大"
          onClick={() => setZoom((z) => Math.min(5, z + 0.5))}
        >
          ＋
        </button>
        <button
          aria-label="地图缩小"
          onClick={() => setZoom((z) => Math.max(1, z - 0.5))}
        >
          −
        </button>
        <button
          onClick={() => {
            setZoom(1);
            setPan({ x: 0, y: 0 });
          }}
        >
          复位
        </button>
      </div>
      <svg
        className="flat-map"
        viewBox="0 0 1000 500"
        aria-label="可拖动缩放的国家地图"
        style={{ touchAction: "none" }}
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (drag.current)
            setPan({
              x:
                drag.current.px +
                ((e.clientX - drag.current.x) * 1000) /
                  e.currentTarget.clientWidth,
              y:
                drag.current.py +
                ((e.clientY - drag.current.y) * 500) /
                  e.currentTarget.clientHeight,
            });
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
      >
        <g
          transform={`translate(${pan.x + 500} ${pan.y + 250}) scale(${zoom}) translate(-500 -250)`}
        >
          <image href="/world.svg" width="1000" height="500" />
          {countries.map((c) => (
            <g
              key={c.code}
              onPointerDown={(e) => e.stopPropagation()}
              tabIndex={0}
              role="button"
              aria-label={c.name + " " + c.count + " 个频道"}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  select(c.code);
                }
              }}
              onClick={() => select(c.code)}
            >
              <circle
                cx={((c.lng + 180) / 360) * 1000}
                cy={((90 - c.lat) / 180) * 500}
                r={c.count ? 5 : 3}
                style={{ fill: c.count ? "#a2f3cf" : "#6b7774" }}
              />
              <title>
                {c.name} · {c.count} 个收录频道（国家级位置）
              </title>
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}
