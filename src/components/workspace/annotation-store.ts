/**
 * annotation-store — state global pour l'annotation pinceau sur la preview.
 *
 * Permet à Dev3Chat (côté chat) et à WorkspacePreview (côté iframe) de
 * partager l'état du mode dessin et la liste des strokes via subscribe.
 *
 * Coordonnées normalisées 0..1 (relatives à la bbox de la preview) → restent
 * valides quand on resize la fenêtre.
 */
export type Point = { x: number; y: number };
export type Stroke = {
  id: string;
  points: Point[]; // normalisés 0..1
  color: string;
};

type State = {
  active: boolean;
  strokes: Stroke[];
};

type Listener = (s: State) => void;

const listeners = new Set<Listener>();
let state: State = { active: false, strokes: [] };

function emit() {
  for (const l of listeners) l(state);
}

export const annotationStore = {
  get(): State {
    return state;
  },
  subscribe(l: Listener): () => void {
    listeners.add(l);
    l(state);
    return () => listeners.delete(l);
  },
  setActive(v: boolean) {
    state = { ...state, active: v };
    emit();
  },
  toggle() {
    state = { ...state, active: !state.active };
    emit();
  },
  addStroke(s: Stroke) {
    state = { ...state, strokes: [...state.strokes, s] };
    emit();
  },
  updateStroke(id: string, points: Point[]) {
    state = {
      ...state,
      strokes: state.strokes.map((s) => (s.id === id ? { ...s, points } : s)),
    };
    emit();
  },
  removeStroke(id: string) {
    state = { ...state, strokes: state.strokes.filter((s) => s.id !== id) };
    emit();
  },
  clear() {
    state = { ...state, strokes: [] };
    emit();
  },
  /**
   * Sérialise les zones annotées en texte naturel pour Elena.
   * Renvoie "" s'il n'y a aucun stroke.
   */
  serialize(): string {
    if (state.strokes.length === 0) return "";
    const zones = state.strokes.map((s, i) => {
      const xs = s.points.map((p) => p.x);
      const ys = s.points.map((p) => p.y);
      const minX = Math.round(Math.min(...xs) * 100);
      const maxX = Math.round(Math.max(...xs) * 100);
      const minY = Math.round(Math.min(...ys) * 100);
      const maxY = Math.round(Math.max(...ys) * 100);
      return `Zone ${i + 1} : entre x=${minX}% et x=${maxX}%, y=${minY}% et y=${maxY}% de la preview`;
    });
    return `\n\n[Annotations visuelles dessinées sur la preview]\n${zones.join("\n")}\n`;
  },
};
