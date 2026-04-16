/**
 * Top-level workspace layout renderer.
 *
 * Renders all tabs (inactive ones kept mounted-but-hidden) and, for the
 * active tab, a recursive split-pane tree built from
 * `react-resizable-panels`. Panes expose a focus API that keeps the URL in
 * sync with whichever pane the user is currently interacting with.
 *
 * Inputs:
 *   - `urlTarget` — the resolved target implied by the current URL (server
 *     thread or draft), or `null` for `/` index / unknown routes. The shell
 *     mirrors this value into the focused pane of the active tab whenever it
 *     differs, preserving deep-linking semantics.
 *   - `onFocusedTargetChange` — callback invoked when the focused pane's
 *     target changes to a value that should drive navigation (i.e. when a
 *     pane other than the one currently matching the URL gains focus, or
 *     when the focused pane's target is mutated locally). Consumers
 *     typically call `navigate({ to: ..., replace: true })` here.
 */

import { type ReactNode, useCallback, useEffect, useMemo, useRef } from "react";
import {
  Group as PanelGroup,
  Panel,
  Separator as PanelResizeHandle,
  type GroupImperativeHandle,
  type Layout,
} from "react-resizable-panels";

import { SidebarInset } from "./ui/sidebar";
import { WorkspacePane } from "./WorkspacePane";
import { WorkspaceTabBar } from "./WorkspaceTabBar";
import { useWorkspaceLayoutStore, useWorkspaceTabs, useActiveTabId } from "../workspaceLayoutStore";
import {
  type LayoutNode,
  type PaneId,
  type PaneTarget,
  type SplitNode,
  type TabGroup,
  findLeaf,
  targetsEqual,
} from "../workspaceLayoutTree";
import { cn } from "~/lib/utils";

interface WorkspaceShellProps {
  /** The target implied by the current URL, if any. */
  urlTarget: PaneTarget | null;
  /** Notified when the focused pane's target changes in a way that should drive navigation. */
  onFocusedTargetChange: (target: PaneTarget) => void;
  /** Optional additional content rendered alongside the active tab (e.g. DiffPanel). */
  sideContent?: ReactNode;
  /** Extra classes applied to the SidebarInset wrapping the active tab. */
  className?: string;
  /** Props applied only to the currently-focused pane (e.g. DiffPanel hooks). */
  focusedPaneProps?: {
    onDiffPanelOpen?: () => void;
    reserveTitleBarControlInset?: boolean;
  };
}

function LayoutNodeView({
  node,
  focusedPaneId,
  isOnlyLeaf,
  focusedPaneProps,
}: {
  node: LayoutNode;
  focusedPaneId: PaneId;
  isOnlyLeaf: boolean;
  focusedPaneProps?: WorkspaceShellProps["focusedPaneProps"];
}) {
  if (node.kind === "leaf") {
    const isFocused = node.paneId === focusedPaneId;
    const onDiffPanelOpen = isFocused ? focusedPaneProps?.onDiffPanelOpen : undefined;
    const reserveTitleBarControlInset = isFocused
      ? focusedPaneProps?.reserveTitleBarControlInset
      : undefined;
    return (
      <WorkspacePane
        leaf={node}
        isFocused={isFocused}
        isOnlyLeaf={isOnlyLeaf}
        {...(onDiffPanelOpen ? { onDiffPanelOpen } : {})}
        {...(reserveTitleBarControlInset !== undefined ? { reserveTitleBarControlInset } : {})}
      />
    );
  }

  return (
    <SplitNodeView node={node} focusedPaneId={focusedPaneId} focusedPaneProps={focusedPaneProps} />
  );
}

function SplitNodeView({
  node,
  focusedPaneId,
  focusedPaneProps,
}: {
  node: SplitNode;
  focusedPaneId: PaneId;
  focusedPaneProps?: WorkspaceShellProps["focusedPaneProps"];
}) {
  const setSplitWeights = useWorkspaceLayoutStore((state) => state.setSplitWeights);
  const handleRef = useRef<GroupImperativeHandle | null>(null);

  // Build stable panel IDs derived from the layout-tree child IDs. `Layout`
  // comes back keyed by these IDs, so we map back to the children array in
  // order when persisting weights.
  const childIds = useMemo(() => node.children.map((child) => child.id), [node.children]);

  const onLayoutChanged = useCallback(
    (layout: Layout) => {
      const total = childIds.reduce((sum, id) => sum + (layout[id] ?? 0), 0);
      if (total <= 0) return;
      const normalized = childIds.map((id) => {
        const value = layout[id];
        if (!Number.isFinite(value) || value === undefined || value <= 0) return 0;
        return value / total;
      });
      setSplitWeights(node.id, normalized);
    },
    [childIds, node.id, setSplitWeights],
  );

  return (
    <PanelGroup
      key={node.id}
      groupRef={handleRef}
      orientation={node.direction}
      onLayoutChanged={onLayoutChanged}
      className="flex h-full min-h-0 w-full"
    >
      {node.children.map((child, index) => {
        const weight = node.weights[index] ?? 1 / node.children.length;
        const defaultSize = Math.round(weight * 1000) / 10;
        return (
          <PanelFragment
            key={child.id}
            child={child}
            focusedPaneId={focusedPaneId}
            defaultSize={defaultSize}
            showHandle={index > 0}
            handleDirection={node.direction}
            focusedPaneProps={focusedPaneProps}
          />
        );
      })}
    </PanelGroup>
  );
}

function PanelFragment(props: {
  child: LayoutNode;
  focusedPaneId: PaneId;
  defaultSize: number;
  showHandle: boolean;
  handleDirection: "horizontal" | "vertical";
  focusedPaneProps?: WorkspaceShellProps["focusedPaneProps"];
}) {
  const { child, focusedPaneId, defaultSize, showHandle, handleDirection, focusedPaneProps } =
    props;
  return (
    <>
      {showHandle ? (
        <PanelResizeHandle
          className={cn(
            "bg-border/60 transition-colors hover:bg-primary/50 data-[separator-state=hover]:bg-primary/60 data-[separator-state=drag]:bg-primary",
            handleDirection === "horizontal"
              ? "w-[2px] cursor-col-resize"
              : "h-[2px] cursor-row-resize",
          )}
        />
      ) : null}
      <Panel id={child.id} defaultSize={defaultSize} minSize={10}>
        <LayoutNodeView
          node={child}
          focusedPaneId={focusedPaneId}
          isOnlyLeaf={false}
          focusedPaneProps={focusedPaneProps}
        />
      </Panel>
    </>
  );
}

function ActiveTabContent({
  tab,
  focusedPaneProps,
}: {
  tab: TabGroup;
  focusedPaneProps?: WorkspaceShellProps["focusedPaneProps"];
}) {
  const onlyLeaf = tab.root.kind === "leaf";
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      <LayoutNodeView
        node={tab.root}
        focusedPaneId={tab.focusedPaneId}
        isOnlyLeaf={onlyLeaf}
        focusedPaneProps={focusedPaneProps}
      />
    </div>
  );
}

export function WorkspaceShell(props: WorkspaceShellProps) {
  const { urlTarget, onFocusedTargetChange, sideContent, className, focusedPaneProps } = props;
  const tabs = useWorkspaceTabs();
  const activeTabId = useActiveTabId();
  const openInFocusedPane = useWorkspaceLayoutStore((state) => state.openInFocusedPane);

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? tabs[0] ?? null,
    [activeTabId, tabs],
  );

  // Bidirectional sync between URL <-> focused pane. Instead of two independent
  // effects that can fight each other, we detect which side actually changed
  // this render and act on that side only.
  //
  // Race we're avoiding: user clicks thread B in the sidebar while thread A is
  // focused. `router.navigate` updates `urlTarget` → B in the next render, but
  // the Zustand store hasn't applied `openInFocusedPane(B)` yet so the focused
  // leaf's target is still A. A naive "focused → URL" effect sees focused=A,
  // url=B, mismatch, and fires `onFocusedTargetChange(A)` which navigates back
  // to A — canceling the click.
  const initializedRef = useRef(false);
  const lastUrlTargetRef = useRef<PaneTarget | null>(null);
  const lastFocusedTargetRef = useRef<PaneTarget | null>(null);

  useEffect(() => {
    if (!activeTab) return;
    const focusedLeaf = findLeaf(activeTab.root, activeTab.focusedPaneId);
    if (!focusedLeaf) return;
    const currentFocused = focusedLeaf.target;

    // First pass: establish baseline. If URL is set but doesn't yet match the
    // focused pane (deep-link / cold-start), push URL into the focused pane.
    if (!initializedRef.current) {
      initializedRef.current = true;
      lastUrlTargetRef.current = urlTarget;
      lastFocusedTargetRef.current = currentFocused;
      if (urlTarget && !targetsEqual(currentFocused, urlTarget)) {
        openInFocusedPane(urlTarget);
      }
      return;
    }

    const prevUrl = lastUrlTargetRef.current;
    const prevFocused = lastFocusedTargetRef.current;

    const urlChanged =
      urlTarget === null ? prevUrl !== null : prevUrl === null || !targetsEqual(prevUrl, urlTarget);
    const focusChanged = prevFocused === null || !targetsEqual(prevFocused, currentFocused);

    lastUrlTargetRef.current = urlTarget;
    lastFocusedTargetRef.current = currentFocused;

    // Already in sync — nothing to do.
    if (urlTarget && targetsEqual(currentFocused, urlTarget)) return;

    // URL is the authoritative side of this render: push it into the focused
    // pane. This path wins ties (urlChanged && focusChanged) because the URL
    // is what the user most recently acted on (sidebar click / deep link).
    if (urlChanged && urlTarget) {
      openInFocusedPane(urlTarget);
      return;
    }

    // Otherwise the focused pane's target changed locally (user clicked a
    // different pane, or a pane's target was mutated) — bubble to the URL.
    if (focusChanged && currentFocused.kind !== "empty") {
      onFocusedTargetChange(currentFocused);
      return;
    }
  }, [activeTab, openInFocusedPane, onFocusedTargetChange, urlTarget]);

  return (
    <>
      <SidebarInset
        className={cn(
          "flex h-dvh min-h-0 flex-col overflow-hidden overscroll-y-none bg-background text-foreground",
          className,
        )}
      >
        <WorkspaceTabBar />
        <div className="relative flex min-h-0 min-w-0 flex-1">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTabId;
            return (
              <div
                key={tab.id}
                className={cn(
                  "absolute inset-0 flex min-h-0 min-w-0",
                  isActive ? "z-10" : "pointer-events-none -z-0 opacity-0",
                )}
                style={{ display: isActive ? undefined : "none" }}
                aria-hidden={!isActive}
              >
                <ActiveTabContent
                  tab={tab}
                  focusedPaneProps={isActive ? focusedPaneProps : undefined}
                />
              </div>
            );
          })}
        </div>
      </SidebarInset>
      {sideContent}
    </>
  );
}
