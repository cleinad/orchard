"use client"

import ReactMarkdown from 'react-markdown'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import type {
  ConversationMapModel,
  ConversationMapNode,
} from '@/app/home/components/conversationMapLayout'
import type { ConversationMapViewState } from '@/app/home/components/useConversationMapState'
import {
  markdownContentClassName,
  markdownRehypePlugins,
  markdownRemarkPlugins,
  normalizeMathMarkdown,
} from '@/lib/markdown'

interface ConversationMapProps {
  model: ConversationMapModel
  currentMessageId: string | null
  viewState: ConversationMapViewState
  followModePaused: boolean
  testId: string
  variant: 'desktop' | 'mobile'
  onClose: () => void
  onSelectMessage: (messageId: string) => void
  onViewStateChange: (patch: Partial<ConversationMapViewState>) => void
  onFollowModePausedChange: (paused: boolean) => void
}

const CARD_WIDTH = 304
const CARD_HEIGHT = 190
const HORIZONTAL_SPACING = 360
const TURN_GAP = 236
const WORLD_PADDING_X = 252
const WORLD_PADDING_Y = 144
const TOOLTIP_WIDTH = 336
const TOOLTIP_HEIGHT = 248
const MIN_ZOOM = 0.24

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function clampZoom(value: number) {
  return clamp(value, MIN_ZOOM, 1.45)
}

function normalizeContent(content: string) {
  return content.replace(/\s+/g, ' ').trim()
}

function getPreviewText(content: string, maxLength: number, fallback: string) {
  const normalized = normalizeContent(content)
  if (!normalized) {
    return fallback
  }

  if (normalized.length <= maxLength) {
    return normalized
  }

  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`
}

function getPromptPreview(node: ConversationMapNode) {
  return getPreviewText(node.promptContent, 140, 'No prompt')
}

function getResponsePreview(node: ConversationMapNode, maxLength = 280) {
  return getPreviewText(node.responseContent, maxLength, 'Response pending.')
}

function getTooltipMarkdown(content: string, fallback: string) {
  return content.trim() || fallback
}

function getNodePosition(node: ConversationMapNode) {
  return {
    x: WORLD_PADDING_X + node.x * HORIZONTAL_SPACING,
    y: WORLD_PADDING_Y + node.depth * TURN_GAP,
  }
}

function getNodeBounds(node: ConversationMapNode) {
  const position = getNodePosition(node)

  return {
    left: position.x - CARD_WIDTH / 2,
    top: position.y - CARD_HEIGHT / 2,
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
  }
}

function getModelBounds(model: ConversationMapModel) {
  if (model.nodes.length === 0) {
    return null
  }

  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  model.nodes.forEach((node) => {
    const bounds = getNodeBounds(node)
    minX = Math.min(minX, bounds.left)
    maxX = Math.max(maxX, bounds.left + bounds.width)
    minY = Math.min(minY, bounds.top)
    maxY = Math.max(maxY, bounds.top + bounds.height)
  })

  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  }
}

function getAnchorX(node: ConversationMapNode) {
  const bounds = getNodeBounds(node)

  return bounds.left + bounds.width / 2
}

function getEdgePath(from: ConversationMapNode, to: ConversationMapNode) {
  const fromBounds = getNodeBounds(from)
  const toBounds = getNodeBounds(to)
  const startX = getAnchorX(from)
  const startY = fromBounds.top + fromBounds.height
  const endX = getAnchorX(to)
  const endY = toBounds.top
  const exitY = startY + Math.min(42, Math.max(22, (endY - startY) * 0.22))
  const entryY = endY - Math.min(54, Math.max(26, (endY - startY) * 0.3))
  const deltaX = endX - startX
  const controlX1 = startX + deltaX * 0.18
  const controlX2 = endX - deltaX * 0.18

  return [
    `M ${startX} ${startY}`,
    `L ${startX} ${exitY}`,
    `C ${controlX1} ${exitY}, ${controlX2} ${entryY}, ${endX} ${entryY}`,
    `L ${endX} ${endY}`,
  ].join(' ')
}

function isPointOutOfView(params: {
  pointX: number
  pointY: number
  width: number
  height: number
}) {
  const marginX = Math.min(200, params.width * 0.18)
  const marginY = Math.min(200, params.height * 0.2)

  return (
    params.pointX < marginX
    || params.pointX > params.width - marginX
    || params.pointY < marginY
    || params.pointY > params.height - marginY
  )
}

function getNodeTooltipStyle(params: {
  node: ConversationMapNode
  cameraX: number
  cameraY: number
  zoom: number
  width: number
  height: number
}) {
  const bounds = getNodeBounds(params.node)
  const scaledLeft = bounds.left * params.zoom + params.cameraX
  const scaledTop = bounds.top * params.zoom + params.cameraY
  const scaledWidth = bounds.width * params.zoom
  const scaledHeight = bounds.height * params.zoom
  const hasRoomOnRight = scaledLeft + scaledWidth + 24 + TOOLTIP_WIDTH <= params.width - 12
  const left = hasRoomOnRight
    ? scaledLeft + scaledWidth + 18
    : Math.max(12, scaledLeft - TOOLTIP_WIDTH - 18)
  const top = clamp(
    scaledTop + scaledHeight * 0.18,
    12,
    Math.max(12, params.height - TOOLTIP_HEIGHT - 12)
  )

  return {
    left,
    top,
  }
}

function getNodeButtonStyle(node: ConversationMapNode): CSSProperties {
  const activeFill = node.isCurrent
    ? 'color-mix(in srgb, var(--accent) 10%, var(--background))'
    : node.isActivePath
      ? 'color-mix(in srgb, var(--accent) 5%, var(--surface))'
      : 'color-mix(in srgb, var(--surface) 95%, white)'
  const borderColor = node.isCurrent
    ? 'color-mix(in srgb, var(--accent) 54%, var(--foreground))'
    : node.isActivePath
      ? 'color-mix(in srgb, var(--accent) 30%, var(--foreground))'
      : 'color-mix(in srgb, var(--foreground) 14%, transparent)'

  return {
    background: activeFill,
    borderColor,
    boxShadow: node.isCurrent
      ? '0 12px 30px color-mix(in srgb, var(--foreground) 10%, transparent)'
      : node.isActivePath
        ? '0 8px 22px color-mix(in srgb, var(--foreground) 6%, transparent)'
        : '0 1px 0 color-mix(in srgb, var(--foreground) 6%, transparent)',
  }
}

function getActiveNode(model: ConversationMapModel, currentMessageId: string | null) {
  if (currentMessageId) {
    const currentNodeId = model.nodeIdByMessageId.get(currentMessageId) ?? null
    if (currentNodeId) {
      return model.nodeById.get(currentNodeId) ?? null
    }
  }

  return [...model.activePathNodeIds]
    .map((id) => model.nodeById.get(id) ?? null)
    .filter((node): node is ConversationMapNode => node !== null)
    .sort((a, b) => b.depth - a.depth)[0]
    ?? null
}

function lineClampStyle(lines: number): CSSProperties {
  return {
    display: '-webkit-box',
    WebkitLineClamp: lines,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  }
}

export default function ConversationMap({
  model,
  currentMessageId,
  viewState,
  followModePaused,
  testId,
  variant,
  onClose,
  onSelectMessage,
  onViewStateChange,
  onFollowModePausedChange,
}: ConversationMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const lastInteractionRef = useRef<'pointer' | 'keyboard'>('pointer')
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null)
  const modelBounds = getModelBounds(model)

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    const updateSize = () => {
      setContainerSize({
        width: container.clientWidth,
        height: container.clientHeight,
      })
    }

    updateSize()
    const observer = new ResizeObserver(updateSize)
    observer.observe(container)

    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === 'Tab'
        || event.key === 'ArrowUp'
        || event.key === 'ArrowDown'
        || event.key === 'ArrowLeft'
        || event.key === 'ArrowRight'
      ) {
        lastInteractionRef.current = 'keyboard'
      }
    }

    const handlePointerDown = () => {
      lastInteractionRef.current = 'pointer'
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('pointerdown', handlePointerDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [])

  const centerOnNode = useCallback(
    (node: ConversationMapNode) => {
      if (!containerSize.width || !containerSize.height) {
        return
      }

      const position = getNodePosition(node)
      onViewStateChange({
        cameraX: containerSize.width * 0.46 - position.x * viewState.zoom,
        cameraY: containerSize.height * 0.22 - position.y * viewState.zoom,
      })
    },
    [containerSize.height, containerSize.width, onViewStateChange, viewState.zoom]
  )

  useEffect(() => {
    if (!containerSize.width || !containerSize.height || followModePaused) {
      return
    }

    const targetNode = getActiveNode(model, currentMessageId)
    if (!targetNode) {
      return
    }

    if (viewState.cameraX === 0 && viewState.cameraY === 0 && modelBounds) {
      const widthFitFactor = variant === 'mobile' ? 0.48 : 0.72
      const heightFitFactor = variant === 'mobile' ? 0.46 : 0.68
      const maxFitZoom = variant === 'mobile' ? 0.68 : 0.92
      const fitZoom = clampZoom(
        Math.min(
          (containerSize.width * widthFitFactor) / Math.max(modelBounds.width, 1),
          (containerSize.height * heightFitFactor) / Math.max(modelBounds.height, 1),
          maxFitZoom
        )
      )

      onViewStateChange({
        zoom: fitZoom,
        cameraX:
          containerSize.width / 2
          - ((modelBounds.minX + modelBounds.maxX) / 2) * fitZoom,
        cameraY:
          containerSize.height * (variant === 'mobile' ? 0.14 : 0.18)
          - modelBounds.minY * fitZoom,
      })
      return
    }

    const position = getNodePosition(targetNode)
    const pointX = position.x * viewState.zoom + viewState.cameraX
    const pointY = position.y * viewState.zoom + viewState.cameraY

    if (
      modelBounds
      && modelBounds.width * viewState.zoom <= containerSize.width * 0.9
      && modelBounds.height * viewState.zoom <= containerSize.height * 0.9
    ) {
      return
    }

    if (
      isPointOutOfView({
        pointX,
        pointY,
        width: containerSize.width,
        height: containerSize.height,
      })
    ) {
      centerOnNode(targetNode)
    }
  }, [
    centerOnNode,
    containerSize.height,
    containerSize.width,
    currentMessageId,
    followModePaused,
    model,
    modelBounds,
    onViewStateChange,
    viewState.cameraX,
    viewState.cameraY,
  ])

  const handleWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      event.preventDefault()

      const container = containerRef.current
      if (!container) {
        return
      }

      const rect = container.getBoundingClientRect()
      const pointX = event.clientX - rect.left
      const pointY = event.clientY - rect.top
      const nextZoom = clampZoom(viewState.zoom * (event.deltaY > 0 ? 0.92 : 1.08))
      const worldX = (pointX - viewState.cameraX) / viewState.zoom
      const worldY = (pointY - viewState.cameraY) / viewState.zoom

      onFollowModePausedChange(true)
      onViewStateChange({
        zoom: nextZoom,
        cameraX: pointX - worldX * nextZoom,
        cameraY: pointY - worldY * nextZoom,
      })
    },
    [
      onFollowModePausedChange,
      onViewStateChange,
      viewState.cameraX,
      viewState.cameraY,
      viewState.zoom,
    ]
  )

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      lastInteractionRef.current = 'pointer'
      const target = event.target as HTMLElement
      if (target.closest('[data-map-node="true"]')) {
        return
      }

      const startX = event.clientX
      const startY = event.clientY
      const startCameraX = viewState.cameraX
      const startCameraY = viewState.cameraY

      onFollowModePausedChange(true)

      const handlePointerMove = (moveEvent: PointerEvent) => {
        onViewStateChange({
          cameraX: startCameraX + (moveEvent.clientX - startX),
          cameraY: startCameraY + (moveEvent.clientY - startY),
        })
      }

      const handlePointerUp = () => {
        window.removeEventListener('pointermove', handlePointerMove)
        window.removeEventListener('pointerup', handlePointerUp)
      }

      window.addEventListener('pointermove', handlePointerMove)
      window.addEventListener('pointerup', handlePointerUp)
    },
    [
      onFollowModePausedChange,
      onViewStateChange,
      viewState.cameraX,
      viewState.cameraY,
    ]
  )

  const previewNodeId = hoveredNodeId ?? focusedNodeId
  const previewNode = previewNodeId ? model.nodeById.get(previewNodeId) ?? null : null
  const previewPosition =
    previewNode && variant === 'desktop'
      ? getNodeTooltipStyle({
          node: previewNode,
          cameraX: viewState.cameraX,
          cameraY: viewState.cameraY,
          zoom: viewState.zoom,
          width: containerSize.width,
          height: containerSize.height,
        })
      : null

  return (
    <div
      data-testid={testId}
      className="relative flex h-full min-h-0 flex-col overflow-hidden bg-background"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
      >
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `
              radial-gradient(circle at top left, color-mix(in srgb, var(--accent) 8%, transparent), transparent 34%),
              radial-gradient(circle at bottom right, color-mix(in srgb, var(--foreground) 4%, transparent), transparent 30%)
            `,
          }}
        />
        <div className="absolute inset-y-0 left-7 w-px bg-foreground/[0.05]" />
        <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-background via-background/92 to-transparent" />
      </div>

      <div className="relative z-10 flex items-start justify-between px-5 pb-2 pt-4">
        <div>
          <p className="font-sans text-[11px] tracking-[0.01em] text-muted">
            Conversation map
          </p>
          <p className="mt-1 text-sm text-foreground">
            {model.branchPointIds.size === 0
              ? model.nodes.length === 1
                ? '1 turn'
                : `${model.nodes.length} turns`
              : model.branchPointIds.size === 1
                ? '1 fork point'
                : `${model.branchPointIds.size} fork points`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {followModePaused && (
            <button
              type="button"
              onClick={() => {
                onFollowModePausedChange(false)
                const targetNode = getActiveNode(model, currentMessageId)

                if (targetNode) {
                  centerOnNode(targetNode)
                }
              }}
              className="font-sans text-[12px] text-muted transition-colors duration-200 hover:text-foreground"
            >
              Recenter
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label={variant === 'mobile' ? 'Close conversation map' : 'Hide conversation map'}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors duration-200 hover:bg-foreground/[0.04] hover:text-foreground"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 6l12 12M18 6L6 18"
              />
            </svg>
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative min-h-0 flex-1 overflow-hidden touch-none"
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
      >
        <svg className="pointer-events-none absolute inset-0 h-full w-full">
          <g transform={`translate(${viewState.cameraX} ${viewState.cameraY})`}>
            <g transform={`scale(${viewState.zoom})`}>
              {model.edges.map((edge) => {
                const from = model.nodeById.get(edge.from) ?? null
                const to = model.nodeById.get(edge.to) ?? null
                if (!from || !to) {
                  return null
                }

                const path = getEdgePath(from, to)

                return (
                  <g key={edge.id}>
                    {edge.isActivePath && (
                      <path
                        d={path}
                        fill="none"
                        stroke="color-mix(in srgb, var(--accent) 18%, transparent)"
                        strokeWidth={9}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    )}
                    <path
                      d={path}
                      fill="none"
                      stroke={
                        edge.isActivePath
                          ? 'color-mix(in srgb, var(--accent) 48%, var(--foreground))'
                          : 'color-mix(in srgb, var(--foreground) 12%, transparent)'
                      }
                      strokeWidth={edge.isActivePath ? 2.6 : 1.3}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </g>
                )
              })}
            </g>
          </g>
        </svg>

        <div className="absolute inset-0">
          {model.nodes.map((node) => {
            const bounds = getNodeBounds(node)
            const scaledLeft = bounds.left * viewState.zoom + viewState.cameraX
            const scaledTop = bounds.top * viewState.zoom + viewState.cameraY
            const responsePreview = getResponsePreview(node)

            return (
              <button
                key={node.id}
                type="button"
                data-map-node="true"
                data-map-node-id={node.id}
                data-map-node-current={node.isCurrent ? 'true' : 'false'}
                data-map-node-active-path={node.isActivePath ? 'true' : 'false'}
                aria-current={node.isCurrent ? 'step' : undefined}
                aria-label={`${getPromptPreview(node)} ${responsePreview}`}
                onPointerEnter={() => {
                  if (variant === 'desktop') {
                    setHoveredNodeId(node.id)
                  }
                }}
                onPointerLeave={() => {
                  setHoveredNodeId((current) => (current === node.id ? null : current))
                }}
                onFocus={() => {
                  if (variant === 'desktop' && lastInteractionRef.current === 'keyboard') {
                    setFocusedNodeId(node.id)
                  }
                }}
                onBlur={() => {
                  setFocusedNodeId((current) => (current === node.id ? null : current))
                }}
                onClick={() => {
                  onFollowModePausedChange(false)
                  onSelectMessage(node.id)
                }}
                className="absolute cursor-pointer overflow-hidden rounded-[12px] border text-left transition-[border-color,background-color,box-shadow] duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] focus-visible:ring-offset-2"
                style={{
                  left: scaledLeft,
                  top: scaledTop,
                  width: bounds.width * viewState.zoom,
                  height: bounds.height * viewState.zoom,
                  ...getNodeButtonStyle(node),
                }}
              >
                <div
                  className="flex h-full flex-col overflow-hidden rounded-[11px] px-5 pb-4 pt-4"
                  style={{
                    width: bounds.width,
                    height: bounds.height,
                    transform: `scale(${viewState.zoom})`,
                    transformOrigin: 'top left',
                  }}
                >
                  <div className="mb-4 flex items-start gap-3">
                    <div
                      aria-hidden="true"
                      className="mt-0.5 h-9 w-[3px] shrink-0 rounded-full"
                      style={{
                        background: node.isCurrent
                          ? 'color-mix(in srgb, var(--accent) 74%, var(--foreground))'
                          : node.isActivePath
                            ? 'color-mix(in srgb, var(--accent) 42%, var(--foreground))'
                            : 'color-mix(in srgb, var(--foreground) 12%, transparent)',
                      }}
                    />
                    <p
                      className="min-w-0 font-sans text-[12px] leading-[1.45] text-muted"
                      style={lineClampStyle(1)}
                    >
                      {getPromptPreview(node)}
                    </p>
                  </div>

                  <div className="min-h-0 flex-1">
                    <p
                      className="text-[15px] leading-[1.55] text-foreground"
                      style={lineClampStyle(3)}
                    >
                      {responsePreview}
                    </p>
                  </div>

                  <div className="mt-4 flex min-h-5 items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="h-1.5 w-1.5 rounded-full"
                        style={{
                          background: node.isCurrent
                            ? 'color-mix(in srgb, var(--accent) 78%, var(--foreground))'
                            : node.isActivePath
                              ? 'color-mix(in srgb, var(--accent) 44%, var(--foreground))'
                              : 'color-mix(in srgb, var(--foreground) 16%, transparent)',
                        }}
                      />
                      {node.isCurrent && (
                        <span className="font-sans text-[11px] text-muted">
                          Current turn
                        </span>
                      )}
                    </div>
                    {node.isBranchPoint && (
                      <svg
                        className="h-4 w-4 shrink-0 text-muted/70"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M7 5v5m0 0 4 4m-4-4-4 4M17 19v-5m0 0-4-4m4 4 4-4"
                        />
                      </svg>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        {variant === 'desktop' && previewNode && previewPosition && (
          <div
            data-testid="conversation-map-tooltip"
            aria-hidden="true"
            className="pointer-events-none absolute z-20 w-[336px] rounded-[16px] border border-border-subtle/80 bg-background/96 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.12)]"
            style={{
              left: previewPosition.left,
              top: previewPosition.top,
            }}
          >
            <div className="space-y-4">
              <p className="font-sans text-[12px] leading-[1.5] text-muted">
                {getPreviewText(previewNode.promptContent, 220, 'No prompt')}
              </p>
              <div className="h-px bg-border-subtle/80" />
              <div
                className={`${markdownContentClassName} max-h-[11rem] overflow-hidden text-[14px] leading-[1.65] text-foreground`}
              >
                <ReactMarkdown
                  remarkPlugins={markdownRemarkPlugins}
                  rehypePlugins={markdownRehypePlugins}
                  components={{
                    a: ({ children }) => (
                      <span className="underline decoration-foreground/30 underline-offset-[0.18em]">
                        {children}
                      </span>
                    ),
                  }}
                >
                  {normalizeMathMarkdown(
                    getTooltipMarkdown(previewNode.responseContent, 'Response pending.')
                  )}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
