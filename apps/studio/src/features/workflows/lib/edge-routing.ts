import {
  type Point,
  type Rectangle,
  segmentIntersectsRectangle,
} from "./edge-label-layout";

type Obstacle = Rectangle & { id: string };

/** Preserve Dagre's lanes, detouring only segments that cut through a card. */
export function routeAroundNodes(
  points: Point[],
  nodes: Obstacle[],
  source: string,
  target: string,
  clearance = 14,
): Point[] {
  const obstacles = nodes.map((node) => {
    const gap = node.id === source || node.id === target ? 0 : clearance;
    return {
      x: node.x - gap,
      y: node.y - gap,
      width: node.width + gap * 2,
      height: node.height + gap * 2,
    };
  });
  // Boundary travel is allowed; interiors are not.
  const interiors = obstacles.map((rect) => ({
    x: rect.x + 0.01,
    y: rect.y + 0.01,
    width: rect.width - 0.02,
    height: rect.height - 0.02,
  }));
  const blocked = (a: Point, b: Point) =>
    interiors.some((rect) => segmentIntersectsRectangle(a, b, rect));
  const corners = obstacles
    .flatMap((rect) => [
      { x: rect.x, y: rect.y },
      { x: rect.x + rect.width, y: rect.y },
      { x: rect.x, y: rect.y + rect.height },
      { x: rect.x + rect.width, y: rect.y + rect.height },
    ])
    .filter((point) => !blocked(point, point));
  const waypoints = points.filter(
    (point, i) => i === 0 || i === points.length - 1 || !blocked(point, point),
  );
  const result: Point[] = waypoints.slice(0, 1);
  for (let i = 1; i < waypoints.length; i++) {
    const start = waypoints[i - 1];
    const end = waypoints[i];
    if (!blocked(start, end)) {
      result.push(end);
      continue;
    }
    const vertices = [start, end, ...corners];
    const distance = vertices.map(() => Infinity);
    const previous = vertices.map(() => -1);
    const visited = new Set<number>();
    distance[0] = 0;
    while (visited.size < vertices.length) {
      let current = -1;
      for (let j = 0; j < vertices.length; j++) {
        if (!visited.has(j) && (current < 0 || distance[j] < distance[current]))
          current = j;
      }
      if (current < 0 || !Number.isFinite(distance[current]) || current === 1)
        break;
      visited.add(current);
      for (let j = 0; j < vertices.length; j++) {
        if (visited.has(j) || blocked(vertices[current], vertices[j])) continue;
        const cost =
          distance[current] +
          Math.hypot(
            vertices[current].x - vertices[j].x,
            vertices[current].y - vertices[j].y,
          ) +
          0.1;
        if (cost < distance[j]) {
          distance[j] = cost;
          previous[j] = current;
        }
      }
    }
    const detour: Point[] = [];
    for (let j = 1; j > 0; j = previous[j]) detour.unshift(vertices[j]);
    result.push(...detour);
  }
  return result;
}
