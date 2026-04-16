import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo } from "react";
import { threadHasStarted } from "../components/ChatView.logic";
import { WorkspaceShell } from "../components/WorkspaceShell";
import { useComposerDraftStore, DraftId } from "../composerDraftStore";
import { createThreadSelectorAcrossEnvironments } from "../storeSelectors";
import { useStore } from "../store";
import { buildThreadRouteParams } from "../threadRoutes";
import type { PaneTarget } from "../workspaceLayoutTree";

function DraftChatThreadRouteView() {
  const navigate = useNavigate();
  const { draftId: rawDraftId } = Route.useParams();
  const draftId = DraftId.make(rawDraftId);
  const draftSession = useComposerDraftStore((store) => store.getDraftSession(draftId));
  const serverThread = useStore(
    useMemo(
      () => createThreadSelectorAcrossEnvironments(draftSession?.threadId ?? null),
      [draftSession?.threadId],
    ),
  );
  const serverThreadStarted = threadHasStarted(serverThread);
  const canonicalThreadRef = useMemo(
    () =>
      draftSession?.promotedTo
        ? serverThreadStarted
          ? draftSession.promotedTo
          : null
        : serverThread
          ? {
              environmentId: serverThread.environmentId,
              threadId: serverThread.id,
            }
          : null,
    [draftSession?.promotedTo, serverThread, serverThreadStarted],
  );

  useEffect(() => {
    if (!canonicalThreadRef) {
      return;
    }
    void navigate({
      to: "/$environmentId/$threadId",
      params: buildThreadRouteParams(canonicalThreadRef),
      replace: true,
    });
  }, [canonicalThreadRef, navigate]);

  useEffect(() => {
    if (draftSession || canonicalThreadRef) {
      return;
    }
    void navigate({ to: "/", replace: true });
  }, [canonicalThreadRef, draftSession, navigate]);

  const urlTarget: PaneTarget | null = useMemo(() => {
    if (canonicalThreadRef) {
      return {
        kind: "server",
        environmentId: canonicalThreadRef.environmentId,
        threadId: canonicalThreadRef.threadId,
      };
    }
    if (draftSession) {
      return { kind: "draft", draftId };
    }
    return null;
  }, [canonicalThreadRef, draftId, draftSession]);

  const onFocusedTargetChange = useCallback(
    (target: PaneTarget) => {
      if (target.kind === "server") {
        void navigate({
          to: "/$environmentId/$threadId",
          params: buildThreadRouteParams({
            environmentId: target.environmentId,
            threadId: target.threadId,
          }),
          replace: true,
        });
        return;
      }
      if (target.kind === "draft") {
        void navigate({
          to: "/draft/$draftId",
          params: { draftId: target.draftId },
          replace: true,
        });
      }
    },
    [navigate],
  );

  if (!draftSession && !canonicalThreadRef) {
    return null;
  }

  return <WorkspaceShell urlTarget={urlTarget} onFocusedTargetChange={onFocusedTargetChange} />;
}

export const Route = createFileRoute("/_chat/draft/$draftId")({
  component: DraftChatThreadRouteView,
});
