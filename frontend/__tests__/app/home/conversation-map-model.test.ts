import { describe, expect, it } from 'vitest';
import type { ConversationBranch, Message } from '@/app/home/types';
import {
  buildConversationMapModel,
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

  it('keeps lane assignment stable when the active branch changes', () => {
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

    const mainLanes = Object.fromEntries(
      mainProjection.nodes.map((node) => [node.id, node.lane])
    )
    const altLanes = Object.fromEntries(
      altProjection.nodes.map((node) => [node.id, node.lane])
    )

    expect(mainLanes).toEqual(altLanes)
    expect(mainProjection.nodeById.get('m4')?.lane).toBe(0)
    expect(mainProjection.nodeById.get('m6')?.lane).toBe(-1)
    expect(mainProjection.nodeById.get('m8')?.lane).toBe(-1)
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
