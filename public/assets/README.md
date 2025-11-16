# Labyrinth Game Assets

## Folder Structure

### `/sprites/`
**What goes here:** Character sprites, NPCs, items, effects
**File format:** PNG with transparency
**Naming examples:**
- `player_idle.png`
- `player_walk_spritesheet.png`
- `echo_idle.png`
- `item_crystal.png`

### `/scenes/`
**What goes here:** Full background scenes (1536x1024 native for BR01)
**File format:** PNG
**Naming examples:**
- `scene_forest_ruins_01.png`
- `scene_catacomb_entrance.png`
- `scene_starting_area.png`

> BR01 (Mushroom Land) native resolution: **1536×1024**. Keep Phaser scale mode `NONE` and do not stretch the background—render it at native size and center the canvas.

### `/tilesets/`
**What goes here:** Tilemap sheets for level building
**File format:** PNG
**Naming examples:**
- `tileset_dungeon_stone.png`
- `tileset_forest_ground.png`

### `/ui/`
**What goes here:** UI elements, buttons, menus, HUD
**File format:** PNG with transparency
**Naming examples:**
- `ui_button_default.png`
- `ui_button_hover.png`
- `ui_healthbar.png`

## MVP Priority Assets

For the MVP, focus on:
1. **Player sprite** → `/sprites/player_idle.png` (start simple, can upgrade later)
2. **Starting scene** → `/scenes/scene_starting_area.png` (your first explorable zone)
3. **Basic tileset** (if using tilemaps) → `/tilesets/tileset_ground.png`

## Color Palette Reference

Stick to these colors for consistency:
- **Magenta:** #BC4A9B (glows, highlights)
- **Soft Pink:** #EB8D9C (ambient warmth)
- **Deep Teal:** #0C7475 (shadows, cool areas)
- **Cool Blue:** #2668C2 (moonlight, magic)
- **Warm Green:** #76FFD6 (bioluminescence)
- **Dark Base:** #2D4A54, #3A2B3B (backgrounds)

## Asset Checklist

Before adding an asset:
- [ ] Is it a PNG file?
- [ ] Does it use the color palette?
- [ ] Is it the right resolution? (sprites: pixel art, scenes: 1920x1080)
- [ ] Does the filename follow naming convention?
- [ ] Does it have transparency where needed?

## Next Steps

1. Create your player sprite on iPad
2. Export as PNG
3. Put it in `/sprites/`
4. Update `game.js` to load and display it
5. Test in browser!
