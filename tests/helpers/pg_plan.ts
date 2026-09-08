// Typed reader + assertion over a Postgres `EXPLAIN (FORMAT JSON)` plan tree.
//
// A flat `JSON.stringify(plan).toContain('Seq Scan')` guard rejects any plan
// where ANY node anywhere is a Seq Scan, including a tiny unrelated joined
// table the planner is right to scan sequentially. The check that actually
// matters is per-relation: does THIS relation's own scan reach the expected
// partial index, never a Seq Scan of that same relation.

export interface ExplainPlanNode {
  readonly 'Node Type': string;
  readonly 'Relation Name'?: string;
  readonly 'Index Name'?: string;
  readonly 'Parent Relationship'?: string;
  readonly Plans?: readonly ExplainPlanNode[];
}

export interface RelationIndexScanResult {
  readonly ok: boolean;
  readonly reason?: string;
}

const BITMAP_COMBINE_NODE_TYPES = new Set(['BitmapAnd', 'BitmapOr']);
// A SubPlan/InitPlan child is a correlated subquery's own plan, attached to
// this node for display, never a scan feeding this relation's row source.
const SUBQUERY_CHILD_RELATIONSHIPS = new Set(['SubPlan', 'InitPlan']);

function isRowSourceChild(node: ExplainPlanNode): boolean {
  return !SUBQUERY_CHILD_RELATIONSHIPS.has(node['Parent Relationship'] ?? '');
}

/** Only real bitmap-access nodes count: Bitmap Index Scan, or BitmapAnd/Or over more of them. */
function bitmapAccessScansIndex(node: ExplainPlanNode, indexName: string): boolean {
  const type = node['Node Type'];
  if (type === 'Bitmap Index Scan') return node['Index Name'] === indexName;
  if (BITMAP_COMBINE_NODE_TYPES.has(type)) {
    return (node.Plans ?? []).some(
      (child) => isRowSourceChild(child) && bitmapAccessScansIndex(child, indexName),
    );
  }
  return false;
}

/**
 * Whether `node` ITSELF (never a descendant subtree) reaches `indexName`:
 * - Index Scan / Index Only Scan: only the node's own Index Name counts.
 * - Bitmap Heap Scan: only its real bitmap-access children (Bitmap Index
 *   Scan / BitmapAnd / BitmapOr, never a SubPlan/InitPlan child) count.
 * Anything else (a Seq Scan is handled by the caller before this runs) never
 * scans an index.
 */
function nodeScansIndex(node: ExplainPlanNode, indexName: string): boolean {
  const type = node['Node Type'];
  if (type === 'Index Scan' || type === 'Index Only Scan') {
    return node['Index Name'] === indexName;
  }
  if (type === 'Bitmap Heap Scan') {
    return (node.Plans ?? []).some(
      (child) => isRowSourceChild(child) && bitmapAccessScansIndex(child, indexName),
    );
  }
  return false;
}

/** Extracts the top `Plan` node from a `pool.query('EXPLAIN (FORMAT JSON) ...')` row. */
export function rootPlanFromExplainRow(row: unknown): ExplainPlanNode {
  const queryPlan = (row as { 'QUERY PLAN'?: unknown })['QUERY PLAN'];
  if (!Array.isArray(queryPlan) || queryPlan.length === 0) {
    throw new Error('EXPLAIN (FORMAT JSON) row has no "QUERY PLAN" array');
  }
  const plan = (queryPlan[0] as { Plan?: unknown }).Plan;
  if (!plan || typeof plan !== 'object') {
    throw new Error('EXPLAIN (FORMAT JSON) row has no top-level "Plan" node');
  }
  return plan as ExplainPlanNode;
}

function collectRelationNodes(
  node: ExplainPlanNode,
  relation: string,
  out: ExplainPlanNode[],
): void {
  if (node['Relation Name'] === relation) out.push(node);
  for (const child of node.Plans ?? []) collectRelationNodes(child, relation, out);
}

/**
 * Every plan node for `relation` (there may be more than one) must reach
 * `indexName`: its own Index Scan / Index Only Scan, or a Bitmap Index Scan
 * nested under it (a Bitmap Heap Scan). A Seq Scan of `relation` fails
 * immediately; a scan that reaches a DIFFERENT index, or no relation node at
 * all, fails too. Every other relation in the plan is ignored.
 */
export function checkRelationUsesPartialIndex(
  root: ExplainPlanNode,
  relation: string,
  indexName: string,
): RelationIndexScanResult {
  const nodes: ExplainPlanNode[] = [];
  collectRelationNodes(root, relation, nodes);
  if (nodes.length === 0) {
    return { ok: false, reason: `no "${relation}" relation node found in the plan` };
  }
  for (const node of nodes) {
    if (node['Node Type'] === 'Seq Scan') {
      return { ok: false, reason: `"${relation}" used Seq Scan instead of "${indexName}"` };
    }
    if (!nodeScansIndex(node, indexName)) {
      return {
        ok: false,
        reason: `"${relation}" (${node['Node Type']}) did not scan expected index "${indexName}"`,
      };
    }
  }
  return { ok: true };
}
