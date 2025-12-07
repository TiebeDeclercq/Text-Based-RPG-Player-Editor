// The engine logic
const storyTextElement = document.getElementById('story-text');
const choicesElement = document.getElementById('choices');
const locationElement = document.getElementById('location');
const timeElement = document.getElementById('time');
const playerNameElement = document.getElementById('player-name');
const sceneImageContainer = document.getElementById('scene-image-container');
const sceneImageElement = document.getElementById('scene-image');
const inputArea = document.getElementById('input-area');
const playerInput = document.getElementById('player-input');
const confirmInputBtn = document.getElementById('confirm-input-btn');

// Inventory UI
const inventoryListElement = document.getElementById('inventory-list');
const persistentInventory = document.getElementById('persistent-inventory');

// Constants
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// Audio System
const SoundManager = {
    ctx: null,
    init: function() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
    },
    playBeep: function(freq = 440, type = 'sine') {
        try {
            if (!this.ctx) this.init();
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
            gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start();
            osc.stop(this.ctx.currentTime + 0.1);
        } catch (e) {
            console.warn("Audio error:", e);
        }
    }
};

let storyData = null; // Loaded from JSON
let currentChoiceIndex = -1;
let isDead = false;

let gameState = {
    currentScene: 'start_selection',
    inventory: [],
    flags: {},
    dayIndex: 0, // 0 = Monday
    timeMinutes: 480, // 08:00
    playerName: "Player",
    characterId: 'custom',
};

// Typewriter settings
let typingInterval;
const typingSpeed = 10;

// --- LOGIC INTERPRETER ---

function checkCondition(condition) {
    if (!condition) return true;

    // Composite
    if (condition.type === 'AND' && condition.conditions) {
        return condition.conditions.every(c => checkCondition(c));
    }
    if (condition.type === 'OR' && condition.conditions) {
        return condition.conditions.some(c => checkCondition(c));
    }
    if (condition.type === 'NOT') {
        return !checkCondition(condition.condition);
    }

    // Primitives
    if (condition.type === 'HAS_FLAG') {
        // If value is explicitly false, we check if flag is falsy/missing
        const targetValue = condition.value !== undefined ? condition.value : true;
        return !!gameState.flags[condition.flag] === targetValue;
    }
    if (condition.type === 'HAS_ITEM') {
        return gameState.inventory.includes(condition.item);
    }

    // Default fallback
    return true;
}

function executeEffects(effects) {
    if (!effects || !Array.isArray(effects)) return;

    effects.forEach(eff => {
        switch (eff.type) {
            case 'SET_FLAG':
                gameState.flags[eff.flag] = eff.value !== undefined ? eff.value : true;
                break;
            case 'ADD_ITEM':
                gameState.inventory.push(eff.item);
                renderInventoryList();
                break;
            case 'REMOVE_ITEM':
                gameState.inventory = gameState.inventory.filter(i => i !== eff.item);
                renderInventoryList();
                break;
            case 'SET_VALUE':
                // Safe property setting (whitelist approach or direct)
                if (['dayIndex', 'timeMinutes', 'playerName'].includes(eff.property)) {
                    gameState[eff.property] = eff.value;
                }
                break;
            case 'RESTART':
                location.reload();
                break;
        }
    });
}

function resolveText(textEntry) {
    if (!textEntry) return "";
    if (typeof textEntry === 'string') return parseText(textEntry);
    
    if (Array.isArray(textEntry)) {
        for (const t of textEntry) {
            if (!t.condition || checkCondition(t.condition)) {
                return parseText(t.content);
            }
        }
    }
    return "";
}

// --- GAME ENGINE ---

async function initGame() {
    try {
        const savedStory = localStorage.getItem('survival_rpg_story');
        if (savedStory) {
            const json = JSON.parse(savedStory);
            storyData = json.nodes;
            gameState.currentScene = json.startNode || 'start_selection';

            // Set dynamic title
            if (json.title) {
                document.title = json.title;
                const headerH1 = document.querySelector('header h1');
                if(headerH1) headerH1.innerText = json.title;
            }

            startGame();
        } else {
            showNoStoryUI();
        }
    } catch (e) {
        console.error("Error loading story from storage:", e);
        showNoStoryUI();
    }
}

function showNoStoryUI() {
    // Hide game elements
    sceneImageContainer.classList.add('hidden');
    inputArea.classList.add('hidden');
    choicesElement.innerHTML = '';
    storyTextElement.classList.remove('hidden');
    
    // Clear and set story text
    storyTextElement.innerHTML = `
        <div style="text-align: center; margin-top: 50px;">
            <h1 style="color: #666;">No Story Selected</h1>
            <p>Please import a story file to begin playing.</p>
            <div style="display: flex; gap: 10px; justify-content: center; margin-top:20px;">
                <button id="main-import-btn" class="choice-btn">Import File</button>
            </div>
        </div>
    `;

    // Bind events
    const importBtn = document.getElementById('main-import-btn');
    if (importBtn) {
        importBtn.onclick = () => {
            document.getElementById('import-story-input').click();
        };
    }
        
    // Reset stats to indicate no story
    playerNameElement.innerText = "Player";
    locationElement.innerText = "-";
    timeElement.innerText = "--:--";
}

function startGame() {
    // Ensure flags initialized (safety check)
    if (!gameState.flags) gameState.flags = {};

    updateStatsUI();
    renderScene(gameState.currentScene);
}

function getDayName() {
    return DAYS[gameState.dayIndex] || "Weekend";
}

function getTimeString() {
    const h = Math.floor(gameState.timeMinutes / 60) % 24;
    const m = gameState.timeMinutes % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

function advanceTime(minutes) {
    gameState.timeMinutes += minutes;
    updateStatsUI();
}

function updateStatsUI() {
    timeElement.innerText = `${getDayName().substr(0, 2)} ${getTimeString()}`;
    playerNameElement.innerText = gameState.playerName;
}

function renderScene(sceneId) {
    const scene = storyData[sceneId];

    if (!scene) {
        storyTextElement.innerText = `Error: Scene '${sceneId}' not found.`;
        return;
    }

    // --- LOGIC NODE HANDLING ---
    if (scene.type === 'logic') {
        if (checkCondition(scene.condition)) {
            renderScene(scene.nextTrue);
        } else {
            renderScene(scene.nextFalse);
        }
        return;
    }

    // --- DEATH NODE HANDLING ---
    if (scene.type === 'death') {
        renderDeath(scene.deathMessage || "You died.");
        return;
    }

    // --- WIN NODE HANDLING ---
    if (scene.type === 'win') {
        renderWin(scene.winMessage || "You won!");
        return;
    }

    gameState.currentScene = sceneId;
    choicesElement.innerHTML = ''; 

    // Handle Time Set (Waking up, etc)
    if (scene.timeSet !== undefined) {
        gameState.timeMinutes = scene.timeSet;
    }

    // Execute "onEnter" effects if they exist in JSON (not currently in schema but good to have)
    if (scene.effects) {
        executeEffects(scene.effects);
    }
    
    updateStatsUI();

    // Update Location Display
    if (scene.location) locationElement.innerText = scene.location;

    // Update Image
    if (scene.image) {
        sceneImageElement.src = scene.image;
        sceneImageContainer.classList.remove('hidden');
    } else {
        sceneImageContainer.classList.add('hidden');
    }

    // Reset Navigation
    currentChoiceIndex = -1;
    isDead = false;

    // Render Text
    clearInterval(typingInterval);
    storyTextElement.innerHTML = '';

    if (scene.type === 'input') {
        renderInputScene(scene);
    } else {
        inputArea.classList.add('hidden');
        const textToRender = resolveText(scene.text);
        
        typeText(textToRender, () => {
             renderChoices(scene);
        });
    }
}

function typeText(text, callback) {
    let html = text;
    let index = 0;
    let currentText = "";
    let insideTag = false;

    typingInterval = setInterval(() => {
        if (index >= html.length) {
            clearInterval(typingInterval);
            if(callback) callback();
            return;
        }
        let char = html[index];
        if (char === '<') insideTag = true;
        currentText += char;
        if (char === '>') insideTag = false;
        if (!insideTag) storyTextElement.innerHTML = currentText;
        index++;
        while (insideTag && index < html.length) {
            char = html[index];
            currentText += char;
            index++;
            if (char === '>') {
                insideTag = false;
                storyTextElement.innerHTML = currentText;
            }
        }
    }, typingSpeed);

    storyTextElement.onclick = () => {
        clearInterval(typingInterval);
        storyTextElement.innerHTML = html;
        if(callback) callback();
        storyTextElement.onclick = null;
    };
}

function renderChoices(scene) {
    choicesElement.innerHTML = '';
    
    if (scene.choices && scene.choices.length > 0) {
        scene.choices.forEach(choice => {
            if (choice.condition && !checkCondition(choice.condition)) return;

            const button = document.createElement('button');
            button.innerText = parseText(choice.text);
            button.classList.add('choice-btn');
            button.addEventListener('click', () => handleChoice(choice));
            choicesElement.appendChild(button);
        });
        return;
    }

    if (scene.next) {
        const button = document.createElement('button');
        button.innerText = "Continue...";
        button.classList.add('choice-btn');
        // Handle direct next (convert to simple choice object)
        button.addEventListener('click', () => handleChoice({ next: scene.next }));
        choicesElement.appendChild(button);
    }
}

function renderInputScene(scene) {
    inputArea.classList.remove('hidden');
    choicesElement.innerHTML = '';
    playerInput.value = ''; // Clear previous input

    const textToRender = resolveText(scene.text);

    typeText(textToRender, () => {
        playerInput.focus();
    });

    const handleInputConfirm = () => {
        const val = playerInput.value.trim();
        if (val) {
            // Clear listener to be safe
            playerInput.onkeydown = null;
            confirmInputBtn.onclick = null;

            if (scene.variable) {
                if (scene.variable.startsWith('flags.')) {
                    const flagName = scene.variable.split('.')[1];
                    gameState.flags[flagName] = val;
                } else {
                    // Assume it's a direct property on gameState if not flags
                    gameState[scene.variable] = val;
                }
            } else {
                // Default legacy behavior
                gameState.playerName = val;
            }
            SoundManager.playBeep(600, 'square');
            handleChoice({ next: scene.next });
        }
    };

    confirmInputBtn.onclick = handleInputConfirm;
    
    // Use onkeydown to avoid stacking listeners
    playerInput.onkeydown = (e) => {
        if (e.key === 'Enter') {
            handleInputConfirm();
        }
    };
}

function handleChoice(choice) {
    // Execute logic effects
    if (choice.effects) {
        executeEffects(choice.effects);
    }

    // Legacy support for single item/timeCost in choice object if converted poorly
    if (choice.timeCost) advanceTime(choice.timeCost);

    let nextSceneId = choice.next;

    if (nextSceneId === 'death') {
        renderDeath(choice.deathMessage || "You died.");
        return;
    }

    if (nextSceneId === 'win') {
        renderWin(choice.winMessage || "You won!");
        return;
    }

    if (nextSceneId) {
        renderScene(nextSceneId);
    }
}

function renderDeath(message) {
    updateStatsUI();

    isDead = true;
    currentChoiceIndex = -1;

    clearInterval(typingInterval);
    sceneImageContainer.classList.add('hidden');
    inputArea.classList.add('hidden');
    
    // Ensure story text container is visible and cleared of previous content
    storyTextElement.classList.remove('hidden');

    storyTextElement.innerHTML = `
        <div style="text-align: center; margin-top: 50px;">
            <h1 style="color: #ff0000; font-size: 3rem;">GAME OVER</h1>
            <p style="font-size: 1.2rem;">${parseText(message)}</p>
            <p style="font-size: 0.8rem; color: #666; margin-top: 20px;">Press 'R' to restart</p>
        </div>
    `;
    choicesElement.innerHTML = '';
    const button = document.createElement('button');
    button.innerText = "Restart Day (R)";
    button.classList.add('choice-btn');
    button.style.color = "red";
    button.addEventListener('click', () => location.reload()); 
    choicesElement.appendChild(button);
}

function renderWin(message) {
    updateStatsUI();

    isDead = true; // Use dead state to block normal interactions
    currentChoiceIndex = -1;

    clearInterval(typingInterval);
    sceneImageContainer.classList.add('hidden');
    inputArea.classList.add('hidden');

    storyTextElement.classList.remove('hidden');

    storyTextElement.innerHTML = `
        <div style="text-align: center; margin-top: 50px;">
            <h1 style="color: #4caf50; font-size: 3rem;">YOU WIN!</h1>
            <p style="font-size: 1.2rem;">${parseText(message)}</p>
            <p style="font-size: 0.8rem; color: #666; margin-top: 20px;">Thanks for playing!</p>
        </div>
    `;
    choicesElement.innerHTML = '';
    const button = document.createElement('button');
    button.innerText = "Play Again (R)";
    button.classList.add('choice-btn');
    button.style.color = "#4caf50";
    button.addEventListener('click', () => location.reload());
    choicesElement.appendChild(button);
}

function renderInventoryList() {
    if (gameState.inventory.length === 0) {
        inventoryListElement.innerText = '- Empty -';
        return;
    }
    inventoryListElement.innerText = gameState.inventory.join(', ');
}

function parseText(text) {
    let parsed = text.replace(/{player}/g, gameState.playerName);
    
    // Replace {flags.something}
    parsed = parsed.replace(/{flags\.(\w+)}/g, (match, flagName) => {
        return gameState.flags[flagName] || "onbekend";
    });

    // Replace {time} with formatted time
    parsed = parsed.replace(/{time}/g, getTimeString());

    // Replace {gameStateProperty}
    parsed = parsed.replace(/{(\w+)}/g, (match, propName) => {
        if (gameState.hasOwnProperty(propName)) {
            return gameState[propName];
        }
        return match; // return original if not found
    });

    return parsed;
}

function updateChoiceSelection(buttons) {
    buttons.forEach((btn, idx) => {
        if (idx === currentChoiceIndex) {
            btn.classList.add('selected');
        } else {
            btn.classList.remove('selected');
        }
    });
}

function flashInventory() {
    if (!persistentInventory) return;
    persistentInventory.style.transition = 'background-color 0.1s';
    persistentInventory.style.backgroundColor = '#4caf50';
    setTimeout(() => {
        persistentInventory.style.transition = 'background-color 0.5s';
        persistentInventory.style.backgroundColor = '#252525';
    }, 100);
}

// Global Keydown Listener
document.addEventListener('keydown', (e) => {
    // Initialize audio context on first user interaction
    if (SoundManager.ctx && SoundManager.ctx.state === 'suspended') {
        SoundManager.ctx.resume();
    }

    // 1. Restart on Death
    if (isDead && e.key.toLowerCase() === 'r') {
        location.reload();
        return;
    }

    // 2. Inventory Shortcut
    if (e.key.toLowerCase() === 'i') {
        flashInventory();
        return;
    }

    // 3. Navigation
    const buttons = choicesElement.querySelectorAll('button');
    if (buttons.length === 0) return;

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        document.body.classList.add('keyboard-mode');
        currentChoiceIndex++;
        if (currentChoiceIndex >= buttons.length) currentChoiceIndex = 0;
        updateChoiceSelection(buttons);
        SoundManager.playBeep(200, 'triangle');
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        document.body.classList.add('keyboard-mode');
        currentChoiceIndex--;
        if (currentChoiceIndex < 0) currentChoiceIndex = buttons.length - 1;
        updateChoiceSelection(buttons);
        SoundManager.playBeep(200, 'triangle');
    } else if (e.key === 'Enter') {
        e.preventDefault();
        if (currentChoiceIndex >= 0 && currentChoiceIndex < buttons.length) {
            SoundManager.playBeep(600, 'square'); 
            buttons[currentChoiceIndex].click();
        }
    }
});

document.addEventListener('mousemove', () => {
    document.body.classList.remove('keyboard-mode');
});

// Import Story
const importInput = document.getElementById('import-story-input');
if (importInput) {
    importInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.size > 5 * 1024 * 1024) {
             alert("Warning: File size exceeds 5MB. LocalStorage might fail to save this story.");
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const jsonString = event.target.result;
                const json = JSON.parse(jsonString);

                if (json.nodes && json.startNode) {
                    // Save to LocalStorage
                    try {
                        localStorage.setItem('survival_rpg_story', jsonString);
                    } catch (storageErr) {
                        alert("Error saving to LocalStorage (file might be too big): " + storageErr);
                    }

                    location.reload();
                } else {
                    alert("Invalid Story JSON format.");
                }
            } catch (err) {
                alert("Error parsing JSON: " + err);
                console.error(err);
            }
        };
        reader.readAsText(file);
        importInput.value = ''; // Reset
    });
}

// Start the game
window.onload = initGame;
