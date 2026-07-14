# MAP Pulse Photo Postcard Design QA

- Source visual truth: `/Users/kennymonico/.codex/generated_images/019f5c30-2be0-7783-8de8-46b192e1f273/exec-4f733e57-f663-48b0-ab6c-cf39720fe9b3.png`
- Operator issue evidence:
  - `/Users/kennymonico/Library/Application Support/CleanShot/media/media_3NThuYm3S5/CleanShot 2026-07-14 at 09.49.40@2x.png`
  - `/Users/kennymonico/Library/Application Support/CleanShot/media/media_DWvMIKVLlB/CleanShot 2026-07-14 at 09.49.50@2x.png`
- Live implementation: `/Users/kennymonico/Documents/MyAutomationPartner/smoke-agent/reports/mobile-my-partner-evidence/smoke_20260714_postcard_native_chooser_v6/03-ai-postcard-with-photo.png`
- Side-by-side comparison: `/Users/kennymonico/Documents/MyAutomationPartner/map-portal/portal-app/design-qa-postcard-comparison.png`
- Production viewport: emulated iPhone 14, 390 x 664 CSS pixels
- State: authenticated MAP Post conversation after selecting one image and asking AI to create a post

## Full-view and focused comparison evidence

The approved concept and live result were normalized to the same inspection height and placed together in one comparison board. The production card preserves the concept's image-first postcard, dark branded status strip, readable caption, compact platform choices, strong aqua review action, and persistent conversational composer. It adds the approved Inbox/Post/Scheduled switcher without obscuring the postcard.

The focused inspection confirms that the selected original image remains the postcard hero, the caption is dark and readable on white, Facebook/Instagram/X fit on one row, and Review & post plus Edit remain available above the composer. The custom attachment menu is gone, leaving one native iOS chooser.

## Findings

- No actionable P0, P1, or P2 mismatch remains.
- Typography: the caption and actions remain legible at phone size with no clipping.
- Spacing: the full postcard fits in 317 x 480 CSS pixels and keeps its primary controls above the composer.
- Colors: deep navy, aqua, lime, cool white, and dark caption text match the approved MAP Pulse system.
- Image quality: the original selected media is used directly; the workflow does not replace it with a placeholder.
- Copy: Ready to review and Review & post preserve the explicit customer approval boundary.

## Comparison history

1. The operator evidence exposed a duplicated attachment choice: a custom three-option menu opened before the iOS native chooser.
2. The custom menu was removed so the plus button invokes one native chooser directly.
3. The first postcard pass still left an older approval card in the conversation and used a tall media treatment. The old content is now hidden for this state and the hero image uses a compact 16:9 crop.
4. Two live QA passes found low-contrast caption text inherited from the legacy dark theme. A scoped postcard override corrected it to `rgb(19, 32, 42)`.
5. Final production run `smoke_20260714_postcard_native_chooser_v6` passed 24/24 with no console, page, or HTTP failures.

## Primary interactions tested

- Plus opens one native file input and no custom stacked chooser.
- A selected image stages beside the typed prompt.
- AI returns the result in the Post conversation as an image-backed postcard.
- Caption editing and Facebook/Instagram/X selection work inside the postcard.
- Nothing publishes until Review & post is selected.
- Review & post hands the same image, caption, and platforms to the detailed Publisher review.
- Voice remains available in the persistent composer.

final result: passed
