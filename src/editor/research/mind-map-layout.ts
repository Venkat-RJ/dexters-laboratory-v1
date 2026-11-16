import type { MindMapTopic } from "./research-documents";

type Role = NonNullable<MindMapTopic["role"]> | "result" | "topic" | "question";
export type Topic = {
  id: string;
  label: string;
  title: string;
  savedRole: MindMapTopic["role"];
  role: Role;
  parent?: string;
  depth: number;
  lane: number;
  reference?: string;
};

const entities: Record<string, string> = { "&lt;": "<", "&gt;": ">", "&amp;": "&" };

function branchHash(id: string) {
  let hash = 2166136261;
  for (const character of id) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return hash >>> 0;
}

export function projectTopics(topics: MindMapTopic[]): Topic[] {
  const parents: Topic[] = [];
  let lane = -1;
  return topics.map(({ id, label, depth, role }) => {
    const parent = parents[depth - 1];
    if (depth === 1) lane += 1;
    const link = label.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    const title = (link?.[1] ?? label)
      .replace(/^(Evidence|Test):\s+/, "")
      .replace(/&(?:lt|gt|amp);/g, (entity) => entities[entity]);
    const topic: Topic = {
      id, label, title, depth, lane, savedRole: role,
      role: depth === 0 ? "question" : role === "evidence" && parent?.role === "test" ? "result" : role ?? "topic",
      parent: parent?.id,
      reference: link?.[2],
    };
    parents.length = depth;
    parents.push(topic);
    return topic;
  });
}

export const ROOT_WIDTH = 240;
export const ROOT_HEIGHT = 82;
export const NODE_WIDTH = 148;
export const NODE_HEIGHT = 54;
const HORIZONTAL_STEP = NODE_WIDTH + 42;
const ROW_STEP = NODE_HEIGHT + 8;
const LANE_COLORS = ["blue", "green", "violet", "amber", "rose", "teal"];
export const laneColor = (lane: number) => lane < 0 ? undefined : LANE_COLORS[lane % LANE_COLORS.length];

export function placeTopics(topics: Topic[]) {
  const positions = new Map<string, { x: number; y: number }>();
  const root = topics[0];
  if (!root) return positions;
  positions.set(root.id, { x: -ROOT_WIDTH / 2, y: 0 });
  const children = new Map<string, Topic[]>();
  const spans = new Map<string, number>();
  for (const topic of topics) {
    if (!topic.parent) continue;
    const siblings = children.get(topic.parent) ?? [];
    siblings.push(topic);
    children.set(topic.parent, siblings);
  }
  for (let i = topics.length - 1; i >= 0; i--) {
    const topic = topics[i];
    spans.set(topic.id, Math.max(ROW_STEP, (children.get(topic.id) ?? []).reduce((n, child) => n + spans.get(child.id)!, 0)));
  }
  const groups: Topic[][] = [[], [], [], []];
  const heights = [0, 0];
  const widths = new Map<string, number>();
  for (let i = topics.length - 1; i >= 0; i--) {
    const topic = topics[i];
    widths.set(topic.id, Math.max(NODE_WIDTH + 12, (children.get(topic.id) ?? []).reduce((n, child) => n + widths.get(child.id)!, 0)));
  }
  const primary = children.get(root.id) ?? [];
  for (const branch of primary) {
    // A branch keeps its direction and color when another branch is added or removed.
    const group = branchHash(branch.id) % 4;
    groups[group].push(branch);
    if (group < 2) heights[group] += spans.get(branch.id)!;
  }
  const topicById = new Map(topics.map((topic) => [topic.id, topic]));
  const branchCenters = new Map<string, number>();
  for (let side = 0; side < 2; side++) {
    const direction = side === 0 ? 1 : -1;
    let top = ROOT_HEIGHT / 2 - heights[side] / 2;
    const stack: { topic: Topic; top: number }[] = [];
    for (const branch of groups[side]) {
      stack.push({ topic: branch, top });
      branchCenters.set(branch.id, top + spans.get(branch.id)! / 2);
      top += spans.get(branch.id)!;
    }
    while (stack.length) {
      const { topic, top: branchTop } = stack.pop()!;
      const span = spans.get(topic.id)!;
      // Fan each major branch outward according to its position around the root.
      // All descendants share the offset, preserving the space reserved for its subtree.
      let ancestor = topic;
      while (ancestor.parent && ancestor.parent !== root.id) ancestor = topicById.get(ancestor.parent)!;
      const branchCenter = branchCenters.get(ancestor.id)!;
      const fan = Math.min(220, Math.abs(branchCenter - ROOT_HEIGHT / 2) * 0.48) +
        Math.min(64, Math.abs(branchTop + span / 2 - branchCenter) * 0.18);
      const distance = ROOT_WIDTH / 2 + 52 + fan + (topic.depth - 1) * HORIZONTAL_STEP;
      positions.set(topic.id, { x: direction > 0 ? distance : -distance - NODE_WIDTH,
        y: branchTop + span / 2 - NODE_HEIGHT / 2 });
      let childTop = branchTop;
      for (const child of children.get(topic.id) ?? []) {
        stack.push({ topic: child, top: childTop });
        childTop += spans.get(child.id)!;
      }
    }
  }
  const verticalClearance = Math.max(...heights) / 2 + 72;
  for (const [group, direction] of [[2, -1], [3, 1]] as const) {
    const branches = groups[group];
    let left = -branches.reduce((sum, branch) => sum + widths.get(branch.id)!, 0) / 2;
    const stack: { topic: Topic; left: number }[] = [];
    for (const branch of branches) {
      stack.push({ topic: branch, left });
      left += widths.get(branch.id)!;
    }
    while (stack.length) {
      const { topic, left: branchLeft } = stack.pop()!;
      const width = widths.get(topic.id)!;
      const distance = verticalClearance + (topic.depth - 1) * (NODE_HEIGHT + 42);
      positions.set(topic.id, { x: branchLeft + width / 2 - NODE_WIDTH / 2,
        y: direction < 0 ? -distance - NODE_HEIGHT : ROOT_HEIGHT + distance });
      let childLeft = branchLeft;
      for (const child of children.get(topic.id) ?? []) {
        stack.push({ topic: child, left: childLeft });
        childLeft += widths.get(child.id)!;
      }
    }
  }
  return positions;
}

export function getConnections(visible: Topic[], positions: ReadonlyMap<string, { x: number; y: number }>) {
  const connections: { id: string; path: string; lane?: string; left: number; right: number; top: number; bottom: number }[] = [];
  const rootId = visible[0]?.id;
  const verticalByTopic = new Map<string, boolean>();
  for (const topic of visible) {
    if (!topic.parent) continue;
    const origin = positions.get(topic.parent)!;
    const child = positions.get(topic.id)!;
    const parentRoot = topic.parent === rootId;
    const originWidth = parentRoot ? ROOT_WIDTH : NODE_WIDTH;
    const originHeight = parentRoot ? ROOT_HEIGHT : NODE_HEIGHT;
    const dx = child.x + NODE_WIDTH / 2 - (origin.x + originWidth / 2);
    const dy = child.y + NODE_HEIGHT / 2 - (origin.y + originHeight / 2);
    // Descendants grow along the main branch's axis. Choosing an axis from
    // each edge's slope can send outer edges through their sibling nodes.
    const vertical = parentRoot ? branchHash(topic.id) % 4 >= 2 : verticalByTopic.get(topic.parent)!;
    verticalByTopic.set(topic.id, vertical);
    let startX = origin.x + originWidth / 2;
    let startY = origin.y + originHeight / 2;
    let endX = child.x + NODE_WIDTH / 2;
    let endY = child.y + NODE_HEIGHT / 2;
    if (parentRoot) {
      const scale = 1 / Math.sqrt((dx / (ROOT_WIDTH / 2)) ** 2 + (dy / (ROOT_HEIGHT / 2)) ** 2);
      startX += dx * scale;
      startY += dy * scale;
    } else if (vertical) {
      startY += Math.sign(dy) * originHeight / 2;
    } else {
      startX += Math.sign(dx) * originWidth / 2;
    }
    if (vertical) endY -= Math.sign(dy) * NODE_HEIGHT / 2;
    else endX -= Math.sign(dx) * NODE_WIDTH / 2;
    const path = vertical
      ? `M ${startX} ${startY} C ${startX} ${(startY + endY) / 2}, ${endX} ${(startY + endY) / 2}, ${endX} ${endY}`
      : `M ${startX} ${startY} C ${(startX + endX) / 2} ${startY}, ${(startX + endX) / 2} ${endY}, ${endX} ${endY}`;
    connections.push({ id: topic.id, path, lane: laneColor(topic.lane),
      left: Math.min(startX, endX), right: Math.max(startX, endX),
      top: Math.min(startY, endY), bottom: Math.max(startY, endY) });
  }
  return connections;
}
