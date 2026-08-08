import type {
  BranchSelectionMap,
  ConversationBranch,
  Message,
} from '@/app/home/types'
import {
  buildChildrenByPreviousId,
  CONVERSATION_ROOT_KEY as ROOT_KEY,
  getActivePathMessages,
  getActualBranchesForSource,
  getOrderedChildMessages,
  normalizeMessages,
  sortMessages,
} from '@/app/home/components/conversationMapModel'

// Layout projection is loaded only when the optional conversation map opens.

export interface ConversationMapNode {
  id: string
  parentId: string | null
  depth: number
  x: number
  idealX: number
  subtreeWidth: number
  childIds: string[]
  promptMessageId: string
  responseMessageId: string | null
  promptContent: string
  responseContent: string
  branchId: string | null
  isMainBranch: boolean
  isBranchPoint: boolean
  isActivePath: boolean
  isCurrent: boolean
}
export interface ConversationMapEdge {
  id: string
  from: string
  to: string
  isActivePath: boolean
}

export interface ConversationMapCollapsedSegment {
  id: string
  lane: number
  startNodeId: string
  endNodeId: string
  nodeIds: string[]
  depthStart: number
  depthEnd: number
  count: number
}

export interface ConversationMapModel {
  rootIds: string[]
  nodes: ConversationMapNode[]
  edges: ConversationMapEdge[]
  nodeById: Map<string, ConversationMapNode>
  nodeIdByMessageId: Map<string, string>
  activePathNodeIds: Set<string>
  branchPointIds: Set<string>
  collapsedSegments: ConversationMapCollapsedSegment[]
}

type LayoutDirection = -1 | 1

interface LayoutVariant {
  childOffsetById: Map<string, number>
  envelopeLeft: number
  envelopeRight: number
  subtreeWidth: number
}

const NODE_WIDTH_UNITS = 1
const SIBLING_GAP_UNITS = 0.22

function getBranchForEntryMessage(
  branches: ConversationBranch[],
  entryMessageId: string
) {
  return branches.find((branch) => branch.entryMessageId === entryMessageId) ?? null
}

function getCanonicalChildIds(node: ConversationMapNode, nodeById: Map<string, ConversationMapNode>) {
  const mainChildId = node.childIds.find((childId) => nodeById.get(childId)?.isMainBranch) ?? null
  if (mainChildId) {
    return {
      focusChildId: mainChildId,
      remainingChildIds: node.childIds.filter((childId) => childId !== mainChildId),
    }
  }

  return {
    focusChildId: node.childIds[0] ?? null,
    remainingChildIds: node.childIds.slice(1),
  }
}

function directionToSide(direction: LayoutDirection) {
  return direction === -1 ? 'left' : 'right'
}

function getChildDirectionForOffset(offset: number, fallbackDirection: LayoutDirection): LayoutDirection {
  if (offset < 0) {
    return 1
  }

  if (offset > 0) {
    return -1
  }

  return fallbackDirection
}

function createLeafLayoutVariant(): LayoutVariant {
  return {
    childOffsetById: new Map(),
    envelopeLeft: -NODE_WIDTH_UNITS / 2,
    envelopeRight: NODE_WIDTH_UNITS / 2,
    subtreeWidth: NODE_WIDTH_UNITS,
  }
}

function getAssistantReplyForPrompt(params: {
  promptId: string
  childrenByPreviousId: Map<string, Message[]>
}) {
  const childMessages = sortMessages(params.childrenByPreviousId.get(params.promptId) ?? [])

  return childMessages.find((child) => child.role === 'assistant') ?? null
}

function getChildPromptsForTurn(params: {
  promptMessageId: string
  responseMessageId: string | null
  messagesById: Map<string, Message>
  childrenByPreviousId: Map<string, Message[]>
  branches: ConversationBranch[]
}) {
  if (!params.responseMessageId) {
    return []
  }

  return getOrderedChildMessages({
    messageId: params.responseMessageId,
    messagesById: params.messagesById,
    childrenByPreviousId: params.childrenByPreviousId,
    branches: params.branches,
  }).filter((message) => message.role === 'user')
}

export function buildConversationMapModel(params: {
  messages: Message[]
  branches: ConversationBranch[]
  selectedBranchIds: BranchSelectionMap
  pendingBranchSourceMessageId?: string | null
  currentMessageId?: string | null
  zoom?: number
}) {
  const normalizedMessages = normalizeMessages(params.messages)
  const messageById = new Map(normalizedMessages.map((message) => [message.id, message]))
  const childrenByPreviousId = buildChildrenByPreviousId(normalizedMessages)
  const activePathMessages = getActivePathMessages({
    messages: normalizedMessages,
    branches: params.branches,
    selectedBranchIds: params.selectedBranchIds,
    pendingBranchSourceMessageId: params.pendingBranchSourceMessageId,
  })
  const activePathMessageIds = new Set(activePathMessages.map((message) => message.id))
  const nodes: ConversationMapNode[] = []
  const edges: ConversationMapEdge[] = []
  const nodeById = new Map<string, ConversationMapNode>()
  const nodeIdByMessageId = new Map<string, string>()
  const activePathNodeIds = new Set<string>()
  const visitedPromptIds = new Set<string>()
  const rootPromptIds = sortMessages(childrenByPreviousId.get(ROOT_KEY) ?? [])
    .filter((message) => message.role === 'user')
    .map((message) => message.id)

  const visitTurn = (promptMessageId: string, depth: number, parentId: string | null) => {
    if (visitedPromptIds.has(promptMessageId)) {
      return
    }

    const promptMessage = messageById.get(promptMessageId) ?? null
    if (!promptMessage || promptMessage.role !== 'user') {
      return
    }

    visitedPromptIds.add(promptMessageId)

    const responseMessage = getAssistantReplyForPrompt({
      promptId: promptMessage.id,
      childrenByPreviousId,
    })
    const sourceBranches = responseMessage
      ? getActualBranchesForSource(params.branches, responseMessage.id)
      : []
    const branchPoint = sourceBranches.length > 0
    const childPrompts = getChildPromptsForTurn({
      promptMessageId,
      responseMessageId: responseMessage?.id ?? null,
      messagesById: messageById,
      childrenByPreviousId,
      branches: params.branches,
    })
    const branchForNode =
      parentId !== null ? getBranchForEntryMessage(params.branches, promptMessage.id) : null
    const nodeId = responseMessage?.id ?? promptMessage.id
    const isActivePath =
      activePathMessageIds.has(promptMessage.id)
      || (responseMessage ? activePathMessageIds.has(responseMessage.id) : false)
    const isCurrent =
      params.currentMessageId === promptMessage.id
      || params.currentMessageId === responseMessage?.id

    const node: ConversationMapNode = {
      id: nodeId,
      parentId,
      depth,
      x: 0,
      idealX: 0,
      subtreeWidth: NODE_WIDTH_UNITS,
      childIds: childPrompts.map((child) => {
        const childResponse = getAssistantReplyForPrompt({
          promptId: child.id,
          childrenByPreviousId,
        })

        return childResponse?.id ?? child.id
      }),
      promptMessageId: promptMessage.id,
      responseMessageId: responseMessage?.id ?? null,
      promptContent: promptMessage.content,
      responseContent: responseMessage?.content ?? '',
      branchId: branchForNode?.id ?? null,
      isMainBranch: branchForNode?.isMain ?? false,
      isBranchPoint: branchPoint,
      isActivePath,
      isCurrent,
    }

    nodes.push(node)
    nodeById.set(node.id, node)
    nodeIdByMessageId.set(promptMessage.id, node.id)
    if (responseMessage) {
      nodeIdByMessageId.set(responseMessage.id, node.id)
    }
    if (isActivePath) {
      activePathNodeIds.add(node.id)
    }

    if (parentId !== null) {
      edges.push({
        id: `${parentId}:${node.id}`,
        from: parentId,
        to: node.id,
        isActivePath: activePathNodeIds.has(parentId) && isActivePath,
      })
    }

    if (childPrompts.length === 0) {
      return
    }

    if (!branchPoint) {
      childPrompts.forEach((child) => {
        visitTurn(child.id, depth + 1, node.id)
      })
      return
    }

    childPrompts.forEach((child) => {
      visitTurn(child.id, depth + 1, node.id)
    })
  }

  rootPromptIds.forEach((rootId) => {
    visitTurn(rootId, 0, null)
  })

  const rootIds = rootPromptIds.map((promptId) => nodeIdByMessageId.get(promptId) ?? promptId)

  const branchPointIds = new Set(
    nodes.filter((node) => node.isBranchPoint).map((node) => node.id)
  )

  const layoutVariantsById = new Map<string, Record<LayoutDirection, LayoutVariant>>()

  const measureVariant = (nodeId: string, direction: LayoutDirection): LayoutVariant => {
    const existing = layoutVariantsById.get(nodeId)?.[direction]
    if (existing) {
      return existing
    }

    const node = nodeById.get(nodeId) ?? null
    if (!node) {
      return createLeafLayoutVariant()
    }

    if (node.childIds.length === 0) {
      const leafVariant = createLeafLayoutVariant()
      const variants = layoutVariantsById.get(nodeId) ?? { [-1]: leafVariant, [1]: leafVariant }
      variants[direction] = leafVariant
      layoutVariantsById.set(nodeId, variants)
      return leafVariant
    }

    const { focusChildId, remainingChildIds } = getCanonicalChildIds(node, nodeById)
    const childOffsetById = new Map<string, number>()
    let leftBoundary = 0
    let rightBoundary = 0

    if (focusChildId && node.childIds.length % 2 === 1) {
      const focusVariant = measureVariant(focusChildId, direction)
      childOffsetById.set(focusChildId, 0)
      leftBoundary = focusVariant.envelopeLeft
      rightBoundary = focusVariant.envelopeRight
    }

    const placementIds =
      focusChildId && node.childIds.length % 2 === 0
        ? [focusChildId, ...remainingChildIds]
        : remainingChildIds

    let nextSide = directionToSide(direction)
    placementIds.forEach((childId) => {
      const childDirection: LayoutDirection = nextSide === 'left' ? 1 : -1
      const childVariant = measureVariant(childId, childDirection)

      if (nextSide === 'left') {
        const offset = leftBoundary - SIBLING_GAP_UNITS - childVariant.envelopeRight
        childOffsetById.set(childId, offset)
        leftBoundary = offset + childVariant.envelopeLeft
      } else {
        const offset = rightBoundary + SIBLING_GAP_UNITS - childVariant.envelopeLeft
        childOffsetById.set(childId, offset)
        rightBoundary = offset + childVariant.envelopeRight
      }

      nextSide = nextSide === 'left' ? 'right' : 'left'
    })

    const measuredVariant: LayoutVariant = {
      childOffsetById,
      envelopeLeft: Math.min(-NODE_WIDTH_UNITS / 2, leftBoundary),
      envelopeRight: Math.max(NODE_WIDTH_UNITS / 2, rightBoundary),
      subtreeWidth:
        Math.max(NODE_WIDTH_UNITS / 2, rightBoundary)
        - Math.min(-NODE_WIDTH_UNITS / 2, leftBoundary),
    }

    const variants = layoutVariantsById.get(nodeId) ?? {
      [-1]: measuredVariant,
      [1]: measuredVariant,
    }
    variants[direction] = measuredVariant
    layoutVariantsById.set(nodeId, variants)

    return measuredVariant
  }

  const rootOffsetById = new Map<string, number>()
  const focusRootId = rootIds[0] ?? null
  let rootLeftBoundary = 0
  let rootRightBoundary = 0

  if (focusRootId && rootIds.length % 2 === 1) {
    const rootVariant = measureVariant(focusRootId, 1)
    rootOffsetById.set(focusRootId, 0)
    rootLeftBoundary = rootVariant.envelopeLeft
    rootRightBoundary = rootVariant.envelopeRight
  }

  const remainingRootIds =
    focusRootId && rootIds.length % 2 === 1
      ? rootIds.filter((rootId) => rootId !== focusRootId)
      : rootIds
  let nextRootSide: 'left' | 'right' = 'right'

  remainingRootIds.forEach((rootId) => {
    const rootDirection: LayoutDirection = nextRootSide === 'left' ? 1 : -1
    const rootVariant = measureVariant(rootId, rootDirection)

    if (nextRootSide === 'left') {
      const offset = rootLeftBoundary - SIBLING_GAP_UNITS - rootVariant.envelopeRight
      rootOffsetById.set(rootId, offset)
      rootLeftBoundary = offset + rootVariant.envelopeLeft
    } else {
      const offset = rootRightBoundary + SIBLING_GAP_UNITS - rootVariant.envelopeLeft
      rootOffsetById.set(rootId, offset)
      rootRightBoundary = offset + rootVariant.envelopeRight
    }

    nextRootSide = nextRootSide === 'left' ? 'right' : 'left'
  })

  const assignPositions = (nodeId: string, x: number, direction: LayoutDirection) => {
    const node = nodeById.get(nodeId) ?? null
    if (!node) {
      return
    }

    const variant = measureVariant(nodeId, direction)
    node.x = x
    node.idealX = x
    node.subtreeWidth = variant.subtreeWidth

    node.childIds.forEach((childId) => {
      const childOffset = variant.childOffsetById.get(childId)
      if (typeof childOffset !== 'number') {
        return
      }

      assignPositions(
        childId,
        x + childOffset,
        getChildDirectionForOffset(childOffset, direction)
      )
    })
  }

  rootIds.forEach((rootId) => {
    const offset = rootOffsetById.get(rootId)
    if (typeof offset !== 'number') {
      return
    }

    assignPositions(
      rootId,
      offset,
      getChildDirectionForOffset(offset, 1)
    )
  })

  return {
    rootIds,
    nodes,
    edges,
    nodeById,
    nodeIdByMessageId,
    activePathNodeIds,
    branchPointIds,
    collapsedSegments: [],
  }
}
