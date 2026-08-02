# Model Selection

The chat composer exposes a server-derived catalog of configured models.
Selection applies to main replies, conversation branches, and inline threads.

## Availability

`frontend/lib/chat-models.ts` is the catalog source of truth. Each concrete
model specifies:

- provider and API model ID
- required server-side environment variable
- image support
- optional effort levels and thinking controls
- display metadata

The server marks a model available only when its provider key is configured.
The browser does not receive provider secrets.

Current provider families are OpenAI, Anthropic, Google, and DeepSeek.

## Auto

Auto is the default selection. It resolves text-only context to DeepSeek V4 Pro.
For context containing an image, it uses Gemini 3.6 Flash when configured and
otherwise falls back to GPT-5.6 Terra. If neither image target is configured,
the composer asks the user to choose a vision-capable model.

The resolved concrete model is returned with the run metadata for debugging and
verification.

The response-mode menu presents Auto first. Advanced opens the concrete model
catalog and its model-specific effort and thinking controls.

## Selection and fallback

For each request:

1. Use the requested catalog entry when it is valid and configured.
2. Resolve Auto to DeepSeek V4 Pro or, for image context, the first configured
   target in the Gemini 3.6 Flash and GPT-5.6 Terra fallback order.
3. Otherwise try the configured default.
4. Otherwise use the first configured concrete model.
5. If no provider is configured, return a clear configuration error.

An unavailable or stale browser selection never causes the server to instantiate
an unconfigured provider.

## Effort and thinking

Models may expose `minimal`, `low`, `medium`, `high`, `xhigh`, or `max` effort levels.
The supported subset and default are model-specific.

Some providers also expose a thinking toggle. Provider adapters translate the
shared controls into provider-native options, such as reasoning effort,
thinking level, adaptive thinking, or a thinking budget.

The OpenAI catalog includes GPT-5.6 Sol, Terra, and Luna. The Anthropic
catalog includes Claude Sonnet 5 and Claude Opus 5. DeepSeek V4 Pro remains
available; DeepSeek V4 Flash is not exposed.

The selected model is a global browser preference. Effort and thinking choices
are stored per model so switching models restores each model's last compatible
settings.

## Images

The catalog declares whether a model can receive images. The composer prevents
image submission to a text-only selection, and the server validates the same
constraint.

## Key implementation

- `frontend/lib/chat-models.ts`
- `frontend/lib/models.ts`
- `frontend/app/api/chat/models/route.ts`
- `frontend/app/home/components/ChatModelPicker.tsx`
- `frontend/app/home/components/useChatModelCatalog.ts`
- `frontend/app/home/components/chatPreferencePersistence.ts`

## Verification

- `frontend/__tests__/lib/chat-models.test.ts`
- `frontend/__tests__/lib/models.test.ts`
- model cases in `frontend/__tests__/app/chat-route.test.ts`
- model persistence cases in `frontend/e2e/home-routing.spec.js`

## Related docs

- [Response style](./response-style.md)
- [Image attachments](./image-attachments.md)
- [Chat run lifecycle](./chat-run-lifecycle.md)
- [Local setup](../development/setup.md)
