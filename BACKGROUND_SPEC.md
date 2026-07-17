# Codex Doll Skin Background Specification

## Canvas

- Preferred master size: `3072x2048` (3:2 landscape).
- Minimum production size: `1536x1024`.
- Color space: sRGB.
- Delivery: WebP quality 88-92, or PNG/JPEG for user-selected images.
- Do not render interface controls, readable text, logos, watermarks, frames, or fake windows into the image.

## Composition Zones

Use percentages so the artwork survives different Codex window sizes.

| Zone | Bounds | Requirement |
| --- | --- | --- |
| Left navigation safety | x `0-20%`, y `0-100%` | Low detail, even brightness, no face or high-contrast edges. |
| Main reading safety | x `20-73%`, y `0-72%` | Calm background with low spatial frequency. Keep text contrast predictable. |
| Above-composer feature zone | x `28-72%`, y `48-78%` | Petals, ribbons, soft light, or distant scenery are allowed. No faces, hands, or important objects. |
| Right character zone | x `73-100%`, y `10-88%` | Place the character here. Keep eyes around x `78-88%`, y `18-35%`. |
| Bottom-right feature zone | x `76-98%`, y `58-94%` | Use seated pose, hands, skirt, bouquet, polaroid, or decorative prop. Avoid important details in the bottom 6%. |
| Composer safety | x `24-76%`, y `82-100%` | Very low detail and low contrast; no face or text. |

## Character Direction

- Original fictional adult, clearly age 21 or older.
- Character faces slightly toward the center of the app.
- Head and eyes remain inside the right character zone.
- Prefer seated or three-quarter poses that use the bottom-right area.
- Hands should be visible and anatomically coherent when included.
- Avoid placing the face behind Codex's right environment panel.

## Rich Detail System

The background should be readable, not empty. Build richness with three depth layers:

- Foreground: one cropped cherry branch entering from a top corner, a few sharp petals, and one small ribbon or flower cluster near the bottom-right edge.
- Midground: the character, a flower bouquet or picnic basket, and one or two blank polaroid prints tilted in the bottom-right feature zone.
- Distance: rows of cherry trees, soft park railings, pale sky, and circular sunlight highlights. Keep this layer defocused.

Use decorative density by zone:

- x `20-55%`, y `10-42%`: sparse branch silhouettes and translucent petals; keep total contrast low.
- x `28-72%`, y `48-78%`: a curved trail of 8-14 small petals, one thin satin ribbon, and soft light flecks. These elements should frame the open space instead of filling it.
- x `76-98%`, y `58-94%`: richer still-life detail such as bouquet, lace picnic cloth, camera, blank polaroids, small gift box, or ribbon. Use no more than three prop families.
- Keep every decoration smaller than the character's face. Large decorative badges and fake UI cards are prohibited.

Balance rule: the image should still look intentional when Codex covers the center with four task cards. Important decorative details should remain visible around the cards, not behind them.

## Prompt Template

```text
Create a premium 3:2 desktop application background. [SUBJECT AND STYLE].
Place the original fictional adult character on the far right 27 percent,
facing slightly toward the center. Use a seated three-quarter pose so the
lower body or decorative prop fills the bottom-right area. Keep the left
55 percent bright, calm, and low-detail for navigation and readable content.
Keep the center-lower composer area uncluttered. Add subtle decorative detail
only in the open area above the composer. No interface, no cards, no buttons,
no readable text, no logos, no watermark, no duplicate person.
```

## Rich Sakura Prompt

```text
Create a premium, richly layered 3:2 desktop application background for an AI
coding workspace. Show an original fictional East Asian adult woman, age 25,
seated entirely within the far-right 25 percent of the canvas and facing gently
toward the center. She has shoulder-length softly curled dark-brown hair, airy
bangs, warm expressive eyes, a clean white medical mask, a white collared
blouse, dusty-pink plaid ribbon bow, blush knitted cardigan, and matching plaid
skirt. Keep both eyes between x 82-91 percent and y 20-34 percent.

Build a romantic spring cherry-blossom park with three depth layers. In the
foreground, frame the top edge with one elegant flowering branch and a few
sharp drifting petals. In the midground, place a pale flower bouquet, a small
vintage camera, two blank tilted polaroid prints, a lace picnic cloth, and a
soft satin ribbon in the bottom-right feature zone. In the distance, show
defocused rows of sakura trees, a park railing, luminous sky, and gentle round
sunlight highlights.

Keep the left 55 percent bright and low-detail for readable Codex content, but
not blank: add faint branch shadows, translucent petal silhouettes, and subtle
pearl-like light flecks. In the open zone above the composer, create a graceful
curved trail of 8-14 small petals and one thin flowing ribbon, with low contrast
and no important object. Keep the center-bottom composer zone calm and pale.

Soft blush pink, ivory, dusty rose, and restrained lavender palette; premium
Japanese editorial photography; refined, airy, realistic, high detail on the
character and props, softer detail elsewhere. No interface, no cards, no
buttons, no readable text, no letters, no logos, no watermark, no decorative
badge, no duplicate person, no childlike appearance, no malformed hands.
```

## Acceptance Checks

- At `1440x900`, the face is not under the main task cards or composer.
- At `1024x768`, losing the far-right 10% does not crop both eyes.
- Text remains readable with a 50-80% light surface overlay.
- The image contains no generated writing.
- Character anatomy and mask/eyewear edges are coherent.
- The pet/avatar overlay receives no background skin.
