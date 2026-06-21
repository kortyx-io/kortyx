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
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  ColumnMotion,
  ColumnPin,
  DataTableColumn,
  DataTableLayout,
} from "@/components/data-table/types";

type LayoutSnapshot = Partial<DataTableLayout>;

function validateOrder(
  order: string[] | undefined,
  defaultOrder: string[],
): string[] | undefined {
  if (
    order?.length === defaultOrder.length &&
    order.every((column) => defaultOrder.includes(column))
  ) {
    return order;
  }
  return undefined;
}

function validateHidden(
  hidden: string[] | undefined,
  defaultOrder: string[],
): string[] | undefined {
  if (hidden?.every((column) => defaultOrder.includes(column))) return hidden;
  return undefined;
}

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
   * Read once on mount; invalid/unknown columns are ignored. Takes precedence
   * over `persistKey`.
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
  const minWidths = useMemo(
    () =>
      Object.fromEntries(
        columns.map((column) => [column.key, column.minWidth]),
      ) as Record<string, number>,
    [columns],
  );

  const [widths, setWidths] = useState<Record<string, number>>(() => ({
    ...defaultWidths,
    ...initialLayout?.widths,
  }));
  const [order, setOrder] = useState<string[]>(
    () => validateOrder(initialLayout?.order, defaultOrder) ?? defaultOrder,
  );
  const [hidden, setHidden] = useState<string[]>(
    () => validateHidden(initialLayout?.hidden, defaultOrder) ?? [],
  );
  const [pinned, setPinned] = useState<Partial<Record<string, ColumnPin>>>(
    () => validatePinned(initialLayout?.pinned, defaultOrder) ?? {},
  );
  const [draggedColumn, setDraggedColumn] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const onLayoutChangeRef = useRef(onLayoutChange);
  onLayoutChangeRef.current = onLayoutChange;
  const hasSettledRef = useRef(false);
  const hasInitialLayout = Boolean(initialLayout);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: hydrate once on mount, not on column changes.
  useEffect(() => {
    // initialLayout (e.g. DB) wins and is applied via lazy state init above.
    if (hasInitialLayout || !persistKey) {
      setPreferencesLoaded(true);
      return;
    }
    try {
      const saved = JSON.parse(
        localStorage.getItem(persistKey) ?? "{}",
      ) as LayoutSnapshot & Record<string, number>;
      const savedWidths = saved.widths ?? saved;
      setWidths((current) => ({ ...current, ...savedWidths }));
      const order = validateOrder(saved.order, defaultOrder);
      if (order) setOrder(order);
      const hidden = validateHidden(saved.hidden, defaultOrder);
      if (hidden) setHidden(hidden);
      const pinned = validatePinned(saved.pinned, defaultOrder);
      if (pinned) setPinned(pinned);
    } catch {
      // Ignore invalid local preferences.
    } finally {
      setPreferencesLoaded(true);
    }
  }, [persistKey, hasInitialLayout]);

  useEffect(() => {
    if (!preferencesLoaded) return;
    const layout: DataTableLayout = { widths, order, hidden, pinned };
    if (persistKey) localStorage.setItem(persistKey, JSON.stringify(layout));
    // Skip the initial settle so we only notify on real user changes.
    if (!hasSettledRef.current) {
      hasSettledRef.current = true;
      return;
    }
    onLayoutChangeRef.current?.(layout);
  }, [persistKey, preferencesLoaded, widths, order, hidden, pinned]);

  const visibleColumns = useMemo(
    () => order.filter((column) => !hidden.includes(column)),
    [order, hidden],
  );
  const visibleColumnOrder = useMemo(
    () => [
      ...visibleColumns.filter((column) => pinned[column] === "left"),
      ...visibleColumns.filter((column) => !pinned[column]),
      ...visibleColumns.filter((column) => pinned[column] === "right"),
    ],
    [visibleColumns, pinned],
  );
  const tableWidth = useMemo(
    () =>
      visibleColumnOrder.reduce((total, column) => total + widths[column], 0),
    [visibleColumnOrder, widths],
  );
  const isPinnedColumnDragging =
    draggedColumn !== null && Boolean(pinned[draggedColumn]);

  function toggleColumnVisibility(key: string) {
    setHidden((current) => {
      if (current.includes(key)) {
        return current.filter((item) => item !== key);
      }
      if (current.length === order.length - 1) return current;
      return [...current, key];
    });
  }

  function showAllColumns() {
    setHidden([]);
  }

  function resetLayout() {
    setOrder(defaultOrder);
    setWidths(defaultWidths);
    setHidden([]);
    setPinned({});
  }

  function applyLayout(layout: Partial<DataTableLayout>) {
    setWidths({ ...defaultWidths, ...layout.widths });
    setOrder(validateOrder(layout.order, defaultOrder) ?? defaultOrder);
    setHidden(validateHidden(layout.hidden, defaultOrder) ?? []);
    setPinned(validatePinned(layout.pinned, defaultOrder) ?? {});
  }

  function resetColumnWidth(key: string) {
    setWidths((current) => ({ ...current, [key]: defaultWidths[key] }));
  }

  function pinColumn(key: string, side: ColumnPin) {
    setPinned((current) => ({ ...current, [key]: side }));
  }

  function unpinColumn(key: string) {
    setPinned((current) => {
      const { [key]: _pin, ...remaining } = current;
      return remaining;
    });
  }

  function startColumnResize(
    key: string,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = widths[key];

    function resize(moveEvent: PointerEvent) {
      setWidths((current) => ({
        ...current,
        [key]: Math.max(
          minWidths[key],
          Math.round(startWidth + moveEvent.clientX - startX),
        ),
      }));
    }

    function stopResize() {
      document.body.classList.remove("cursor-col-resize", "select-none");
      window.removeEventListener("pointermove", resize);
      window.removeEventListener("pointerup", stopResize);
    }

    document.body.classList.add("cursor-col-resize", "select-none");
    window.addEventListener("pointermove", resize);
    window.addEventListener("pointerup", stopResize, { once: true });
  }

  function isColumnDraggable(key: string) {
    const pin = pinned[key];
    return (
      !pin ||
      visibleColumnOrder.filter((item) => pinned[item] === pin).length > 1
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
      (total, item) => total + widths[item],
      0,
    );
    return side === "left" ? { left: offset } : { right: offset };
  }

  function getColumnCellMotion(key: string): ColumnMotion | undefined {
    if (!draggedColumn || !dragOverColumn) return undefined;
    const activeIndex = visibleColumnOrder.indexOf(draggedColumn);
    const overIndex = visibleColumnOrder.indexOf(dragOverColumn);
    const columnIndex = visibleColumnOrder.indexOf(key);
    if (activeIndex === -1 || overIndex === -1 || columnIndex === -1) {
      return undefined;
    }
    if (key === draggedColumn) {
      return { style: { transform: `translate3d(${dragOffset}px, 0, 0)` } };
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
    const shift = widths[draggedColumn] * (shiftsLeft ? -1 : 1);
    return {
      style: {
        transform: `translate3d(${shift}px, 0, 0)`,
        transition: "transform 150ms ease",
      },
    };
  }

  const collisionDetection = (args: Parameters<typeof closestCenter>[0]) => {
    const activePin = pinned[args.active.id as string];
    return closestCenter(args).filter(
      (collision) => pinned[collision.id as string] === activePin,
    );
  };

  function onDragStart(event: DragStartEvent) {
    const column = event.active.id as string;
    setDraggedColumn(column);
    setDragOverColumn(column);
  }

  function onDragOver(event: DragOverEvent) {
    const overColumn = event.over?.id as string | undefined;
    if (
      overColumn &&
      draggedColumn &&
      pinned[draggedColumn] !== pinned[overColumn]
    ) {
      return;
    }
    setDragOverColumn(overColumn ?? null);
  }

  function onDragMove(event: DragMoveEvent) {
    setDragOffset(event.delta.x);
  }

  function onDragCancel() {
    setDraggedColumn(null);
    setDragOverColumn(null);
    setDragOffset(0);
  }

  function onDragEnd(event: DragEndEvent) {
    setDraggedColumn(null);
    setDragOverColumn(null);
    setDragOffset(0);
    if (!event.over || event.active.id === event.over.id) return;
    const activeColumn = event.active.id as string;
    const overColumn = event.over.id as string;
    if (pinned[activeColumn] !== pinned[overColumn]) return;
    setOrder((current) =>
      arrayMove(
        current,
        current.indexOf(activeColumn),
        current.indexOf(overColumn),
      ),
    );
  }

  const value: DataTableContextValue<T, S> = {
    columns,
    columnsByKey,
    defaultOrder,
    widths,
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
  };

  return (
    <DataTableContext.Provider
      value={value as unknown as DataTableContextValue}
    >
      {children}
    </DataTableContext.Provider>
  );
}
