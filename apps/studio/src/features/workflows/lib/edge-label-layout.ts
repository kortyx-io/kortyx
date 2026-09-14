export type Point = { x: number; y: number };
export type Rectangle = Point & { width: number; height: number };
export type EdgeLabel = Rectangle;
export type LabeledRoute = {
  id: string;
  points: Point[];
  label?: EdgeLabel;
};

function padded(rect: Rectangle, gap: number): Rectangle {
  return {
    x: rect.x - gap,
    y: rect.y - gap,
    width: rect.width + gap * 2,
    height: rect.height + gap * 2,
  };
}

export function rectanglesOverlap(a: Rectangle, b: Rectangle) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

// Clip a segment against a rectangle, including its boundary.
export function segmentIntersectsRectangle(
  a: Point,
  b: Point,
  rect: Rectangle,
) {
  let start = 0;
  let end = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const p = [-dx, dx, -dy, dy];
  const q = [
    a.x - rect.x,
    rect.x + rect.width - a.x,
    a.y - rect.y,
    rect.y + rect.height - a.y,
  ];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) start = Math.max(start, t);
      else end = Math.min(end, t);
      if (start > end) return false;
    }
  }
  return true;
}

/** Dagre reserves label space but diagonal segments can still clip labels.
 * Place each label beside a route, checking ALL routes, cards and prior labels.
 * Coordinates of labels are centers; obstacle rectangles use top-left corners.
 */
export function placeEdgeLabels(
  routes: LabeledRoute[],
  nodes: Rectangle[],
  minimum: Point = { x: 0, y: 0 },
) {
  const labels = new Map<string, EdgeLabel>();
  const obstacles = nodes.map((node) => padded(node, 8));
  const segments = routes.flatMap((route) =>
    route.points.slice(1).map((end, i) => [route.points[i], end] as const),
  );
  for (const route of routes) {
    const label = route.label;
    if (!label) continue;
    const fits = (point: Point) => {
      const rect = {
        x: point.x - label.width / 2,
        y: point.y - label.height / 2,
        width: label.width,
        height: label.height,
      };
      return (
        rect.x >= minimum.x &&
        rect.y >= minimum.y &&
        !obstacles.some((obstacle) => rectanglesOverlap(rect, obstacle)) &&
        !segments.some(([a, b]) =>
          segmentIntersectsRectangle(a, b, padded(rect, 8)),
        )
      );
    };
    let position: Point | undefined = fits(label) ? label : undefined;
    for (const gap of [12, 24, 40, 64, 96, 144, 216, 320, 480]) {
      if (position) break;
      const candidates: Point[] = [];
      for (let i = 1; i < route.points.length; i++) {
        const a = route.points[i - 1];
        const b = route.points[i];
        const length = Math.hypot(b.x - a.x, b.y - a.y);
        if (!length) continue;
        const nx = -(b.y - a.y) / length;
        const ny = (b.x - a.x) / length;
        const offset =
          (Math.abs(nx) * label.width + Math.abs(ny) * label.height) / 2 + gap;
        for (const fraction of [0.5, 0.25, 0.75, 0.1, 0.9]) {
          for (const side of [-1, 1])
            candidates.push({
              x: a.x + (b.x - a.x) * fraction + nx * offset * side,
              y: a.y + (b.y - a.y) * fraction + ny * offset * side,
            });
        }
      }
      candidates.sort(
        (a, b) =>
          Math.hypot(a.x - label.x, a.y - label.y) -
          Math.hypot(b.x - label.x, b.y - label.y),
      );
      position = candidates.find(fits);
    }
    // A dense graph may have no nearby free pocket. Its outer margin is always
    // available; keep the label visible rather than covering a connection.
    if (!position) {
      const right = Math.max(
        minimum.x,
        ...obstacles.map((rect) => rect.x + rect.width),
        ...segments.flatMap(([a, b]) => [a.x, b.x]),
      );
      position = {
        x: right + label.width / 2 + 24,
        y: Math.max(minimum.y + label.height / 2, label.y),
      };
    }
    const placed = { ...label, ...position };
    labels.set(route.id, placed);
    obstacles.push(
      padded(
        {
          ...placed,
          x: placed.x - placed.width / 2,
          y: placed.y - placed.height / 2,
        },
        10,
      ),
    );
  }
  return labels;
}
