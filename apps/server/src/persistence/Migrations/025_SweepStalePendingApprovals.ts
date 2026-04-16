import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as Effect from "effect/Effect";

/**
 * One-shot sweep of stale "pending" approval rows left behind by crashed
 * or torn-down provider sessions.
 *
 * The projection pipeline learned to mark pending approvals resolved when
 * a thread's session transitions away from "running" (see
 * ProjectionPipeline.applyPendingApprovalsProjection / "thread.session-set"
 * handling).  That covers new events going forward, but existing databases
 * already contain stale rows from earlier sessions that died before the
 * handler existed.  This migration clears them out in a single pass and
 * recomputes `projection_threads.pending_approval_count` so the sidebar
 * pill stops lying about older threads.
 *
 * A row is "stale" if `status = 'pending'` AND either:
 *  - there is no matching projection_thread_sessions row, or
 *  - the session's current status is not 'running'.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    UPDATE projection_pending_approvals
    SET
      status = 'resolved',
      decision = NULL,
      resolved_at = COALESCE(
        (
          SELECT session.updated_at
          FROM projection_thread_sessions AS session
          WHERE session.thread_id = projection_pending_approvals.thread_id
        ),
        projection_pending_approvals.created_at
      )
    WHERE status = 'pending'
      AND NOT EXISTS (
        SELECT 1
        FROM projection_thread_sessions AS session
        WHERE session.thread_id = projection_pending_approvals.thread_id
          AND session.status = 'running'
      )
  `;

  yield* sql`
    UPDATE projection_threads
    SET pending_approval_count = COALESCE((
      SELECT COUNT(*)
      FROM projection_pending_approvals
      WHERE projection_pending_approvals.thread_id = projection_threads.thread_id
        AND projection_pending_approvals.status = 'pending'
    ), 0)
  `;
});
