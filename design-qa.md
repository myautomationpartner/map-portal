# MAP Pulse Photo Postcard Design QA

- Source visual truth: `/Users/kennymonico/.codex/generated_images/019f5c30-2be0-7783-8de8-46b192e1f273/exec-4f733e57-f663-48b0-ab6c-cf39720fe9b3.png`
- Operator issue evidence:
  - `/Users/kennymonico/Library/Application Support/CleanShot/media/media_3NThuYm3S5/CleanShot 2026-07-14 at 09.49.40@2x.png`
  - `/Users/kennymonico/Library/Application Support/CleanShot/media/media_DWvMIKVLlB/CleanShot 2026-07-14 at 09.49.50@2x.png`
- Live implementation: `/Users/kennymonico/Documents/MyAutomationPartner/smoke-agent/reports/mobile-my-partner-evidence/smoke_20260714_postcard_native_chooser_v6/03-ai-postcard-with-photo.png`
- Physical iPhone evidence: `/Users/kennymonico/Documents/MyAutomationPartner/map-portal/portal-app/physical-iphone-photo-postcard-2026-07-14.png`
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
6. Physical-iPhone acceptance then staged an operator-selected photo with a typed prompt and returned the correct original-image postcard in the installed MAP app. The caption, Facebook/Instagram/X controls, Edit, and Review & post rendered above the persistent composer. Nothing was published.

## Primary interactions tested

- Plus opens one native file input and no custom stacked chooser.
- A selected image stages beside the typed prompt.
- AI returns the result in the Post conversation as an image-backed postcard.
- Caption editing and Facebook/Instagram/X selection work inside the postcard.
- Nothing publishes until Review & post is selected.
- Review & post hands the same image, caption, and platforms to the detailed Publisher review.
- Voice remains available in the persistent composer.

final result: passed

# Natural-Language Image Editing and Visible Logo QA

- Physical iPhone logo result: `/Users/kennymonico/Documents/MyAutomationPartner/map-portal/portal-app/physical-iphone-visible-map-logo-2026-07-14.png`
- Physical iPhone non-logo result: `/Users/kennymonico/Documents/MyAutomationPartner/map-portal/portal-app/physical-iphone-general-image-edit-2026-07-14.png`
- Live Worker: `map-shared-portal@92e62c5b-6d93-431b-b598-87e9217f8902`
- Rollback Worker: `map-shared-portal@4b20c18d-73f5-48da-b692-a941f46d1f5e`
- State: installed MAP phone app with a real selected photo, generated caption, and Facebook/Instagram/X review controls

## Result

The post editor now treats the AI decision as the primary natural-language plan while retaining deterministic safety cues for direct visual and caption requests. This preserves open-ended requests instead of reducing the product to a fixed button or command list. Brand-logo language additionally resolves the tenant's verified saved logo and stamps it inside the visible 16:9 postcard crop so the exact mark cannot be omitted or hidden by the image model.

The physical iPhone passed two independent edits. `Add map logo to image` returned the original photo with a large readable MAP mark on a dark, lime-outlined badge. `Make the image black and white` returned a visibly monochrome version and preserved the same caption, platforms, and review boundary. The first `Brighten the image` result was correctly rejected as too subtle; the live flow now retries once from the original image using the verifier's feedback and medium-quality rendering before asking the customer to try again.

## Validation

- 14/14 focused natural-language, attachment, and mobile rollout tests passed.
- Portal lint passed.
- Production build passed.
- Existing shared portal Worker and routes were updated in place; no parallel infrastructure was created.
- No schema, migration, RLS, Auth, Storage, Edge Function, provider connection, or automation change was required.
- Nothing was published, scheduled, or sent to a customer during phone QA.

final result: passed

# Text-only Promotional Request Routing QA

- Source visual truth: `/tmp/codex-remote-attachments/019f5c30-2be0-7783-8de8-46b192e1f273/A7AA138A-7B3D-4E3F-9B33-C5D03B8A734E/1-Pasted-Image-1.jpg`
- Implementation screenshot: `/Users/kennymonico/Documents/MyAutomationPartner/smoke-agent/reports/mobile-my-partner-evidence/smoke_20260714_text_only_promo_fix/07-promotional-designer.png`
- Physical iPhone result: `/Users/kennymonico/Documents/MyAutomationPartner/map-portal/portal-app/physical-iphone-text-only-promo-2026-07-14.png`
- Full-view comparison: `/Users/kennymonico/Documents/MyAutomationPartner/map-portal/portal-app/design-qa-artifacts/text-only-promo-route-comparison.png`
- Viewport: 390 x 664 CSS pixels in the live production portal
- State: promotional request sent without an attached photo

## Findings

- The source screenshot showed a P0 routing failure: a clear promotional-graphic request fell through to the legacy support menu and returned unrelated guided buttons.
- The corrected production state routes the same class of text-only request into the promotional designer, generates a supporting background through the existing image generator, adds exact structured copy and the verified saved business logo, and returns the 4:5 draft inside the conversation.
- The live card retains the Post composer, Facebook/Instagram/X review controls, and explicit approval boundary. Nothing publishes automatically.
- Typography: the headline, event timing, prices, CTA, and review state are legible at phone size with no clipping or low-contrast legacy response card.
- Spacing: the full 4:5 design fits the conversation width and keeps the persistent composer reachable.
- Colors: the existing navy, aqua, lime, and white MAP tokens remain unchanged.
- Image quality: the generated background is a real image asset from the existing authenticated image-generation service; exact text and logo are applied afterward so factual details are not left to image-model spelling.
- Copy: the comparison uses different smoke content from the operator's Pool Opening prompt, but it exercises the same no-attachment promotional route and exact-field rendering state.
- Focused-region comparison was not needed because the route failure and corrected complete-card state are both fully visible in the normalized full-view comparison.

## Comparison history

1. The operator's physical-phone screenshot showed the promo prompt followed by the old low-contrast support/action card.
2. The routing condition was moved ahead of the general Partner-help fallback and no longer depends on a pending attachment.
3. When no photo is attached, the existing `portal-generate-image` service now creates a background-only source; attached photos still take priority when present.
4. Live production run `smoke_20260714_text_only_promo_fix` passed 32/32 with `blockDeploy=false`, including the general image editor, text-only promotional generation, natural-language promo revision, Publisher review revision, and no console/page/HTTP errors.
5. The installed MAP app was then fully closed and reopened through iPhone Mirroring. The operator manually entered the exact Pool Opening request, and the physical iPhone returned the corrected 4:5 promotional draft with `July 18 at 10 AM`, `Water test $25`, `Pool opening $199`, `Weekly care $89`, `Book today`, the MAP identity, Facebook/Instagram/X controls, Edit, and Review & post. Nothing was published or scheduled.

final result: passed

# MAP Conversational Promotional Graphic Designer QA

- Source visual truth: `/Users/kennymonico/Library/Application Support/CleanShot/media/media_Ws91FsGMiN/CleanShot 2026-07-14 at 12.36.28@2x.png`
- Side-by-side comparison: `/Users/kennymonico/Documents/MyAutomationPartner/map-portal/portal-app/design-qa-artifacts/promo-reference-comparison.png`
- Live designer evidence: `/Users/kennymonico/Documents/MyAutomationPartner/smoke-agent/reports/mobile-my-partner-evidence/smoke_20260714_promotional_designer_v3/07-promotional-designer.png`
- Live conversational revision evidence: `/Users/kennymonico/Documents/MyAutomationPartner/smoke-agent/reports/mobile-my-partner-evidence/smoke_20260714_promotional_designer_v3/08-promotional-revision.png`
- Live Publisher review revision evidence: `/Users/kennymonico/Documents/MyAutomationPartner/smoke-agent/reports/mobile-my-partner-evidence/smoke_20260714_promotional_designer_v3/09-promotional-review-revision.png`
- Existing image-editor evidence: `/Users/kennymonico/Documents/MyAutomationPartner/smoke-agent/reports/mobile-my-partner-evidence/smoke_20260714_promotional_designer_v3/04-verified-logo-image-edit.png`
- Physical iPhone image-editor evidence: `/Users/kennymonico/Documents/MyAutomationPartner/map-portal/portal-app/physical-iphone-conversational-logo-edit-2026-07-14.png`
- Production viewport: 390 x 664 CSS pixels

## Result

The production result keeps the reference post's useful visual hierarchy—large event headline, clear date/time, three prominent offer cards, bold prices, business identity, and a strong call to action—while using MAP's cleaner navy, aqua, lime, and white system. The generated graphic is a true 1080 x 1350 social asset, not a screenshot of the chat card. The entire 4:5 design remains visible in both Post and Publisher review.

## Findings

- No actionable P0, P1, or P2 design mismatch remains.
- Exact customer facts, including prices, names, dates, and times, are preserved in the structured brief and rendered deterministically.
- The saved business logo is applied through the existing verified logo path; no guessed logo or duplicate image backend was introduced.
- The uploaded photo remains the background/hero source, with readable contrast overlays and phone-safe text hierarchy.
- Natural-language revisions rebuild the same source design, including price, headline, date, color, and call-to-action changes.
- Review & post keeps the conversational composer available so the customer can ask for more changes before posting or scheduling.
- The existing general photo editor still supports natural-language edits such as adding the verified MAP logo.
- Physical-iPhone evidence confirms that the general editor returned the edited photo with the MAP identity visible, kept the caption and platform controls intact, and still required Review & post.

## QA history

1. The first promotional pass used the previous 16:9 postcard crop and hid the lower part of the 4:5 graphic.
2. The postcard and Publisher review were corrected to show the full promotional asset without cropping.
3. Run `smoke_20260714_promotional_designer_v2` recorded a transient aborted `portal-ai-assist` request and correctly set `blockDeploy=true`.
4. The immediate clean rerun `smoke_20260714_promotional_designer_v3` passed 32/32 with `blockDeploy=false` and no console, page, or HTTP errors.
5. Physical iPhone Mirroring verified the single native attachment chooser and return-to-composer path. Mirroring automation could not reliably synthesize a multi-line prompt, so the complete generation and both editor paths were exercised against the same live production build at the 390-pixel phone width.
6. Nothing was published, scheduled, or sent to a customer.

final result: passed
