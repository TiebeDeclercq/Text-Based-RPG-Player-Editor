# Text Based RPG Player & Editor

A simpel web-based engine for playing and creating interactive text-based RPG stories with a visual node editor.

## Features

*   **Choice-Based Narrative:** Player decisions shape the story
*   **Dynamic Systems:** Inventory, time management, flags (variables), and conditions
*   **Visual Node Editor:** Drag-and-drop interface to build complex branching narratives
*   **Logic System:** Conditional branching, variable checks, and dynamic text
*   **Custom Stories:** Import/export JSON story files
*   **Multiple Node Types:** Story nodes, input nodes, logic gates, death/win endings
*   **Rich Content:** Support for images, HTML formatting, and dynamic text substitution

## How to Play

Since the game uses modern web features (ES6 modules, Fetch API), it requires a local server:

1.  **Clone the repository**
2.  **Start a local server:**
    *   **Python:** `python3 -m http.server`
    *   **Node/NPM:** `npx http-server`
    *   **VS Code:** Use the "Live Server" extension
3.  **Open `index.html`** in your browser (e.g., `http://localhost:8000`)

### Controls
*   **Mouse:** Click choices to progress
*   **Keyboard:**
    *   **Arrow Up/Down:** Navigate choices
    *   **Enter:** Select choice
    *   **I:** Toggle Inventory
    *   **R:** Restart (if game over)
*   **Import Story:** Click "Import Story" to load custom `.json` files

## Story Editor

Open `editor.html` to access the visual story builder.

### Node Types
*   **Story Node (Green):** Standard text and choices
*   **Input Node (Blue):** Capture player text input (saved to variables)
*   **Logic Node (Purple):** Branch based on conditions (IF/THEN logic)
*   **Death Node (Red):** Game over ending
*   **Win Node (Dark Green):** Victory ending

### Features
*   **Effects System:** Set flags, add/remove items, modify stats
*   **Conditions:** Check inventory, flags, or combine with AND/OR/NOT
*   **Dynamic Text:** Use `{player}`, `{time}`, in text
*   **Time Management:** Set specific times or track progression
*   **Location Tracking:** Display current scene location
*   **Images:** Add scene images via URL

### Shortcuts
*   **Ctrl + C/V:** Copy/Paste nodes
*   **Ctrl + Z/Y:** Undo/Redo
*   **Delete:** Remove selected node/connection
*   **Mouse Wheel:** Zoom
*   **Right Click + Drag:** Pan canvas
*   **Drag from right port → left port:** Connect nodes

## Story JSON Structure

Stories use the following structure:
```json
{
  "title": "Story Title",
  "startNode": "start_node_id",
  "nodes": {
    "node_id": {
      "id": "node_id",
      "type": "choice|input|logic|death|win",
      "text": "Display text with {player} and {flags.varName}",
      "location": "Scene Location",
      "image": "https://url-to-image.jpg",
      "timeSet": 480,
      "choices": [
        {
          "text": "Choice text",
          "next": "target_node_id",
          "condition": { "type": "HAS_ITEM", "item": "Key" },
          "effects": [
            { "type": "SET_FLAG", "flag": "metNPC", "value": true },
            { "type": "ADD_ITEM", "item": "Sword" }
          ]
        }
      ]
    }
  }
}
```

### Node Types Explained

#### Story Node (type: "choice")
Standard node with text and multiple choices.
```json
{
  "type": "choice",
  "text": "You stand at a crossroads.",
  "location": "Forest Path",
  "timeSet": 540,
  "image": "https://example.com/image.jpg",
  "choices": [
    {
      "text": "Go left",
      "next": "left_path",
      "condition": { "type": "HAS_ITEM", "item": "Map" },
      "effects": [
        { "type": "SET_FLAG", "flag": "went_left", "value": true }
      ]
    }
  ]
}
```

#### Input Node (type: "input")
Captures player text input and saves to a variable.
```json
{
  "type": "input",
  "text": "What is your name?",
  "variable": "playerName",
  "next": "next_node_id"
}
```

You can also save to flags:
```json
{
  "variable": "flags.characterName"
}
```

#### Logic Node (type: "logic")
Branches based on a condition (no text displayed).
```json
{
  "type": "logic",
  "condition": { "type": "HAS_ITEM", "item": "Key" },
  "nextTrue": "door_opens",
  "nextFalse": "door_locked"
}
```

#### Death Node (type: "death")
Game over screen.
```json
{
  "type": "death",
  "deathMessage": "You have fallen. Game Over."
}
```

#### Win Node (type: "win")
Victory screen.
```json
{
  "type": "win",
  "winMessage": "Congratulations! You have completed the quest!"
}
```

### Available Effect Types

Effects are executed when a choice is selected:

*   **SET_FLAG:** Set boolean or string flags
```json
    { "type": "SET_FLAG", "flag": "metMerchant", "value": true }
```

*   **ADD_ITEM:** Add to inventory
```json
    { "type": "ADD_ITEM", "item": "Health Potion" }
```

*   **REMOVE_ITEM:** Remove from inventory
```json
    { "type": "REMOVE_ITEM", "item": "Rusty Key" }
```

*   **SET_VALUE:** Modify game state properties (timeMinutes, dayIndex, playerName)
```json
    { "type": "SET_VALUE", "property": "timeMinutes", "value": 720 }
```

*   **RESTART:** Reload the game
```json
    { "type": "RESTART" }
```

### Available Condition Types

Conditions control when choices appear or which path logic nodes take:

*   **HAS_FLAG:** Check if a flag equals a value
```json
    { "type": "HAS_FLAG", "flag": "talkedToGuard", "value": true }
```

*   **HAS_ITEM:** Check if item is in inventory
```json
    { "type": "HAS_ITEM", "item": "Silver Key" }
```

*   **AND:** All sub-conditions must be true
```json
    {
      "type": "AND",
      "conditions": [
        { "type": "HAS_ITEM", "item": "Torch" },
        { "type": "HAS_FLAG", "flag": "nightTime", "value": true }
      ]
    }
```

*   **OR:** At least one sub-condition must be true
```json
    {
      "type": "OR",
      "conditions": [
        { "type": "HAS_ITEM", "item": "Gold Key" },
        { "type": "HAS_ITEM", "item": "Master Key" }
      ]
    }
```

*   **NOT:** Invert a condition
```json
    {
      "type": "NOT",
      "condition": { "type": "HAS_FLAG", "flag": "doorUnlocked" }
    }
```

### Dynamic Text Substitution

Use placeholders in text that get replaced at runtime:

*   `{player}` - Player's name
*   `{time}` - Current time (HH:MM format)
*   `{propertyName}` - Any game state property (playerName, etc.)

Example:
```json
{
  "text": "Welcome, {player}! The time is {time}."
}
```

### Time System

Time is tracked in minutes from midnight (0-1439):
*   `480` = 08:00 (8 AM)
*   `720` = 12:00 (noon)
*   `1320` = 22:00 (10 PM)

Set time using `timeSet` property on any node:
```json
{
  "timeSet": 540
}
```

## Example Story

See `example_story.json` for a comprehensive cyberpunk heist demo featuring:
- Player name input
- Multiple branching paths
- Item collection and usage
- Conditional logic (AND/OR conditions)
- Inventory-based puzzles
- Flag-based story variations
- Multiple endings (success, failure, betrayal)
- Time tracking
- Location display
- Dynamic text substitution

## Creating Your First Story

1. Open `editor.html`
2. Drag a **Story Node** onto the canvas
3. Set it as the start node (it should be named in the JSON as `startNode`)
4. Add text and choices
5. Connect choices to new nodes by dragging from the right port
6. Add conditions and effects to choices as needed
7. Export JSON when done
8. Import into the player to test

## Tips for Story Design

*   **Start Simple:** Begin with linear paths, add branching later
*   **Use Logic Nodes:** Keep story nodes for narrative, logic nodes for IF/THEN checks
*   **Test Frequently:** Import and play-test your story often
*   **Flag Naming:** Use descriptive flag names like `hasMetMerchant` instead of `flag1`
*   **Inventory Items:** Use clear, unique names for items
*   **Validate Connections:** Use the "Inspect" button to find dead ends and unreachable nodes

## Technical Notes

*   Stories are stored in LocalStorage for persistence
*   The editor autosaves to LocalStorage
*   Maximum LocalStorage limit is ~5MB per domain
*   Images must be publicly accessible URLs
*   HTML is supported in text fields (use responsibly)

---