import type {
  BranchSelectionMap,
  ConversationBranch,
  Message,
} from '@/app/home/types'

const ROOT_KEY = '__root__'

export interface ConversationMapNode {
  id: string
  parentId: string | null
  depth: number
  lane: number
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

function createAlternatingOffsets(count: number) {
  const offsets: number[] = []

  for (let index = 0; index < count; index += 1) {
    const magnitude = Math.floor(index / 2) + 1
    offsets.push(index % 2 === 0 ? -magnitude : magnitude)
  }

  return offsets
}

function getBranchForEntryMessage(
  branches: ConversationBranch[],
  entryMessageId: string
) {
  return branches.find((branch) => branch.entryMessageId === entryMessageId) ?? null
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

export function sortMessages(messages: Message[]) {
  return [...messages].sort((a, b) => {
    const byTime = a.timestamp.getTime() - b.timestamp.getTime()
    if (byTime !== 0) {
      return byTime
    }

    return a.id.localeCompare(b.id)
  })
}

export function sortBranches(branches: ConversationBranch[]) {
  return [...branches].sort((a, b) => {
    if (a.sourceMessageId !== b.sourceMessageId) {
      return a.sourceMessageId.localeCompare(b.sourceMessageId)
    }

    if (a.isMain !== b.isMain) {
      return a.isMain ? -1 : 1
    }

    if (a.position !== b.position) {
      return a.position - b.position
    }

    return a.id.localeCompare(b.id)
  })
}

export function normalizeMessages(messages: Message[]) {
  const sorted = sortMessages(messages)
  const rootCount = sorted.filter((message) => message.previousMessageId === null).length
  const hasAnyPreviousPointer = sorted.some((message) => message.previousMessageId !== null)

  if (hasAnyPreviousPointer && rootCount <= 1) {
    return sorted.map((message) => ({
      ...message,
      previousMessageId: message.previousMessageId ?? null,
    }))
  }

  return sorted.map((message, index) => ({
    ...message,
    previousMessageId: index === 0 ? null : sorted[index - 1].id,
  }))
}

export function buildChildrenByPreviousId(messages: Message[]) {
  const map = new Map<string, Message[]>()

  for (const message of messages) {
    const key = message.previousMessageId ?? ROOT_KEY
    const existing = map.get(key)

    if (existing) {
      existing.push(message)
    } else {
      map.set(key, [message])
    }
  }

  return map
}

export function getActualBranchesForSource(
  branches: ConversationBranch[],
  sourceMessageId: string
) {
  return sortBranches(
    branches.filter((branch) => branch.sourceMessageId === sourceMessageId)
  )
}

export function getDefaultBranch(branches: ConversationBranch[]) {
  return branches.find((branch) => branch.isMain) ?? sortBranches(branches)[0] ?? null
}

export function getFirstChildMessage(
  childrenByPreviousId: Map<string, Message[]>,
  sourceMessageId: string
) {
  return childrenByPreviousId.get(sourceMessageId)?.[0] ?? null
}

export function getOrderedChildMessages(params: {
  messageId: string
  messagesById: Map<string, Message>
  childrenByPreviousId: Map<string, Message[]>
  branches: ConversationBranch[]
}) {
  const message = params.messagesById.get(params.messageId) ?? null
  const rawChildren = sortMessages(
    params.childrenByPreviousId.get(params.messageId) ?? []
  )

  if (!message || message.role !== 'assistant') {
    return rawChildren
  }

  const explicitBranches = getActualBranchesForSource(params.branches, params.messageId)
  if (explicitBranches.length === 0) {
    return rawChildren
  }

  const orderedIds = explicitBranches.map((branch) => branch.entryMessageId)
  const seen = new Set(orderedIds)
  const explicitChildren = orderedIds
    .map((id) => params.messagesById.get(id) ?? null)
    .filter((child): child is Message => child !== null)
  const extraChildren = rawChildren.filter((child) => !seen.has(child.id))

  return [...explicitChildren, ...extraChildren]
}

export function getPathToMessage(params: {
  messages: Message[]
  targetMessageId: string
}) {
  const normalizedMessages = normalizeMessages(params.messages)
  const messageById = new Map(normalizedMessages.map((message) => [message.id, message]))
  const path: Message[] = []
  const seen = new Set<string>()

  let current = messageById.get(params.targetMessageId) ?? null

  while (current && !seen.has(current.id)) {
    path.push(current)
    seen.add(current.id)
    current = current.previousMessageId
      ? messageById.get(current.previousMessageId) ?? null
      : null
  }

  return path.reverse()
}

export function getMapNavigationAnchorMessageId(params: {
  messages: Message[]
  targetMessageId: string
}) {
  const path = getPathToMessage(params)
  const target = path[path.length - 1] ?? null

  if (!target) {
    return null
  }

  if (target.role === 'user') {
    return target.id
  }

  const promptMessage = [...path]
    .reverse()
    .slice(1)
    .find((message) => message.role === 'user')

  return promptMessage?.id ?? target.id
}

export function getRouteSelectionPatch(params: {
  messages: Message[]
  branches: ConversationBranch[]
  targetMessageId: string
}) {
  const normalizedMessages = normalizeMessages(params.messages)
  const messageById = new Map(normalizedMessages.map((message) => [message.id, message]))
  const nextSelections: BranchSelectionMap = {}
  const seen = new Set<string>()

  let current = messageById.get(params.targetMessageId) ?? null

  while (current && !seen.has(current.id)) {
    seen.add(current.id)

    if (!current.previousMessageId) {
      break
    }

    const parent = messageById.get(current.previousMessageId) ?? null
    if (!parent) {
      break
    }

    if (parent.role === 'assistant') {
      const branch = getActualBranchesForSource(params.branches, parent.id).find(
        (candidate) => candidate.entryMessageId === current?.id
      )

      if (branch) {
        nextSelections[parent.id] = branch.id
      }
    }

    current = parent
  }

  return nextSelections
}

export function getActivePathMessages(params: {
  messages: Message[]
  branches: ConversationBranch[]
  selectedBranchIds: BranchSelectionMap
  pendingBranchSourceMessageId?: string | null
}) {
  const normalizedMessages = normalizeMessages(params.messages)
  const messageById = new Map(normalizedMessages.map((message) => [message.id, message]))
  const childrenByPreviousId = buildChildrenByPreviousId(normalizedMessages)
  const path: Message[] = []
  const seen = new Set<string>()

  let current = childrenByPreviousId.get(ROOT_KEY)?.[0] ?? null

  while (current && !seen.has(current.id)) {
    path.push(current)
    seen.add(current.id)

    if (
      current.role === 'assistant'
      && params.pendingBranchSourceMessageId === current.id
    ) {
      break
    }

    let nextMessage: Message | null = null
    if (current.role === 'assistant') {
      const branches = getActualBranchesForSource(params.branches, current.id)
      if (branches.length > 0) {
        const selectedBranchId =
          params.selectedBranchIds[current.id] ?? getDefaultBranch(branches)?.id ?? null
        const selectedBranch =
          branches.find((branch) => branch.id === selectedBranchId)
          ?? getDefaultBranch(branches)

        if (selectedBranch) {
          nextMessage = messageById.get(selectedBranch.entryMessageId) ?? null
        }
      }
    }

    if (!nextMessage) {
      nextMessage = getFirstChildMessage(childrenByPreviousId, current.id)
    }

    current = nextMessage
  }

  return path
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
  const rootIds = sortMessages(childrenByPreviousId.get(ROOT_KEY) ?? [])
    .filter((message) => message.role === 'user')
    .map((message) => message.id)
  const zoom = params.zoom ?? 1

  const visitTurn = (promptMessageId: string, depth: number, lane: number, parentId: string | null) => {
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
      lane,
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
        visitTurn(child.id, depth + 1, lane, node.id)
      })
      return
    }

    const mainBranch = getDefaultBranch(sourceBranches)
    const alternateBranches = sourceBranches.filter((branch) => branch.id !== mainBranch?.id)
    const laneByChildId = new Map<string, number>()

    if (mainBranch) {
      laneByChildId.set(mainBranch.entryMessageId, lane)
    }

    const alternateOffsets = createAlternatingOffsets(alternateBranches.length)
    alternateBranches.forEach((branch, index) => {
      laneByChildId.set(branch.entryMessageId, lane + alternateOffsets[index])
    })

    childPrompts.forEach((child) => {
      visitTurn(child.id, depth + 1, laneByChildId.get(child.id) ?? lane, node.id)
    })
  }

  rootIds.forEach((rootId, index) => {
    visitTurn(rootId, 0, index, null)
  })

  const branchPointIds = new Set(
    nodes.filter((node) => node.isBranchPoint).map((node) => node.id)
  )

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
