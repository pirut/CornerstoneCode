/**
 * Focus-scoped wrapper around a single chat pane.
 *
 * Renders the appropriate content for the leaf's target (server thread,
 * draft, or empty), and notifies the workspace layout store on pointer /
 * focus events so clicking into a pane moves "focus" (and therefore URL)
 * to that pane.
 */

import { useCallback, useMemo } from "react";
import ChatView from "./ChatView";
import { NoActiveThreadState } from "./NoActiveThreadState";
import { useComposerDraftStore, type DraftId } from "../composerDraftStore";
import { useWorkspaceLayoutStore } from "../workspaceLayoutStore";
import type { LeafNode, PaneId } from "../workspaceLayoutTree";
import { cn } from "~/lib/utils";

interface WorkspacePaneProps {
  leaf: LeafNode;
  isFocused: boolean;
  isOnlyLeaf: boolean;
  onDiffPanelOpen?: () => void;
  reserveTitleBarControlInset?: boolean;
}

function DraftPaneContent(props: {
  draftId: DraftId;
  onDiffPanelOpen?: () => void;
  reserveTitleBarControlInset?: boolean;
}) {
  const { draftId, onDiffPanelOpen, reserveTitleBarControlInset } = props;
  const draftSession = useComposerDraftStore((store) => store.getDraftSession(draftId));
  if (!draftSession) {
    return <NoActiveThreadState />;
  }
  return (
    <ChatView
      draftId={draftId}
      environmentId={draftSession.environmentId}
      threadId={draftSession.threadId}
      routeKind="draft"
      {...(onDiffPanelOpen ? { onDiffPanelOpen } : {})}
      {...(reserveTitleBarControlInset !== undefined ? { reserveTitleBarControlInset } : {})}
    />
  );
}

export function WorkspacePane(props: WorkspacePaneProps) {
  const { leaf, isFocused, isOnlyLeaf, onDiffPanelOpen, reserveTitleBarControlInset } = props;
  const setFocusedPane = useWorkspaceLayoutStore((state) => state.setFocusedPane);
  const paneId = leaf.paneId;

  const onPointerDown = useCallback(() => {
    setFocusedPane(paneId);
  }, [paneId, setFocusedPane]);

  const onFocusCapture = useCallback(() => {
    setFocusedPane(paneId);
  }, [paneId, setFocusedPane]);

  const frameClassName = useMemo(
    () =>
      cn(
        "relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
        // Ring visible only when there are multiple panes in the tab to signal
        // which pane is "active" for navigation/keybindings.
        !isOnlyLeaf && isFocused && "outline outline-1 outline-primary/70 outline-offset-[-1px]",
      ),
    [isFocused, isOnlyLeaf],
  );

  const content = (() => {
    const target = leaf.target;
    if (target.kind === "server") {
      return (
        <ChatView
          environmentId={target.environmentId}
          threadId={target.threadId}
          routeKind="server"
          {...(onDiffPanelOpen ? { onDiffPanelOpen } : {})}
          {...(reserveTitleBarControlInset !== undefined ? { reserveTitleBarControlInset } : {})}
        />
      );
    }
    if (target.kind === "draft") {
      return (
        <DraftPaneContent
          draftId={target.draftId}
          {...(onDiffPanelOpen ? { onDiffPanelOpen } : {})}
          {...(reserveTitleBarControlInset !== undefined ? { reserveTitleBarControlInset } : {})}
        />
      );
    }
    return <NoActiveThreadState />;
  })();

  return (
    <div
      className={frameClassName}
      data-workspace-pane-id={paneId}
      data-workspace-pane-focused={isFocused || undefined}
      onPointerDownCapture={onPointerDown}
      onFocusCapture={onFocusCapture}
    >
      {content}
    </div>
  );
}

export type { PaneId };
