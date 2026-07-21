/**
 * AnnotationLayer — overlay SVG par-dessus la preview iframe.
 *
 * Rendu uniquement quand le mode pinceau est actif (annotationStore.active).
 * Capture pointer events :
 *   - clic + drag dans le vide  → trace un nouveau stroke
 *   - clic sur un stroke existant → le sélectionne (affiche bouton X)
 *   - drag depuis un stroke sélectionné → déplace le stroke
 *   - clic sur le X → supprime le stroke
 *
 * Coordonnées stockées normalisées 0..1, recalculées à chaque pointer event
 * via la bounding rect de l'overlay.
 */
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { annotationStore, type Stroke, type Point } from "./annotation-store";

const STROKE_COLOR = "#a78bfa"; // violet-400 (assorti à Elena)
const STROKE_WIDTH = 4;

function strokeBBox(points: Point[]) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

function pathFromPoints(points: Point[], width: number, height: number): string {
  if (points.length === 0) return "";
  return points
    .map((p, i) => `${i === 0 ? "M" : "L"}${(p.x * width).toFixed(1)},${(p.y * height).toFixed(1)}`)
    .join(" ");
}

export function AnnotationLayer() {
  const [state, setState] = useState(annotationStore.get());
  const [drawing, setDrawing] = useState<Stroke | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const dragRef = useRef<{ id: string; lastX: number; lastY: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => annotationStore.subscribe(setState), []);

  // Track size of the overlay for SVG path conversion
  useEffect(() => {
    if (!svgRef.current) return;
    const obs = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) setSize({ w: r.width, h: r.height });
    });
    obs.observe(svgRef.current);
    return () => obs.disconnect();
  }, [state.active]);

  if (!state.active) return null;

  const toNormalized = (clientX: number, clientY: number): Point => {
    const rect = svgRef.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)),
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const targetId = (e.target as Element).getAttribute?.("data-stroke-id");
    if (targetId) {
      // start dragging this stroke
      setSelectedId(targetId);
      dragRef.current = { id: targetId, lastX: e.clientX, lastY: e.clientY };
      return;
    }
    // start a new stroke
    setSelectedId(null);
    const p = toNormalized(e.clientX, e.clientY);
    setDrawing({ id: `s_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, points: [p], color: STROKE_COLOR });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (dragRef.current) {
      const drag = dragRef.current;
      const rect = svgRef.current!.getBoundingClientRect();
      const dx = (e.clientX - drag.lastX) / rect.width;
      const dy = (e.clientY - drag.lastY) / rect.height;
      drag.lastX = e.clientX;
      drag.lastY = e.clientY;
      const stroke = state.strokes.find((s) => s.id === drag.id);
      if (stroke) {
        annotationStore.updateStroke(
          drag.id,
          stroke.points.map((p) => ({
            x: Math.max(0, Math.min(1, p.x + dx)),
            y: Math.max(0, Math.min(1, p.y + dy)),
          })),
        );
      }
      return;
    }
    if (drawing) {
      const p = toNormalized(e.clientX, e.clientY);
      setDrawing({ ...drawing, points: [...drawing.points, p] });
    }
  };

  const onPointerUp = () => {
    if (dragRef.current) {
      dragRef.current = null;
      return;
    }
    if (drawing) {
      if (drawing.points.length > 2) {
        annotationStore.addStroke(drawing);
      }
      setDrawing(null);
    }
  };

  const w = size.w;
  const h = size.h;

  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      {/* Bandeau d'aide en haut */}
      <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full border border-violet-500/40 bg-slate-900/85 px-3 py-1.5 text-[11px] text-violet-200 shadow-lg backdrop-blur">
        🖌 Mode pinceau — dessine sur la preview pour montrer à Elena où agir.
        Clique sur un trait pour le déplacer ou le supprimer.
      </div>

      <svg
        ref={svgRef}
        className="pointer-events-auto absolute inset-0 h-full w-full cursor-crosshair"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {/* Existing strokes */}
        {state.strokes.map((s) => {
          const isSelected = s.id === selectedId;
          const bb = strokeBBox(s.points);
          return (
            <g key={s.id}>
              <path
                data-stroke-id={s.id}
                d={pathFromPoints(s.points, w, h)}
                stroke={s.color}
                strokeWidth={STROKE_WIDTH}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
                style={{ cursor: "move", filter: isSelected ? "drop-shadow(0 0 6px rgba(167,139,250,0.7))" : undefined }}
              />
              {isSelected && (
                <>
                  <rect
                    x={bb.minX * w - 6}
                    y={bb.minY * h - 6}
                    width={(bb.maxX - bb.minX) * w + 12}
                    height={(bb.maxY - bb.minY) * h + 12}
                    fill="none"
                    stroke="#a78bfa"
                    strokeDasharray="4 4"
                    strokeWidth={1}
                    pointerEvents="none"
                  />
                  <foreignObject
                    x={bb.maxX * w}
                    y={bb.minY * h - 26}
                    width={28}
                    height={28}
                    style={{ overflow: "visible" }}
                  >
                    <button
                      onClick={(ev) => {
                        ev.stopPropagation();
                        annotationStore.removeStroke(s.id);
                        setSelectedId(null);
                      }}
                      className="flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white shadow hover:bg-red-600"
                      title="Supprimer ce trait"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </foreignObject>
                </>
              )}
            </g>
          );
        })}
        {/* In-progress stroke */}
        {drawing && (
          <path
            d={pathFromPoints(drawing.points, w, h)}
            stroke={drawing.color}
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            opacity={0.8}
          />
        )}
      </svg>

      {/* Bouton "tout effacer" en bas-droite */}
      {state.strokes.length > 0 && (
        <button
          onClick={() => {
            annotationStore.clear();
            setSelectedId(null);
          }}
          className="pointer-events-auto absolute bottom-3 right-3 rounded-md border border-slate-700 bg-slate-900/85 px-2.5 py-1 text-[11px] text-slate-300 shadow hover:border-red-500/50 hover:text-red-300"
        >
          Tout effacer ({state.strokes.length})
        </button>
      )}
    </div>
  );
}
