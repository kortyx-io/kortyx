import { OVERLAY_LAYERS } from "@/lib/overlay-layers";

export type DetailLayerRegistration = {
  dismissPath: string;
  id: string;
  matchPath: string;
};

export type DetailLayer = DetailLayerRegistration & {
  closing: boolean;
  expanded: boolean;
  splitOpen: boolean;
};

export function registerDetailLayer(
  layers: DetailLayer[],
  registration: DetailLayerRegistration,
): DetailLayer[] {
  const existing = layers.find((layer) => layer.id === registration.id);
  if (!existing) {
    return [
      ...layers,
      {
        ...registration,
        closing: false,
        expanded: false,
        splitOpen: false,
      },
    ];
  }
  return layers.map((layer) =>
    layer.id === registration.id
      ? { ...layer, ...registration, closing: false }
      : layer,
  );
}

export function setDetailLayerClosing(
  layers: DetailLayer[],
  id: string,
  closing: boolean,
): DetailLayer[] {
  return layers.map((layer) =>
    layer.id === id ? { ...layer, closing } : layer,
  );
}

export function expandDetailLayer(
  layers: DetailLayer[],
  id: string,
): DetailLayer[] {
  return layers.map((layer) =>
    layer.id === id ? { ...layer, expanded: true } : layer,
  );
}

export function setDetailLayerSplitOpen(
  layers: DetailLayer[],
  id: string,
  splitOpen: boolean,
): DetailLayer[] {
  return layers.map((layer) =>
    layer.id === id ? { ...layer, splitOpen } : layer,
  );
}

export function closeDetailLayersAbove(
  layers: DetailLayer[],
  id: string,
): DetailLayer[] {
  const ancestorIndex = layers.findIndex((layer) => layer.id === id);
  if (ancestorIndex < 0) return layers;
  return layers.map((layer, index) =>
    index > ancestorIndex ? { ...layer, closing: true } : layer,
  );
}

export function closeAllDetailLayers(layers: DetailLayer[]): DetailLayer[] {
  return layers.map((layer) => ({ ...layer, closing: true }));
}

export function getDetailBackdropState(layers: DetailLayer[]) {
  const topIndex = layers.findLastIndex((layer) => !layer.closing);
  const activeLayers = layers.filter((layer) => !layer.closing);

  return {
    activeCount: activeLayers.length,
    topActiveExpanded: activeLayers.at(-1)?.expanded === true,
    topIndex,
    // Keep one backdrop behind every drawer surface. Putting it between
    // stacked layers blocks the visible ancestor slivers that intentionally
    // let users peel the stack back to an earlier entity.
    zIndex: OVERLAY_LAYERS.detailBackdrop,
  };
}

export function syncDetailLayersToHistoryPath(
  layers: DetailLayer[],
  pathname: string,
  detailBasePaths: readonly string[] = [],
): DetailLayer[] {
  const targetIndex = layers.findLastIndex(
    (layer) => layer.matchPath === pathname,
  );
  if (targetIndex < 0) {
    // On Browser Forward the destination parallel route can register one
    // render after popstate. Preserve valid ancestors until that child joins
    // the stack; list routes still close every layer immediately.
    return isDetailPath(pathname, detailBasePaths)
      ? layers
      : closeAllDetailLayers(layers);
  }
  return layers.map((layer, index) => ({
    ...layer,
    closing: index > targetIndex,
  }));
}

export function isDetailLayerActiveForHistory(
  layers: DetailLayer[],
  dismissPath: string,
  pathname: string,
  detailBasePaths: readonly string[],
): boolean {
  const layerIndex = layers.findLastIndex(
    (layer) => layer.dismissPath === dismissPath,
  );
  if (layerIndex < 0) return false;

  const targetIndex = layers.findLastIndex(
    (layer) => layer.matchPath === pathname,
  );
  if (targetIndex >= 0) {
    // A departing drawer of the same resource can follow the restored ancestor.
    return layers
      .slice(0, targetIndex + 1)
      .some((layer) => layer.dismissPath === dismissPath && !layer.closing);
  }

  const opensNewDetail = isDetailPath(pathname, detailBasePaths);
  return opensNewDetail && !layers[layerIndex].closing;
}

function isDetailPath(pathname: string, detailBasePaths: readonly string[]) {
  return detailBasePaths.some(
    (basePath) =>
      pathname.startsWith(`${basePath}/`) &&
      pathname.slice(basePath.length + 1).length > 0,
  );
}

export type DetailHistorySnapshot = {
  pathname: string;
  layers: DetailLayer[];
};

export function readDetailHistorySnapshot(
  value: unknown,
  pathname: string,
): DetailHistorySnapshot | null {
  if (!value || typeof value !== "object") return null;
  const snapshot = value as Partial<DetailHistorySnapshot>;
  if (snapshot.pathname !== pathname || !Array.isArray(snapshot.layers))
    return null;
  if (
    !snapshot.layers.every(
      (layer) =>
        layer &&
        typeof layer.id === "string" &&
        typeof layer.matchPath === "string" &&
        typeof layer.dismissPath === "string" &&
        typeof layer.closing === "boolean" &&
        typeof layer.expanded === "boolean" &&
        typeof layer.splitOpen === "boolean",
    )
  )
    return null;
  return snapshot as DetailHistorySnapshot;
}

export function restoreDetailLayersFromHistory(
  current: DetailLayer[],
  restored: DetailLayer[],
): DetailLayer[] {
  const ids = new Set(restored.map((layer) => layer.id));
  const splitOpen = new Map(
    current.map((layer) => [layer.id, layer.splitOpen]),
  );
  return [
    // Split panes belong to the currently mounted inspector, not history.
    ...restored.map((layer) => ({
      ...layer,
      closing: false,
      splitOpen: splitOpen.get(layer.id) ?? false,
    })),
    // Keep departing surfaces registered long enough to animate out.
    ...current
      .filter((layer) => !ids.has(layer.id))
      .map((layer) => ({ ...layer, closing: true })),
  ];
}
