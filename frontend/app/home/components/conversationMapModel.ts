import type {
  BranchSelectionMap,
  ConversationBranch,
  Message,
} from '@/app/home/types'

export const CONVERSATION_ROOT_KEY = '__root__'

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
  const rootCount = sorted.filter(
    (message) => message.previousMessageId === null
  ).length
  const hasAnyPreviousPointer = sorted.some(
    (message) => message.previousMessageId !== null
  )

  if (hasAnyPreviousPointer && rootCount <= 1) {
    return sorted
  }

  return sorted.map((message, index) => ({
    ...message,
    previousMessageId: index === 0 ? null : sorted[index - 1].id,
  }))
}

export function buildChildrenByPreviousId(messages: Message[]) {
  const map = new Map<string, Message[]>()

  for (const message of messages) {
    const key = message.previousMessageId ?? CONVERSATION_ROOT_KEY
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

  const explicitBranches = getActualBranchesForSource(
    params.branches,
    params.messageId
  )
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
  const messageById = new Map(
    normalizedMessages.map((message) => [message.id, message])
  )
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
  const messageById = new Map(
    normalizedMessages.map((message) => [message.id, message])
  )
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
  const messageById = new Map(
    normalizedMessages.map((message) => [message.id, message])
  )
  const childrenByPreviousId = buildChildrenByPreviousId(normalizedMessages)
  const path: Message[] = []
  const seen = new Set<string>()

  let current =
    childrenByPreviousId.get(CONVERSATION_ROOT_KEY)?.[0] ?? null

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
          params.selectedBranchIds[current.id]
          ?? getDefaultBranch(branches)?.id
          ?? null
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
