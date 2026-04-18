import { describe, expect, it } from 'vitest';
import type { ConversationBranch, Message } from '@/app/home/types';
import {
  buildConversationMapModel,
  type ConversationMapModel,
  getMapNavigationAnchorMessageId,
  getRouteSelectionPatch,
} from '@/app/home/components/conversationMapModel';

function createMessage(
  id: string,
  role: Message['role'],
  previousMessageId: string | null,
  minute: number
): Message {
  return {
    id,
    role,
    content: `${role}-${id}`,
    timestamp: new Date(`2026-04-15T12:${String(minute).padStart(2, '0')}:00.000Z`),
    previousMessageId,
  };
}

function createBranch(
  id: string,
  sourceMessageId: string,
  entryMessageId: string,
  isMain: boolean,
  position: number
): ConversationBranch {
  return {
    id,
    sourceMessageId,
    entryMessageId,
    title: isMain ? 'Main' : id,
    isMain,
    position,
  };
}

function expectNoHorizontalOverlap(projection: ConversationMapModel) {
  const nodesByDepth = new Map<number, typeof projection.nodes>();

  projection.nodes.forEach((node) => {
    const existing = nodesByDepth.get(node.depth);
    if (existing) {
      existing.push(node);
      return;
    }

    nodesByDepth.set(node.depth, [node]);
  });

  [...nodesByDepth.values()].forEach((nodes) => {
    const sorted = [...nodes].sort((a, b) => a.x - b.x);

    for (let index = 1; index < sorted.length; index += 1) {
      expect(sorted[index].x - sorted[index - 1].x).toBeGreaterThanOrEqual(1);
    }
  });
}

describe('conversationMapModel', () => {
  it('builds merged turn-card nodes and keeps prompt-only turns usable', () => {
    const messages: Message[] = [
      createMessage('m1', 'user', null, 0),
      createMessage('m2', 'assistant', 'm1', 1),
      createMessage('m3', 'user', 'm2', 2),
    ]

    const projection = buildConversationMapModel({
      messages,
      branches: [],
      selectedBranchIds: {},
      currentMessageId: 'm3',
    })

    expect(projection.nodes).toHaveLength(2)
    expect(projection.nodes[0]).toMatchObject({
      id: 'm2',
      promptMessageId: 'm1',
      responseMessageId: 'm2',
      promptContent: 'user-m1',
      responseContent: 'assistant-m2',
    })
    expect(projection.nodes[1]).toMatchObject({
      id: 'm3',
      promptMessageId: 'm3',
      responseMessageId: null,
      promptContent: 'user-m3',
      responseContent: '',
      isCurrent: true,
    })

    expect(projection.nodeIdByMessageId.get('m1')).toBe('m2')
    expect(projection.nodeIdByMessageId.get('m2')).toBe('m2')
    expect(projection.nodeIdByMessageId.get('m3')).toBe('m3')
  })

  it('computes the full branch-route patch for a deep target node', () => {
    const messages: Message[] = [
      createMessage('m1', 'user', null, 0),
      createMessage('m2', 'assistant', 'm1', 1),
      createMessage('m3', 'user', 'm2', 2),
      createMessage('m4', 'assistant', 'm3', 3),
      createMessage('m5', 'user', 'm2', 4),
      createMessage('m6', 'assistant', 'm5', 5),
      createMessage('m7', 'user', 'm6', 6),
      createMessage('m8', 'assistant', 'm7', 7),
      createMessage('m9', 'user', 'm6', 8),
      createMessage('m10', 'assistant', 'm9', 9),
    ]
    const branches: ConversationBranch[] = [
      createBranch('b1-main', 'm2', 'm3', true, 0),
      createBranch('b1-alt', 'm2', 'm5', false, 1),
      createBranch('b2-main', 'm6', 'm7', true, 0),
      createBranch('b2-alt', 'm6', 'm9', false, 1),
    ]

    expect(
      getRouteSelectionPatch({
        messages,
        branches,
        targetMessageId: 'm10',
      })
    ).toEqual({
      m2: 'b1-alt',
      m6: 'b2-alt',
    })

    expect(
      getRouteSelectionPatch({
        messages,
        branches,
        targetMessageId: 'm8',
      })
    ).toEqual({
      m2: 'b1-alt',
      m6: 'b2-main',
    })
  })

  it('anchors assistant navigation jumps on the prompting user message', () => {
    const messages: Message[] = [
      createMessage('m1', 'user', null, 0),
      createMessage('m2', 'assistant', 'm1', 1),
      createMessage('m3', 'user', 'm2', 2),
      createMessage('m4', 'assistant', 'm3', 3),
    ]

    expect(
      getMapNavigationAnchorMessageId({
        messages,
        targetMessageId: 'm4',
      })
    ).toBe('m3')

    expect(
      getMapNavigationAnchorMessageId({
        messages,
        targetMessageId: 'm3',
      })
    ).toBe('m3')
  })

  it('keeps adaptive positions stable when the active branch changes', () => {
    const messages: Message[] = [
      createMessage('m1', 'user', null, 0),
      createMessage('m2', 'assistant', 'm1', 1),
      createMessage('m3', 'user', 'm2', 2),
      createMessage('m4', 'assistant', 'm3', 3),
      createMessage('m5', 'user', 'm2', 4),
      createMessage('m6', 'assistant', 'm5', 5),
      createMessage('m7', 'user', 'm6', 6),
      createMessage('m8', 'assistant', 'm7', 7),
    ]
    const branches: ConversationBranch[] = [
      createBranch('b-main', 'm2', 'm3', true, 0),
      createBranch('b-alt', 'm2', 'm5', false, 1),
      createBranch('b-nested-main', 'm6', 'm7', true, 0),
    ]

    const mainProjection = buildConversationMapModel({
      messages,
      branches,
      selectedBranchIds: {
        m2: 'b-main',
        m6: 'b-nested-main',
      },
    })
    const altProjection = buildConversationMapModel({
      messages,
      branches,
      selectedBranchIds: {
        m2: 'b-alt',
        m6: 'b-nested-main',
      },
    })

    const mainXs = Object.fromEntries(
      mainProjection.nodes.map((node) => [node.id, node.x])
    )
    const altXs = Object.fromEntries(
      altProjection.nodes.map((node) => [node.id, node.x])
    )

    expect(mainXs).toEqual(altXs)
    expect(mainProjection.nodeById.get('m4')?.x).toBeGreaterThan(0)
    expect(mainProjection.nodeById.get('m6')?.x).toBeLessThan(0)
    expect(mainProjection.nodeById.get('m8')?.x).toBeLessThan(0)
    expectNoHorizontalOverlap(mainProjection)
    expectNoHorizontalOverlap(altProjection)
  })

  it('keeps positions stable when a branch point has no Main branch', () => {
    const messages: Message[] = [
      createMessage('m1', 'user', null, 0),
      createMessage('m2', 'assistant', 'm1', 1),
      createMessage('m3', 'user', 'm2', 2),
      createMessage('m4', 'assistant', 'm3', 3),
      createMessage('m5', 'user', 'm2', 4),
      createMessage('m6', 'assistant', 'm5', 5),
      createMessage('m7', 'user', 'm2', 6),
      createMessage('m8', 'assistant', 'm7', 7),
    ]
    const branches: ConversationBranch[] = [
      createBranch('b-first', 'm2', 'm3', false, 0),
      createBranch('b-second', 'm2', 'm5', false, 1),
      createBranch('b-third', 'm2', 'm7', false, 2),
    ]

    const firstProjection = buildConversationMapModel({
      messages,
      branches,
      selectedBranchIds: {
        m2: 'b-first',
      },
    })
    const thirdProjection = buildConversationMapModel({
      messages,
      branches,
      selectedBranchIds: {
        m2: 'b-third',
      },
    })

    const firstXs = Object.fromEntries(
      firstProjection.nodes.map((node) => [node.id, node.x])
    )
    const thirdXs = Object.fromEntries(
      thirdProjection.nodes.map((node) => [node.id, node.x])
    )

    expect(firstXs).toEqual(thirdXs)
    expect(firstProjection.nodeById.get('m4')?.x).toBe(0)
    expectNoHorizontalOverlap(firstProjection)
    expectNoHorizontalOverlap(thirdProjection)
  })

  it('pushes deep sibling subtrees outward instead of reusing an occupied column', () => {
    const messages: Message[] = [
      createMessage('m1', 'user', null, 0),
      createMessage('m2', 'assistant', 'm1', 1),
      createMessage('m3', 'user', 'm2', 2),
      createMessage('m4', 'assistant', 'm3', 3),
      createMessage('m5', 'user', 'm2', 4),
      createMessage('m6', 'assistant', 'm5', 5),
      createMessage('m7', 'user', 'm4', 6),
      createMessage('m8', 'assistant', 'm7', 7),
      createMessage('m9', 'user', 'm4', 8),
      createMessage('m10', 'assistant', 'm9', 9),
      createMessage('m11', 'user', 'm6', 10),
      createMessage('m12', 'assistant', 'm11', 11),
    ]

    const branches: ConversationBranch[] = [
      createBranch('root-main', 'm2', 'm3', true, 0),
      createBranch('root-alt', 'm2', 'm5', false, 1),
      createBranch('main-main', 'm4', 'm7', true, 0),
      createBranch('main-alt', 'm4', 'm9', false, 1),
      createBranch('alt-main', 'm6', 'm11', true, 0),
    ]

    const projection = buildConversationMapModel({
      messages,
      branches,
      selectedBranchIds: {
        m2: 'root-main',
        m4: 'main-main',
        m6: 'alt-main',
      },
    })

    expectNoHorizontalOverlap(projection)
    expect(projection.nodeById.get('m10')?.x).not.toBe(projection.nodeById.get('m12')?.x)
    expect(projection.nodeById.get('m2')?.subtreeWidth).toBeGreaterThan(2.5)
  })

  it('keeps all turn cards present when zoomed out', () => {
    const linearMessages: Message[] = [
      createMessage('m1', 'user', null, 0),
      createMessage('m2', 'assistant', 'm1', 1),
      createMessage('m3', 'user', 'm2', 2),
      createMessage('m4', 'assistant', 'm3', 3),
      createMessage('m5', 'user', 'm4', 4),
      createMessage('m6', 'assistant', 'm5', 5),
    ]

    const linearProjection = buildConversationMapModel({
      messages: linearMessages,
      branches: [],
      selectedBranchIds: {},
      zoom: 0.4,
    })

    expect(linearProjection.nodes.map((node) => node.id)).toEqual(['m2', 'm4', 'm6'])
    expect(linearProjection.collapsedSegments).toEqual([])

    const branchMessages: Message[] = [
      createMessage('b1', 'user', null, 0),
      createMessage('b2', 'assistant', 'b1', 1),
      createMessage('b3', 'user', 'b2', 2),
      createMessage('b4', 'assistant', 'b3', 3),
      createMessage('b5', 'user', 'b2', 4),
      createMessage('b6', 'assistant', 'b5', 5),
    ]
    const branchProjection = buildConversationMapModel({
      messages: branchMessages,
      branches: [
        createBranch('branch-main', 'b2', 'b3', true, 0),
        createBranch('branch-alt', 'b2', 'b5', false, 1),
      ],
      selectedBranchIds: { b2: 'branch-main' },
      zoom: 0.4,
    })

    expect(branchProjection.branchPointIds.has('b2')).toBe(true)
    expect(branchProjection.nodes.map((node) => node.id)).toEqual(['b2', 'b4', 'b6'])
    expect(branchProjection.collapsedSegments).toEqual([])
  })
})
