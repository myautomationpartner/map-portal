# MAP Pulse Mobile Design QA

- Source visual truth: `/Users/kennymonico/.codex/generated_images/019f5c30-2be0-7783-8de8-46b192e1f273/exec-4f733e57-f663-48b0-ab6c-cf39720fe9b3.png`
- Implementation screenshots:
  - `/Users/kennymonico/.codex/visualizations/2026/07/13/019f5c30-2be0-7783-8de8-46b192e1f273/map-pulse-qa/post-mobile.png`
  - `/Users/kennymonico/.codex/visualizations/2026/07/13/019f5c30-2be0-7783-8de8-46b192e1f273/map-pulse-qa/inbox-mobile.png`
  - `/Users/kennymonico/.codex/visualizations/2026/07/13/019f5c30-2be0-7783-8de8-46b192e1f273/map-pulse-qa/scheduled-mobile.png`
- Viewport: 390 x 844 CSS pixels
- Theme: MAP mobile rollout rendered from the saved `map-dark` portal preference with the new light MAP Pulse workspace override
- State: authenticated MAP customer portal; Post and Scheduled show their live empty states, while Inbox uses the existing launch-asset demo conversation to validate populated message and suggested-reply behavior

## Full-view comparison evidence

The source and implementation were opened together in one visual comparison input. The implementation preserves the selected design's deep ink header, cool light canvas, aqua primary action, lime status signal, white conversational surfaces, MAP avatar treatment, persistent voice composer, and sparse ChatGPT-like vertical rhythm. The requested product refinement intentionally adds a three-button mode switch directly under the brand row.

The source contains a populated post preview while the live MAP screenshot contains no current approval item. That is a content-state difference, not a layout substitution: the implementation presents a compact create-post attachment in the same conversation column and the populated post component retains the source design's media slot, status, platform choices, primary review action, and follow-up message.

No focused crop was required because the full-view source and 390 x 844 implementation screenshots keep the header, mode switch, message typography, action surfaces, and composer controls legible at inspection size. The populated Inbox thread was also opened directly to inspect message bubbles and the suggested-reply panel at full readable size.

## Findings

- No actionable P0, P1, or P2 mismatch remains.
- Fonts and typography: Plus Jakarta Sans with Sora headings provides a close modern sans-serif match, with clear hierarchy and no clipping at 390 px.
- Spacing and layout rhythm: the header, three-mode control, conversation rail, attachments, and fixed composer fit without horizontal overflow or covered primary actions.
- Colors and visual tokens: navy `#071521`, aqua `#00aeb6`, lime `#a9df38`, cool canvas `#f4f7f8`, and white surfaces consistently replace the earlier beige/gold rollout styling.
- Image quality and asset fidelity: the existing MAP raster logo is reused; live post media remains the source for populated post attachments. No placeholder illustration or handcrafted logo was introduced.
- Copy and content: Inbox, Post, and Scheduled are direct and familiar. Review language preserves the explicit customer approval boundary.

## Comparison history

1. Initial browser pass found warm beige/gold theme rules overriding the selected MAP Pulse palette in Post, Inbox, the detailed editor, and suggested replies.
2. The final cascade was corrected so rollout screens remain cool white, navy, aqua, and lime even when the saved portal theme is dark.
3. The second pass found low-contrast message copy and beige outgoing Inbox bubbles. Text contrast and conversation surfaces were corrected to dark text on white and white text on navy.
4. The final pass confirmed the three mode links, populated Inbox list, editable suggested reply, Scheduled empty state, detailed editor, fixed composer, 390 px width, and zero browser console errors.

## Primary interactions tested

- Inbox, Post, and Scheduled top buttons each route to the correct workspace.
- A realistic Inbox conversation opens from the message list.
- `Use and edit` copies the suggested reply into the composer and enables Send without sending the test message.
- Post opens the existing detailed editor while preserving the three-mode header and voice/photo input.
- Scheduled opens its AI-style workspace and routes its empty-state action back to Post.

## Follow-up polish

- P3: capture one future QA screenshot with a real media-backed post and one with a real scheduled post so launch collateral can show the populated attachment states.

final result: passed
