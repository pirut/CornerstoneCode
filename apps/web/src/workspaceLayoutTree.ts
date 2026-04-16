/**
 * Pure helpers for workspace layout tree operations.
 *
 * The workspace layout is a binary-ish tree of `LayoutNode`s where leaves
 * represent individual chat panes and internal `SplitNode`s represent
 * horizontal or vertical splits. Helpers in this module must be pure,
 * referentially transparent, and free of runtime dependencies so they can be
 * unit-tested and reused by both the Zustand store and render layer.
 */

import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import type { DraftId } from "./composerDraftStore";

/**
 * Branded identifier types keep pane ids and node ids from being accidentally
 * swapped with thread/draft ids or each other.
 */
export type PaneId = string & { readonly __brand: "PaneId" };
export type TabId = string & { readonly __brand: "TabId" };
export type LayoutNodeId = string & { readonly __brand: "LayoutNodeId" };

export type PaneTarget =
  | { readonly kind: "server"; readonly environmentId: EnvironmentId; readonly threadId: ThreadId }
  | { readonly kind: "draft"; readonly draftId: DraftId }
  | { readonly kind: "empty" };

export interface LeafNode {
  readonly id: LayoutNodeId;
  readonly kind: "leaf";
  readonly paneId: PaneId;
  readonly target: PaneTarget;
}

export interface SplitNode {
  readonly id: LayoutNodeId;
  readonly kind: "split";
  readonly direction: "horizontal" | "vertical";
  readonly children: ReadonlyArray<LayoutNode>;
  /** Normalized, sums to 1. One weight per child, same index. */
  readonly weights: ReadonlyArray<number>;
}

export type LayoutNode = LeafNode | SplitNode;

export interface TabGroup {
  readonly id: TabId;
  /** `null` means auto-derive from focused leaf's thread title. */
  readonly title: string | null;
  readonly root: LayoutNode;
  readonly focusedPaneId: PaneId;
}

export interface WorkspaceLayoutState {
  readonly tabs: ReadonlyArray<TabGroup>;
  readonly activeTabId: TabId;
}

export type SplitDirection = "horizontal" | "vertical";
export type SplitPosition = "before" | "after";
export type FocusDirection = "left" | "right" | "up" | "down";

// ----- Id minting ---------------------------------------------------------

let paneIdCounter = 0;
let nodeIdCounter = 0;
let tabIdCounter = 0;

function mintUnique(prefix: string): string {
  const time = Date.now().toString(36);
  const entropy =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${time}-${entropy}`;
}

export function newPaneId(): PaneId {
  paneIdCounter += 1;
  return `${mintUnique("pane")}-${paneIdCounter}` as PaneId;
}

export function newLayoutNodeId(): LayoutNodeId {
  nodeIdCounter += 1;
  return `${mintUnique("node")}-${nodeIdCounter}` as LayoutNodeId;
}

export function newTabId(): TabId {
  tabIdCounter += 1;
  return `${mintUnique("tab")}-${tabIdCounter}` as TabId;
}

// ----- Node constructors --------------------------------------------------

export function makeLeaf(target: PaneTarget, paneId?: PaneId): LeafNode {
  return {
    id: newLayoutNodeId(),
    kind: "leaf",
    paneId: paneId ?? newPaneId(),
    target,
  };
}

export function makeSplit(
  direction: SplitDirection,
  children: ReadonlyArray<LayoutNode>,
  weights?: ReadonlyArray<number>,
): SplitNode {
  const normalized = normalizeWeights(weights ?? children.map(() => 1 / children.length));
  return {
    id: newLayoutNodeId(),
    kind: "split",
    direction,
    children,
    weights: normalized,
  };
}

function normalizeWeights(weights: ReadonlyArray<number>): ReadonlyArray<number> {
  const cleaned = weights.map((w) => (Number.isFinite(w) && w > 0 ? w : 0));
  const sum = cleaned.reduce((acc, w) => acc + w, 0);
  if (sum <= 0) {
    return cleaned.map(() => 1 / cleaned.length);
  }
  return cleaned.map((w) => w / sum);
}

// ----- Tree traversal -----------------------------------------------------

export function getAllLeaves(root: LayoutNode): ReadonlyArray<LeafNode> {
  if (root.kind === "leaf") {
    return [root];
  }
  return root.children.flatMap(getAllLeaves);
}

export function findLeaf(root: LayoutNode, paneId: PaneId): LeafNode | null {
  if (root.kind === "leaf") {
    return root.paneId === paneId ? root : null;
  }
  for (const child of root.children) {
    const match = findLeaf(child, paneId);
    if (match) return match;
  }
  return null;
}

/** Returns a path of indices from `root` to the leaf; null if not present. */
export function findLeafPath(root: LayoutNode, paneId: PaneId): number[] | null {
  if (root.kind === "leaf") {
    return root.paneId === paneId ? [] : null;
  }
  for (let i = 0; i < root.children.length; i += 1) {
    const child = root.children[i];
    if (!child) continue;
    const deeper = findLeafPath(child, paneId);
    if (deeper) return [i, ...deeper];
  }
  return null;
}

// ----- Tree mutation (immutable return) -----------------------------------

/**
 * Replace the leaf identified by `paneId` with a new subtree produced by
 * `replacer`. Returns a new tree with shared structure everywhere else.
 */
export function mapLeafInTree(
  root: LayoutNode,
  paneId: PaneId,
  replacer: (leaf: LeafNode) => LayoutNode,
): LayoutNode {
  if (root.kind === "leaf") {
    return root.paneId === paneId ? replacer(root) : root;
  }
  let changed = false;
  const nextChildren = root.children.map((child) => {
    const replaced = mapLeafInTree(child, paneId, replacer);
    if (replaced !== child) changed = true;
    return replaced;
  });
  if (!changed) return root;
  return { ...root, children: nextChildren };
}

export function replaceLeafTarget(
  root: LayoutNode,
  paneId: PaneId,
  target: PaneTarget,
): LayoutNode {
  return mapLeafInTree(root, paneId, (leaf) => ({ ...leaf, target }));
}

/**
 * Split a leaf with a new sibling leaf holding `newTarget`. Returns the new
 * tree plus the newly created leaf so callers can focus it.
 *
 * When the leaf's parent is a SplitNode matching `direction`, the new leaf is
 * inserted as an additional sibling (preserving even weights across all
 * siblings in that split). Otherwise, the leaf is wrapped in a new SplitNode.
 */
export function splitLeafInTree(
  root: LayoutNode,
  paneId: PaneId,
  newTarget: PaneTarget,
  direction: SplitDirection,
  position: SplitPosition,
): { tree: LayoutNode; newLeaf: LeafNode } {
  const newLeaf = makeLeaf(newTarget);

  // If root is the target leaf, wrap in a split.
  if (root.kind === "leaf" && root.paneId === paneId) {
    const children = position === "before" ? [newLeaf, root] : [root, newLeaf];
    return { tree: makeSplit(direction, children), newLeaf };
  }

  const tree = splitLeafRecursive(root, paneId, newLeaf, direction, position);
  return { tree, newLeaf };
}

function splitLeafRecursive(
  node: LayoutNode,
  paneId: PaneId,
  newLeaf: LeafNode,
  direction: SplitDirection,
  position: SplitPosition,
): LayoutNode {
  if (node.kind === "leaf") {
    // Standalone leaf (not inside a matching split container) — should be
    // handled by the parent when we recognize it there. A plain recursion
    // shouldn't reach this case except via the root shortcut, but guard anyway.
    if (node.paneId !== paneId) return node;
    const children = position === "before" ? [newLeaf, node] : [node, newLeaf];
    return makeSplit(direction, children);
  }

  // Look for target leaf directly among this split's children.
  const targetIndex = node.children.findIndex(
    (child) => child.kind === "leaf" && child.paneId === paneId,
  );

  if (targetIndex !== -1) {
    if (node.direction === direction) {
      // Insert alongside the existing child with even weights across siblings.
      const nextChildren = [...node.children];
      const insertIndex = position === "before" ? targetIndex : targetIndex + 1;
      nextChildren.splice(insertIndex, 0, newLeaf);
      return makeSplit(direction, nextChildren);
    }
    // Parent split has a different direction — wrap the matched leaf in a new
    // inner split with the requested direction, keeping other siblings intact.
    const targetChild = node.children[targetIndex];
    if (!targetChild) return node;
    const wrapped = splitLeafRecursive(targetChild, paneId, newLeaf, direction, position);
    const nextChildren = [...node.children];
    nextChildren[targetIndex] = wrapped;
    return { ...node, children: nextChildren };
  }

  // Target is deeper — recurse into each child.
  let changed = false;
  const nextChildren = node.children.map((child) => {
    const replaced = splitLeafRecursive(child, paneId, newLeaf, direction, position);
    if (replaced !== child) changed = true;
    return replaced;
  });
  if (!changed) return node;
  return { ...node, children: nextChildren };
}

/**
 * Remove the leaf identified by `paneId`. Collapses parent splits that end up
 * with a single child. Returns `null` if removal would empty the tree.
 */
export function removeLeafFromTree(root: LayoutNode, paneId: PaneId): LayoutNode | null {
  if (root.kind === "leaf") {
    return root.paneId === paneId ? null : root;
  }

  const nextChildren: LayoutNode[] = [];
  for (const child of root.children) {
    const replaced = removeLeafFromTree(child, paneId);
    if (replaced !== null) {
      nextChildren.push(replaced);
    }
  }

  if (nextChildren.length === 0) return null;
  if (nextChildren.length === 1) {
    const only = nextChildren[0];
    return only ?? null;
  }
  return makeSplit(root.direction, nextChildren);
}

/**
 * Update the weights of a SplitNode identified by `nodeId`. Invalid weight
 * arrays are ignored and the tree is returned unchanged.
 */
export function setSplitWeightsInTree(
  root: LayoutNode,
  nodeId: LayoutNodeId,
  weights: ReadonlyArray<number>,
): LayoutNode {
  if (root.kind === "leaf") return root;
  if (root.id === nodeId) {
    if (weights.length !== root.children.length) return root;
    return { ...root, weights: normalizeWeights(weights) };
  }
  let changed = false;
  const nextChildren = root.children.map((child) => {
    const next = setSplitWeightsInTree(child, nodeId, weights);
    if (next !== child) changed = true;
    return next;
  });
  if (!changed) return root;
  return { ...root, children: nextChildren };
}

// ----- Focus traversal ----------------------------------------------------

/**
 * Geometric traversal: given a tree and a starting pane id, return the
 * adjacent leaf in the given direction, or null if there is no neighbour.
 *
 * Uses the split-node direction semantics: horizontal splits traverse left/
 * right between siblings; vertical splits traverse up/down between siblings.
 * When the focus leaves the current split, walk up to ancestors until a split
 * with matching direction is found.
 */
export function findAdjacentLeaf(
  root: LayoutNode,
  fromPaneId: PaneId,
  direction: FocusDirection,
): LeafNode | null {
  const path = findLeafPath(root, fromPaneId);
  if (!path) return null;

  const horizontal = direction === "left" || direction === "right";
  const step = direction === "left" || direction === "up" ? -1 : 1;
  const targetAxis: SplitDirection = horizontal ? "horizontal" : "vertical";

  // Walk up ancestors looking for a matching-direction split where we can
  // move to an adjacent sibling.
  for (let depth = path.length - 1; depth >= 0; depth -= 1) {
    const ancestorPath = path.slice(0, depth);
    const ancestor = nodeAtPath(root, ancestorPath);
    if (!ancestor || ancestor.kind !== "split") continue;
    if (ancestor.direction !== targetAxis) continue;

    const indexAtDepth = path[depth];
    if (indexAtDepth === undefined) continue;
    const nextIndex = indexAtDepth + step;
    if (nextIndex < 0 || nextIndex >= ancestor.children.length) continue;

    const sibling = ancestor.children[nextIndex];
    if (!sibling) continue;
    return firstLeafInSubtree(sibling);
  }

  return null;
}

function nodeAtPath(root: LayoutNode, path: ReadonlyArray<number>): LayoutNode | null {
  let node: LayoutNode | null = root;
  for (const index of path) {
    if (!node || node.kind !== "split") return null;
    node = node.children[index] ?? null;
  }
  return node;
}

/**
 * When stepping into a sibling subtree, pick the "closest" leaf to the
 * incoming edge. We keep it simple: always pick the first leaf via DFS,
 * which feels natural in practice.
 */
function firstLeafInSubtree(node: LayoutNode): LeafNode {
  if (node.kind === "leaf") return node;
  const first = node.children[0];
  if (!first) {
    // Should not happen — splits always have 2+ children after normalization.
    return { ...makeLeaf({ kind: "empty" }) };
  }
  return firstLeafInSubtree(first);
}

// ----- Active-tab helpers -------------------------------------------------

export function findTabIndex(tabs: ReadonlyArray<TabGroup>, tabId: TabId): number {
  return tabs.findIndex((tab) => tab.id === tabId);
}

export function ensureFocusedPane(tab: TabGroup): TabGroup {
  const leaves = getAllLeaves(tab.root);
  if (leaves.length === 0) return tab;
  const stillPresent = leaves.some((leaf) => leaf.paneId === tab.focusedPaneId);
  if (stillPresent) return tab;
  const firstLeaf = leaves[0];
  if (!firstLeaf) return tab;
  return { ...tab, focusedPaneId: firstLeaf.paneId };
}

export function createEmptyTab(title: string | null = null): TabGroup {
  const leaf = makeLeaf({ kind: "empty" });
  return {
    id: newTabId(),
    title,
    root: leaf,
    focusedPaneId: leaf.paneId,
  };
}

export function createTabWithTarget(target: PaneTarget, title: string | null = null): TabGroup {
  const leaf = makeLeaf(target);
  return {
    id: newTabId(),
    title,
    root: leaf,
    focusedPaneId: leaf.paneId,
  };
}

export function targetsEqual(a: PaneTarget, b: PaneTarget): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "empty" && b.kind === "empty") return true;
  if (a.kind === "server" && b.kind === "server") {
    return a.environmentId === b.environmentId && a.threadId === b.threadId;
  }
  if (a.kind === "draft" && b.kind === "draft") {
    return a.draftId === b.draftId;
  }
  return false;
}
