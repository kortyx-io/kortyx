"use client";

import {
  closestCenter,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import {
  type CSSProperties,
  createContext,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  clampScrollViewport,
  syncHorizontalScroll,
} from "@/components/data-table/clamp-scroll-viewport";
import {
  type ColumnMotion,
  type ColumnPin,
  DATA_TABLE_MIN_COLUMN_WIDTH,
  type DataTableColumn,
  type DataTableLayout,
} from "@/components/data-table/types";
import { studioFeature } from "@/usage/client";
import { columnLayout, columnWidths } from "./column-layout";

type LayoutSnapshot = Partial<DataTableLayout>;

function validatePinned(
  pinned: Partial<Record<string, ColumnPin>> | undefined,
  defaultOrder: string[],
): Partial<Record<string, ColumnPin>> | undefined {
  if (!pinned) return undefined;
  return Object.fromEntries(
    Object.entries(pinned).filter(
      ([column, side]) =>
        defaultOrder.includes(column) && (side === "left" || side === "right"),
    ),
  );
}

export type DataTableContextValue<T = unknown, S extends string = string> = {
  columns: DataTableColumn<T, S>[];
  columnsByKey: Record<string, DataTableColumn<T, S>>;
  defaultOrder: string[];
  widths: Record<string, number>;
  storedWidths: Record<string, number>;
  orderedColumnKeys: string[];
  moveColumn: (active: string, over: string) => void;
  order: string[];
  hidden: string[];
  pinned: Partial<Record<string, ColumnPin>>;
  visibleColumnOrder: string[];
  tableWidth: number;
  toggleColumnVisibility: (key: string) => void;
  showAllColumns: () => void;
  resetLayout: () => void;
  /** Replace every persisted layout field at once (for example, when applying a saved view). */
  applyLayout: (layout: Partial<DataTableLayout>) => void;
  resetColumnWidth: (key: string) => void;
  pinColumn: (key: string, side: ColumnPin) => void;
  unpinColumn: (key: string) => void;
  startColumnResize: (
    key: string,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
  isColumnDraggable: (key: string) => boolean;
  getPinnedColumnStyle: (key: string) => CSSProperties | undefined;
  getColumnCellMotion: (key: string) => ColumnMotion | undefined;
  sensors: ReturnType<typeof useSensors>;
  collisionDetection: (
    args: Parameters<typeof closestCenter>[0],
  ) => ReturnType<typeof closestCenter>;
  draggedColumn: string | null;
  isPinnedColumnDragging: boolean;
  onDragStart: (event: DragStartEvent) => void;
  onDragOver: (event: DragOverEvent) => void;
  onDragMove: (event: DragMoveEvent) => void;
  onDragCancel: () => void;
  onDragEnd: (event: DragEndEvent) => void;
  scrollerRef: RefObject<HTMLDivElement | null>;
  headerScrollerRef: RefObject<HTMLDivElement | null>;
};

const DataTableContext = createContext<DataTableContextValue | null>(null);

export function useDataTable<
  T = unknown,
  S extends string = string,
>(): DataTableContextValue<T, S> {
  const context = useContext(DataTableContext);
  if (!context) {
    throw new Error("useDataTable must be used within a <DataTableProvider>");
  }
  return context as unknown as DataTableContextValue<T, S>;
}

type DataTableProviderProps<T, S extends string> = {
  columns: DataTableColumn<T, S>[];
  /**
   * Initial layout to hydrate from (e.g. loaded from a user-profile DB row).
   * Read once on mount; invalid/unknown columns are ignored. Used
   * as a legacy seed when no newer browser layout exists.
   */
  initialLayout?: Partial<DataTableLayout>;
  /**
   * Called whenever the user changes the layout via any column control
   * (resize, reorder, pin, hide). Use this to persist to a DB/profile.
   * Debounce on the consumer side if writes are expensive.
   */
  onLayoutChange?: (layout: DataTableLayout) => void;
  /** localStorage key for persisting layout. Convenience for client-only apps. */
  persistKey?: string;
  preferenceLayout?: DataTableLayout;
  children: ReactNode;
};

function arrayMove<V>(array: V[], from: number, to: number): V[] {
  const next = array.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export function DataTableProvider<T, S extends string>({
  columns,
  initialLayout,
  onLayoutChange,
  persistKey,
  preferenceLayout,
  children,
}: DataTableProviderProps<T, S>) {
  const defaultOrder = useMemo(
    () => columns.map((column) => column.key),
    [columns],
  );
  const columnsByKey = useMemo(
    () =>
      Object.fromEntries(
        columns.map((column) => [column.key, column]),
      ) as Record<string, DataTableColumn<T, S>>,
    [columns],
  );
  const defaultWidths = useMemo(
    () =>
      Object.fromEntries(
        columns.map((column) => [column.key, column.defaultWidth]),
      ) as Record<string, number>,
    [columns],
  );

  const [widths, setWidths] = useState<Record<string, number>>(() =>
    columnWidths(columns, initialLayout?.widths),
  );
  const [order, setOrder] = useState<string[]>(
    () => columnLayout(columns, initialLayout).order,
  );
  const [hidden, setHidden] = useState<string[]>(
    () => columnLayout(columns, initialLayout).hidden,
  );
  const [pinned, setPinned] = useState<Partial<Record<string, ColumnPin>>>(
    () => validatePinned(initialLayout?.pinned, defaultOrder) ?? {},
  );
  const [draggedColumn, setDraggedColumn] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const dragStartScrollLeft = useRef(0);
  const pointerDragCleanup = useRef<(() => void) | null>(null);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const headerScrollerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => () => pointerDragCleanup.current?.(), []);
  const [viewportWidth, setViewportWidth] = useState(0);
  useLayoutEffect(() => {
    const viewport = scrollerRef.current;
    if (!viewport) return;
    const measure = () => setViewportWidth(viewport.clientWidth);
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    measure();
    return () => observer.disconnect();
  }, []);
  const onLayoutChangeRef = useRef(onLayoutChange);
  onLayoutChangeRef.current = onLayoutChange;
  const hasSettledRef = useRef(false);
  const restoringLayout = useRef<string | null>(null);
  const preferenceLayoutKey = JSON.stringify(preferenceLayout);
  // biome-ignore lint/correctness/useExhaustiveDependencies: apply external preferences only when their values change.
  useEffect(() => {
    if (!preferenceLayout) return;
    const restoredWidths = columnWidths(columns, preferenceLayout.widths);
    const restored = columnLayout(columns, preferenceLayout);
    const restoredPinned =
      validatePinned(preferenceLayout.pinned, defaultOrder) ?? {};
    if (
      JSON.stringify({ widths, order, hidden, pinned }) ===
      JSON.stringify({
        widths: restoredWidths,
        order: restored.order,
        hidden: restored.hidden,
        pinned: restoredPinned,
      })
    )
      return;
    restoringLayout.current = JSON.stringify({
      widths: restoredWidths,
      order: restored.order,
      hidden: restored.hidden,
      pinned: restoredPinned,
    });
    setWidths(restoredWidths);
    setOrder(restored.order);
    setHidden(restored.hidden);
    setPinned(restoredPinned);
  }, [preferenceLayoutKey]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: hydrate once on mount, not on column changes.
  useEffect(() => {
    // A legacy seed paints on the server; newer browser preferences hydrate here.
    if (!persistKey) {
      setPreferencesLoaded(true);
      return;
    }
    try {
      const raw = localStorage.getItem(persistKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as LayoutSnapshot & Record<string, number>;
      const savedWidths = saved.widths ?? saved;
      setWidths(columnWidths(columns, savedWidths));
      const migrated = columnLayout(columns, saved);
      setOrder(migrated.order);
      setHidden(migrated.hidden);
      const pinned = validatePinned(saved.pinned, defaultOrder);
      if (pinned) setPinned(pinned);
    } catch {
      // Ignore invalid local preferences.
    } finally {
      setPreferencesLoaded(true);
    }
  }, [persistKey]);

  useEffect(() => {
    if (!preferencesLoaded) return;
    const layout: DataTableLayout = { widths, order, hidden, pinned };
    if (persistKey) {
      try {
        localStorage.setItem(persistKey, JSON.stringify(layout));
      } catch {
        /* Storage can be unavailable; the table remains usable. */
      }
    }
    // An external restore can schedule state after this render's effects. Keep
    // suppressing writes until the restored layout itself has settled.
    if (restoringLayout.current) {
      if (JSON.stringify(layout) === restoringLayout.current)
        restoringLayout.current = null;
      hasSettledRef.current = true;
      return;
    }
    // Skip the initial settle so we only notify on real user changes.
    if (!hasSettledRef.current) {
      hasSettledRef.current = true;
      return;
    }
    onLayoutChangeRef.current?.(layout);
  }, [persistKey, preferencesLoaded, widths, order, hidden, pinned]);

  const orderedColumnKeys = useMemo(
    () => [
      ...order.filter((key) => pinned[key] === "left"),
      ...order.filter((key) => !pinned[key]),
      ...order.filter((key) => pinned[key] === "right"),
    ],
    [order, pinned],
  );
  const visibleColumnOrder = useMemo(
    () => orderedColumnKeys.filter((key) => !hidden.includes(key)),
    [orderedColumnKeys, hidden],
  );
  // Fill wide viewports without writing responsive sizes into saved preferences.
  // The same widths drive cells, sticky offsets, dragging, and resize handles.
  const renderedWidths = useMemo(() => {
    const total = visibleColumnOrder.reduce((sum, key) => sum + widths[key], 0);
    if (!total || total >= viewportWidth) return widths;
    const result = { ...widths };
    let consumed = 0;
    let cumulative = 0;
    for (const key of visibleColumnOrder) {
      cumulative += widths[key];
      const boundary = Math.round((cumulative / total) * viewportWidth);
      result[key] = boundary - consumed;
      consumed = boundary;
    }
    return result;
  }, [visibleColumnOrder, widths, viewportWidth]);
  const tableWidth = visibleColumnOrder.reduce(
    (sum, key) => sum + renderedWidths[key],
    0,
  );
  const isPinnedColumnDragging =
    draggedColumn !== null && Boolean(pinned[draggedColumn]);

  function toggleColumnVisibility(key: string) {
    studioFeature("studio.table.layout", { layout_action: "visibility" });
    setHidden((current) => {
      if (current.includes(key)) {
        return current.filter((item) => item !== key);
      }
      if (current.length === order.length - 1) return current;
      return [...current, key];
    });
  }

  function showAllColumns() {
    studioFeature("studio.table.layout", { layout_action: "show_all" });
    setHidden([]);
  }

  function resetLayout() {
    studioFeature("studio.table.layout", { layout_action: "reset" });
    setOrder(defaultOrder);
    setWidths(defaultWidths);
    setHidden([]);
    setPinned({});
  }

  function applyLayout(layout: Partial<DataTableLayout>) {
    studioFeature("studio.table.layout", { layout_action: "apply" });
    setWidths(columnWidths(columns, layout.widths));
    setOrder(columnLayout(columns, layout).order);
    setHidden(columnLayout(columns, layout).hidden);
    setPinned(validatePinned(layout.pinned, defaultOrder) ?? {});
  }

  function resetColumnWidth(key: string) {
    studioFeature("studio.table.layout", { layout_action: "reset_width" });
    setWidths((current) => ({ ...current, [key]: defaultWidths[key] }));
  }

  function pinColumn(key: string, side: ColumnPin) {
    studioFeature("studio.table.layout", { layout_action: "pin" });
    setPinned((current) => ({ ...current, [key]: side }));
  }

  function unpinColumn(key: string) {
    studioFeature("studio.table.layout", { layout_action: "unpin" });
    setPinned((current) => {
      const { [key]: _pin, ...remaining } = current;
      return remaining;
    });
  }

  function startColumnResize(
    key: string,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    studioFeature("studio.table.layout", { layout_action: "resize" });
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = renderedWidths[key];
    // Begin at the displayed sizes so grabbing a stretched column never jumps.
    const resizeWidths = { ...widths, ...renderedWidths };
    const scroller = scrollerRef.current;
    const headerScroller = headerScrollerRef.current;
    const startScrollLeft = scroller?.scrollLeft ?? 0;
    let latestClientX = startX;
    let frameId = 0;
    let active = true;

    const EDGE_THRESHOLD = 64;
    const MAX_SCROLL_SPEED_RIGHT = 6;

    function applyWidth() {
      const pointerDelta = latestClientX - startX;
      const scrollDelta = (scroller?.scrollLeft ?? 0) - startScrollLeft;
      // Scroll delta only applies while widening (auto-scroll at the right edge).
      const adjustedScrollDelta =
        pointerDelta > 0 ? Math.max(0, scrollDelta) : 0;

      setWidths({
        ...resizeWidths,
        [key]: Math.max(
          DATA_TABLE_MIN_COLUMN_WIDTH,
          Math.round(startWidth + pointerDelta + adjustedScrollDelta),
        ),
      });
    }

    function autoScroll(clientX: number) {
      if (!scroller) return;
      // No auto-scroll while narrowing — pointer-only resize.
      if (clientX <= startX) return;

      const rect = scroller.getBoundingClientRect();
      if (clientX > rect.right - EDGE_THRESHOLD) {
        const intensity = Math.min(
          1,
          (clientX - (rect.right - EDGE_THRESHOLD)) / EDGE_THRESHOLD,
        );
        scroller.scrollLeft += Math.ceil(MAX_SCROLL_SPEED_RIGHT * intensity);
        syncHorizontalScroll(scroller, headerScroller);
      }
    }

    function tick() {
      if (!active) return;
      autoScroll(latestClientX);
      applyWidth();
      frameId = requestAnimationFrame(tick);
    }

    function resize(moveEvent: PointerEvent) {
      latestClientX = moveEvent.clientX;
    }

    function stopResize() {
      active = false;
      cancelAnimationFrame(frameId);
      document.body.classList.remove("cursor-col-resize", "select-none");
      window.removeEventListener("pointermove", resize);
      window.removeEventListener("pointerup", stopResize);
      requestAnimationFrame(() => {
        clampScrollViewport(scroller, headerScroller);
      });
    }

    document.body.classList.add("cursor-col-resize", "select-none");
    frameId = requestAnimationFrame(tick);
    window.addEventListener("pointermove", resize);
    window.addEventListener("pointerup", stopResize, { once: true });
  }

  function isColumnDraggable(key: string) {
    return Boolean(columnsByKey[key]) && order.length > 1;
  }

  function moveColumn(active: string, over: string) {
    if (active === over || !columnsByKey[active] || !columnsByKey[over]) return;
    studioFeature("studio.table.layout", { layout_action: "reorder" });
    // Dropping into another pin group adopts that group, so even a sole pin can move.
    setPinned((current) => {
      const next = { ...current };
      if (current[over]) next[active] = current[over];
      else delete next[active];
      return next;
    });
    setOrder(
      arrayMove(
        orderedColumnKeys,
        orderedColumnKeys.indexOf(active),
        orderedColumnKeys.indexOf(over),
      ),
    );
  }

  function getPinnedColumnStyle(key: string): CSSProperties | undefined {
    const side = pinned[key];
    if (!side) return undefined;
    const pinnedOnSide = visibleColumnOrder.filter(
      (item) => pinned[item] === side,
    );
    const index = pinnedOnSide.indexOf(key);
    const offsetColumns =
      side === "left"
        ? pinnedOnSide.slice(0, index)
        : pinnedOnSide.slice(index + 1);
    const offset = offsetColumns.reduce(
      (total, item) => total + renderedWidths[item],
      0,
    );
    return side === "left" ? { left: offset } : { right: offset };
  }

  function getColumnCellMotion(key: string): ColumnMotion | undefined {
    if (!draggedColumn) return undefined;
    if (key === draggedColumn) {
      return { style: { transform: `translate3d(${dragOffset}px, 0, 0)` } };
    }
    if (!dragOverColumn) return undefined;
    const activeIndex = visibleColumnOrder.indexOf(draggedColumn);
    const overIndex = visibleColumnOrder.indexOf(dragOverColumn);
    const columnIndex = visibleColumnOrder.indexOf(key);
    if (activeIndex === -1 || overIndex === -1 || columnIndex === -1) {
      return undefined;
    }
    const shiftsLeft =
      activeIndex < overIndex &&
      columnIndex > activeIndex &&
      columnIndex <= overIndex;
    const shiftsRight =
      activeIndex > overIndex &&
      columnIndex >= overIndex &&
      columnIndex < activeIndex;
    if (!shiftsLeft && !shiftsRight) return undefined;
    const shift = renderedWidths[draggedColumn] * (shiftsLeft ? -1 : 1);
    return {
      style: {
        transform: `translate3d(${shift}px, 0, 0)`,
        transition: "transform 150ms ease",
      },
    };
  }

  const collisionDetection = closestCenter;

  function onDragStart(event: DragStartEvent) {
    const column = event.active.id as string;
    pointerDragCleanup.current?.();
    pointerDragCleanup.current = null;
    dragStartScrollLeft.current = headerScrollerRef.current?.scrollLeft ?? 0;
    setDragOffset(0);
    setDraggedColumn(column);
    setDragOverColumn(column);
    if (
      "clientX" in event.activatorEvent &&
      typeof event.activatorEvent.clientX === "number"
    ) {
      const startX = event.activatorEvent.clientX;
      let pointerX = startX;
      const startScrollLeft = dragStartScrollLeft.current;
      const header = headerScrollerRef.current;
      const body = scrollerRef.current;
      const sticky = Boolean(pinned[column]);
      // Use pointer coordinates and our own viewport once. Dnd-kit event deltas
      // also include changing node/ancestor scroll offsets, which can compensate
      // twice or reset when the collision target changes during a held scroll.
      const update = () =>
        setDragOffset(
          pointerX -
            startX +
            (sticky ? 0 : (header?.scrollLeft ?? 0) - startScrollLeft),
        );
      const move = (moveEvent: PointerEvent) => {
        pointerX = moveEvent.clientX;
        update();
      };
      window.addEventListener("pointermove", move);
      header?.addEventListener("scroll", update);
      body?.addEventListener("scroll", update);
      pointerDragCleanup.current = () => {
        window.removeEventListener("pointermove", move);
        header?.removeEventListener("scroll", update);
        body?.removeEventListener("scroll", update);
      };
    }
  }

  function onDragOver(event: DragOverEvent) {
    const overColumn = event.over?.id as string | undefined;
    setDragOverColumn(overColumn ?? null);
  }

  function onDragMove(event: DragMoveEvent) {
    if (pointerDragCleanup.current) return;
    // Keyboard sensor fallback; pointer drags use the shared viewport above.
    const scrollDelta =
      (headerScrollerRef.current?.scrollLeft ?? 0) -
      dragStartScrollLeft.current;
    setDragOffset(event.delta.x - scrollDelta);
  }

  function onDragCancel() {
    pointerDragCleanup.current?.();
    pointerDragCleanup.current = null;
    setDraggedColumn(null);
    setDragOverColumn(null);
    setDragOffset(0);
  }

  function onDragEnd(event: DragEndEvent) {
    pointerDragCleanup.current?.();
    pointerDragCleanup.current = null;
    setDraggedColumn(null);
    setDragOverColumn(null);
    setDragOffset(0);
    if (!event.over || event.active.id === event.over.id) return;
    const activeColumn = event.active.id as string;
    const overColumn = event.over.id as string;
    moveColumn(activeColumn, overColumn);
  }

  const value: DataTableContextValue<T, S> = {
    columns,
    columnsByKey,
    defaultOrder,
    widths: renderedWidths,
    storedWidths: widths,
    orderedColumnKeys,
    moveColumn,
    order,
    hidden,
    pinned,
    visibleColumnOrder,
    tableWidth,
    toggleColumnVisibility,
    showAllColumns,
    resetLayout,
    applyLayout,
    resetColumnWidth,
    pinColumn,
    unpinColumn,
    startColumnResize,
    isColumnDraggable,
    getPinnedColumnStyle,
    getColumnCellMotion,
    sensors,
    collisionDetection,
    draggedColumn,
    isPinnedColumnDragging,
    onDragStart,
    onDragOver,
    onDragMove,
    onDragCancel,
    onDragEnd,
    scrollerRef,
    headerScrollerRef,
  };

  return (
    <DataTableContext.Provider
      value={value as unknown as DataTableContextValue}
    >
      {children}
    </DataTableContext.Provider>
  );
}
