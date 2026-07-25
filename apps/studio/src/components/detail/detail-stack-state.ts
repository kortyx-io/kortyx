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

export function expandDetailLayerAndAncestors(
  layers: DetailLayer[],
  id: string,
): DetailLayer[] {
  const expandedIndex = layers.findIndex((layer) => layer.id === id);
  if (expandedIndex < 0) return layers;
  return layers.map((layer, index) =>
    index <= expandedIndex ? { ...layer, expanded: true } : layer,
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

export function syncDetailLayersToHistoryPath(
  layers: DetailLayer[],
  pathname: string,
): DetailLayer[] {
  const targetIndex = layers.findLastIndex(
    (layer) => layer.matchPath === pathname,
  );
  if (targetIndex < 0) return closeAllDetailLayers(layers);
  return layers.map((layer, index) => ({
    ...layer,
    closing: index > targetIndex,
  }));
}
