class StoryEditor {
    constructor() {
        this.data = {
            startNode: "start_selection",
            nodes: {}
        };
        // Use Set for multiple selection
        this.selectedNodeIds = new Set();
        this.scale = 1;
        this.panX = 0;
        this.panY = 0;

        // Panning/Node Drag state
        this.isDragging = false;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.draggedNodeId = null; // Still track primary dragged node for calculations

        // Connection State (Drag-and-Drop)
        this.isConnecting = false;
        this.connectSourceId = null;
        this.connectSourceType = 'default'; // 'default' | 'true' | 'false'
        this.mousePos = { x: 0, y: 0 };

        // Selection State (Connection)
        this.selectedConnection = null;

        // Undo/Redo Stacks
        this.undoStack = [];
        this.redoStack = [];

        // UI Refs
        this.canvas = document.getElementById('editor-canvas');
        this.nodesLayer = document.getElementById('nodes-layer');
        this.connectionsLayer = document.getElementById('connections-layer');
        this.sidebarContent = document.getElementById('sidebar-content');
        this.sidebarTitle = document.getElementById('sidebar-title');
        this.deleteBtn = document.getElementById('delete-node-btn');

        // Init
        this.init();
    }

    async init() {
        // Try to load story from LocalStorage first, then fallback to fetch
        let loaded = false;
        try {
            const savedStory = localStorage.getItem('survival_rpg_story');
            if (savedStory) {
                const json = JSON.parse(savedStory);
                if (json.nodes) {
                     this.loadData(json, false);
                     loaded = true;
                }
            }
        } catch (e) {
            console.warn("Error loading from localStorage:", e);
        }

        if (!loaded) {
            try {
                const res = await fetch('story.json');
                if (res.ok) {
                    const json = await res.json();
                    this.loadData(json, false);
                } else {
                    this.addNode('start_selection');
                }
            } catch (e) {
                console.warn("No default story loaded", e);
                this.addNode('start_selection');
            }
        }

        window.addEventListener('resize', () => this.render());
        document.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        document.addEventListener('mouseup', (e) => this.stopDrag(e));

        // Copy/Paste
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
    }

    // --- STATE MANAGEMENT ---

    saveState() {
        const state = JSON.parse(JSON.stringify(this.data));
        this.undoStack.push(state);
        if(this.undoStack.length > 50) this.undoStack.shift();
        this.redoStack = [];
    }

    undo() {
        if (this.undoStack.length === 0) return;
        const currentState = JSON.parse(JSON.stringify(this.data));
        this.redoStack.push(currentState);
        const prevState = this.undoStack.pop();
        this.loadData(prevState, false);
    }

    redo() {
        if (this.redoStack.length === 0) return;
        const currentState = JSON.parse(JSON.stringify(this.data));
        this.undoStack.push(currentState);
        const nextState = this.redoStack.pop();
        this.loadData(nextState, false);
    }

    loadData(json, recordHistory = true) {
        if (recordHistory) this.saveState();
        this.data = json;
        // Auto-layout
        let x = 100, y = 100;
        for (const id in this.data.nodes) {
            if (!this.data.nodes[id]._editor) {
                this.data.nodes[id]._editor = { x, y };
                x += 250;
                if (x > 1000) { x = 100; y += 200; }
            }
        }

        // Reset view/state
        this.selectedNodeIds.clear();
        this.selectedConnection = null;
        this.render();
        this.renderSidebar();
    }

    newStory() {
        const nodeCount = Object.keys(this.data.nodes).length;
        if (nodeCount > 0) {
            if(!confirm("Warning: Starting a new story will discard your current work (unsaved changes will be lost).\n\nTip: Click 'Export JSON' to save first.\n\nAre you sure you want to continue?")) {
                return;
            }
        }

        this.saveState();
        this.data = {
            startNode: "start_selection",
            nodes: {}
        };
        this.selectedNodeIds.clear();
        this.selectedConnection = null;
        this.undoStack = [];
        this.redoStack = [];

        this.addNode('start_selection');
        this.render();
        this.renderSidebar();
    }

    triggerImport() {
        const nodeCount = Object.keys(this.data.nodes).length;
        if (nodeCount > 0) {
             if(!confirm("Warning: Importing a file will completely overwrite your current story (unsaved changes will be lost).\n\nTip: Click 'Export JSON' to save first.\n\nAre you sure you want to continue?")) {
                return;
            }
        }
        document.getElementById('file-input').click();
    }

    addNode(id = null, type = 'choice', x = null, y = null) {
        this.saveState();
        const newId = id || 'node_' + Date.now();
        const defaultX = (x !== null) ? x : 100 - this.panX;
        const defaultY = (y !== null) ? y : 100 - this.panY;

        this.data.nodes[newId] = {
            id: newId,
            type: type,
            text: "New Text...",
            choices: [],
            _editor: { x: defaultX, y: defaultY }
        };

        if(type === 'logic') {
            this.data.nodes[newId].condition = { type: 'HAS_FLAG', flag: 'example' };
            this.data.nodes[newId].nextTrue = null;
            this.data.nodes[newId].nextFalse = null;
            delete this.data.nodes[newId].choices;
            delete this.data.nodes[newId].text;
        } else if (type === 'death') {
            this.data.nodes[newId].deathMessage = "Game Over.";
            delete this.data.nodes[newId].choices;
        } else if (type === 'win') {
            this.data.nodes[newId].winMessage = "You Win!";
            delete this.data.nodes[newId].choices;
        }

        this.render();
        this.selectNode(newId, false); // Select single
    }

    deleteCurrentNode() {
        if (this.selectedNodeIds.size === 0) return;
        if (!confirm(`Delete ${this.selectedNodeIds.size} node(s)?`)) return;
        this.saveState();

        this.selectedNodeIds.forEach(id => {
            delete this.data.nodes[id];
        });

        this.selectedNodeIds.clear();
        this.render();
        this.renderSidebar();
    }

    selectNode(id, addToSelection = false) {
        if (!addToSelection) {
            this.selectedNodeIds.clear();
        }
        if (id) {
            if (this.selectedNodeIds.has(id) && addToSelection) {
                 this.selectedNodeIds.delete(id);
            } else {
                this.selectedNodeIds.add(id);
            }
            this.selectedConnection = null;
        }

        document.querySelectorAll('.node').forEach(el => el.classList.remove('selected'));
        this.selectedNodeIds.forEach(nid => {
            const el = document.getElementById('node-' + nid);
            if (el) el.classList.add('selected');
        });

        this.renderSidebar();
        this.render();
    }

    selectConnection(sourceId, type, index) {
        this.selectedConnection = { sourceId, type, index };
        this.selectedNodeIds.clear();
        document.querySelectorAll('.node').forEach(el => el.classList.remove('selected'));
        this.renderSidebar();
        this.render();
    }

    deleteCurrentConnection() {
        if (!this.selectedConnection) return;
        this.saveState();
        const { sourceId, type, index } = this.selectedConnection;
        const node = this.data.nodes[sourceId];

        if (node) {
            if (type === 'true') {
                node.nextTrue = null;
            } else if (type === 'false') {
                node.nextFalse = null;
            } else if (type === 'default' && node.choices) {
                node.choices.splice(index, 1);
            } else if (type === 'direct' && node.next) {
                delete node.next;
            }
        }

        this.selectedConnection = null;
        this.render();
        this.renderSidebar();
    }

    // --- INSPECTOR ---
    validateStory() {
        document.querySelectorAll('.node').forEach(el => {
            el.classList.remove('error');
            el.classList.remove('warning');
        });

        const errors = [];
        const warnings = [];
        const reachable = new Set();

        const queue = [this.data.startNode];
        reachable.add(this.data.startNode);

        while(queue.length > 0) {
            const currentId = queue.shift();
            const node = this.data.nodes[currentId];
            if(!node) continue;

            let neighbors = [];
            if(node.choices) neighbors = neighbors.concat(node.choices.map(c => c.next));
            if(node.next) neighbors.push(node.next);
            if(node.nextTrue) neighbors.push(node.nextTrue);
            if(node.nextFalse) neighbors.push(node.nextFalse);

            neighbors.forEach(nid => {
                if(nid && !reachable.has(nid)) {
                    reachable.add(nid);
                    queue.push(nid);
                }
            });
        }

        for (const id in this.data.nodes) {
            const node = this.data.nodes[id];
            const el = document.getElementById('node-' + id);

            if (!reachable.has(id)) {
                warnings.push(`Node '${id}' is unreachable from start.`);
                if(el) el.classList.add('warning');
            }

            if (node.type === 'death') continue;

            let hasOutput = false;
            if (node.type === 'logic') {
                if (node.nextTrue || node.nextFalse) hasOutput = true;
                else {
                    errors.push(`Logic Node '${id}' has no connections.`);
                    if(el) el.classList.add('error');
                }
            } else {
                if ((node.choices && node.choices.length > 0) || node.next) hasOutput = true;
                else {
                    errors.push(`Node '${id}' is a dead end (no choices/next).`);
                    if(el) el.classList.add('error');
                }
            }
        }

        let report = "Inspection Results:\n";
        if (errors.length === 0 && warnings.length === 0) report += "All good! No issues found.";

        if (errors.length > 0) {
            report += "\nERRORS (Red):\n- " + errors.join("\n- ");
        }
        if (warnings.length > 0) {
            report += "\n\nWARNINGS (Orange):\n- " + warnings.join("\n- ");
        }

        alert(report);
    }

    // --- CONNECTION LOGIC ---

    startConnectionDrag(e, sourceId, type = 'default') {
        this.isConnecting = true;
        this.connectSourceId = sourceId;
        this.connectSourceType = type;
        this.mousePos = { x: e.clientX, y: e.clientY };
        this.render();
    }

    finishConnection(targetId) {
        if(!this.isConnecting) return;
        if(this.connectSourceId === targetId) {
            this.cancelConnection();
            return;
        }

        this.saveState();
        const sourceId = this.connectSourceId;
        const node = this.data.nodes[sourceId];

        if (this.connectSourceType === 'true') {
            node.nextTrue = targetId;
        } else if (this.connectSourceType === 'false') {
            node.nextFalse = targetId;
        } else {
            if(!node.choices) node.choices = [];
            node.choices.push({
                text: "To " + targetId,
                next: targetId
            });
        }

        this.cancelConnection();
        this.renderSidebar();
    }

    cancelConnection() {
        this.isConnecting = false;
        this.connectSourceId = null;
        this.connectSourceType = 'default';
        this.render();
    }

    // --- RENDERING ---

    render() {
        // Pass 1: Render Nodes
        this.nodesLayer.innerHTML = '';
        this.nodesLayer.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.scale})`;

        for (const id in this.data.nodes) {
            const node = this.data.nodes[id];
            const pos = node._editor || { x: 0, y: 0 };

            // Create Node Element
            const el = document.createElement('div');
            el.className = 'node';
            if (node.type === 'logic') el.classList.add('logic');
            if (node.type === 'death') el.classList.add('death');
            if (node.type === 'win') el.classList.add('win');
            if (this.selectedNodeIds.has(id)) el.classList.add('selected');
            el.id = 'node-' + id;
            el.style.left = pos.x + 'px';
            el.style.top = pos.y + 'px';

            el.onmouseenter = () => this.highlightConnections(id, true);
            el.onmouseleave = () => this.highlightConnections(id, false);

            if (node.type === 'logic') {
                const portTrue = document.createElement('div');
                portTrue.className = 'node-port-true';
                portTrue.title = "True Path";
                portTrue.onmousedown = (e) => {
                    e.stopPropagation(); e.preventDefault(); if (e.button !== 0) return;
                    this.startConnectionDrag(e, id, 'true');
                };
                el.appendChild(portTrue);

                const portFalse = document.createElement('div');
                portFalse.className = 'node-port-false';
                portFalse.title = "False Path";
                portFalse.onmousedown = (e) => {
                    e.stopPropagation(); e.preventDefault(); if (e.button !== 0) return;
                    this.startConnectionDrag(e, id, 'false');
                };
                el.appendChild(portFalse);

            } else if (node.type !== 'death') {
                const portOut = document.createElement('div');
                portOut.className = 'node-port';
                portOut.title = "Drag to Connect";

                if(this.isConnecting && this.connectSourceId === id) {
                    portOut.style.backgroundColor = '#ffeb3b';
                    portOut.style.transform = 'translateY(-50%) scale(1.5)';
                    portOut.style.boxShadow = '0 0 10px #ffeb3b';
                }

                portOut.onmousedown = (e) => {
                    e.stopPropagation(); e.preventDefault(); if (e.button !== 0) return;
                    this.startConnectionDrag(e, id, 'default');
                };
                el.appendChild(portOut);
            }

            const portIn = document.createElement('div');
            portIn.className = 'node-port-in';
            portIn.title = "Drop to Connect";

            if(this.isConnecting && this.connectSourceId !== id) {
                portIn.style.backgroundColor = '#4caf50';
                portIn.style.cursor = 'crosshair';
            }

            el.appendChild(portIn);

            const header = document.createElement('div');
            header.className = 'node-header';
            if(node.type === 'input') {
                header.innerHTML = '<span style="color:#2196f3">[Input]</span> ' + id;
            } else if (node.type === 'logic') {
                header.innerHTML = '<span style="color:#e040fb">[Logic]</span> ' + id;
            } else if (node.type === 'death') {
                header.innerHTML = '<span style="color:#f44336">[Death]</span> ' + id;
            } else if (node.type === 'win') {
                header.innerHTML = '<span style="color:#4caf50">[Win]</span> ' + id;
            } else {
                header.innerText = id;
            }
            el.appendChild(header);

            if (node.type !== 'logic') {
                let preview = "";
                if (node.type === 'death') {
                    preview = node.deathMessage || "Game Over";
                } else if (node.type === 'win') {
                    preview = node.winMessage || "You Win!";
                } else {
                    preview = typeof node.text === 'string' ? node.text : '[Complex Text]';
                }

                if (preview.length > 50) preview = preview.substring(0, 50) + '...';
                const previewEl = document.createElement('div');
                previewEl.className = 'node-preview';
                previewEl.innerText = preview;
                el.appendChild(previewEl);
            }

            el.onmousedown = (e) => {
                if(e.target.classList.contains('node-port') ||
                   e.target.classList.contains('node-port-in') ||
                   e.target.classList.contains('node-port-true') ||
                   e.target.classList.contains('node-port-false')) return;
                e.stopPropagation();

                const wasSelected = this.selectedNodeIds.has(id);
                // Ctrl+Click handling
                this.startNodeDrag(e, id);

                if (e.ctrlKey && !wasSelected) {
                    this.render();
                    this.renderSidebar();
                    return;
                }

                // If clicking an already selected node without Ctrl, delay clearing selection (in case of drag)
                if (!e.ctrlKey && wasSelected) {
                    return;
                }

                this.selectNode(id, e.ctrlKey);
            };

            this.nodesLayer.appendChild(el);
        }

        // Pass 2: Draw Connections
        this.connectionsLayer.innerHTML = `<g transform="translate(${this.panX}, ${this.panY}) scale(${this.scale})"></g>`;
        const svgGroup = this.connectionsLayer.querySelector('g');

        for (const id in this.data.nodes) {
            const node = this.data.nodes[id];
            const el = document.getElementById('node-' + id);
            if(!el) continue;

            const startPos = {
                x: node._editor.x,
                y: node._editor.y,
                w: el.offsetWidth,
                h: el.offsetHeight
            };

            if (node.type === 'logic') {
                if (node.nextTrue) {
                    const targetEl = document.getElementById('node-' + node.nextTrue);
                    if (targetEl) {
                        const targetNode = this.data.nodes[node.nextTrue];
                        const endPos = { x: targetNode._editor.x, y: targetNode._editor.y, w: targetEl.offsetWidth, h: targetEl.offsetHeight };
                        const trueStart = { ...startPos, y: startPos.y - (startPos.h * 0.2) };
                        this.drawConnection(svgGroup, trueStart, endPos, '#4caf50', id, node.nextTrue, 'true');
                    }
                }
                if (node.nextFalse) {
                    const targetEl = document.getElementById('node-' + node.nextFalse);
                    if (targetEl) {
                        const targetNode = this.data.nodes[node.nextFalse];
                        const endPos = { x: targetNode._editor.x, y: targetNode._editor.y, w: targetEl.offsetWidth, h: targetEl.offsetHeight };
                        const falseStart = { ...startPos, y: startPos.y + (startPos.h * 0.2) };
                        this.drawConnection(svgGroup, falseStart, endPos, '#f44336', id, node.nextFalse, 'false');
                    }
                }
            } else {
                if (node.choices) {
                    node.choices.forEach((choice, index) => {
                        if (choice.next && this.data.nodes[choice.next]) {
                            const targetNode = this.data.nodes[choice.next];
                            const targetEl = document.getElementById('node-' + choice.next);
                            if(targetEl) {
                                const endPos = {
                                    x: targetNode._editor.x,
                                    y: targetNode._editor.y,
                                    w: targetEl.offsetWidth,
                                    h: targetEl.offsetHeight
                                };
                                this.drawConnection(svgGroup, startPos, endPos, '#666', id, choice.next, 'default', index);
                            }
                        }
                    });
                }
                if (node.next && this.data.nodes[node.next]) {
                     const targetNode = this.data.nodes[node.next];
                     const targetEl = document.getElementById('node-' + node.next);
                     if(targetEl) {
                         const endPos = {
                            x: targetNode._editor.x,
                            y: targetNode._editor.y,
                            w: targetEl.offsetWidth,
                            h: targetEl.offsetHeight
                        };
                        this.drawConnection(svgGroup, startPos, endPos, '#4caf50', id, node.next, 'direct');
                     }
                }
            }
        }

        if(this.isConnecting && this.connectSourceId) {
             const el = document.getElementById('node-' + this.connectSourceId);
             if(el) {
                 const node = this.data.nodes[this.connectSourceId];
                 let startYOffset = 0;
                 let color = '#ffeb3b';

                 if (this.connectSourceType === 'true') { startYOffset = -el.offsetHeight * 0.2; color = '#4caf50'; }
                 if (this.connectSourceType === 'false') { startYOffset = el.offsetHeight * 0.2; color = '#f44336'; }

                 const startPos = {
                    x: node._editor.x,
                    y: node._editor.y + startYOffset,
                    w: el.offsetWidth,
                    h: el.offsetHeight
                };
                const endX = (this.mousePos.x - this.panX) / this.scale;
                const endY = (this.mousePos.y - this.panY) / this.scale;

                this.drawConnection(svgGroup, startPos, {x: endX, y: endY, w:0, h:0}, color, 'drag', 'drag');
             }
        }
    }

    drawConnection(svgGroup, startPos, endPos, color, sourceId, targetId, type = null, index = null) {
        // ... (connection drawing logic same)
        const x1 = startPos.x + startPos.w;
        const y1 = startPos.y + startPos.h / 2;

        const x2 = endPos.x;
        const y2 = endPos.y + (endPos.h ? endPos.h / 2 : 0);

        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");

        const dist = Math.abs(x2 - x1);
        const curve = Math.max(dist / 2, 50);

        const cp1x = x1 + curve;
        const cp1y = y1;
        const cp2x = x2 - curve;
        const cp2y = y2;

        const d = `M ${x1} ${y1} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2}`;

        path.setAttribute("d", d);

        let isSelected = false;
        if (this.selectedConnection &&
            this.selectedConnection.sourceId === sourceId &&
            this.selectedConnection.type === type &&
            (index === null || this.selectedConnection.index === index)) {
            isSelected = true;
        }

        path.setAttribute("stroke", isSelected ? "#2196f3" : color);
        path.setAttribute("stroke-width", isSelected ? "6" : (sourceId === 'drag' ? "4" : "4"));
        path.setAttribute("fill", "none");

        if(sourceId !== 'drag') {
            path.style.cursor = "pointer";
            path.style.pointerEvents = "stroke";
            path.onclick = (e) => {
                e.stopPropagation();
                this.selectConnection(sourceId, type, index);
            };
        } else {
            path.style.pointerEvents = "none";
        }

        path.setAttribute("data-source", sourceId);
        path.setAttribute("data-target", targetId);

        svgGroup.appendChild(path);
    }

    highlightConnections(nodeId, active) {
        // ... same
        if (this.isConnecting || this.isDragging) return;

        const paths = this.connectionsLayer.querySelectorAll('path');
        paths.forEach(p => {
            const src = p.getAttribute('data-source');
            const tgt = p.getAttribute('data-target');
            if (src === nodeId || tgt === nodeId) {
                const currentColor = p.getAttribute('stroke');
                if (currentColor === '#2196f3') return;

                if(active) {
                    p.setAttribute('stroke', '#ffeb3b');
                    p.parentNode.appendChild(p);
                } else {
                    this.render();
                }
            }
        });
    }

    // --- MOUSE HANDLING ---

    canvasMouseDown(e) {
        if (e.target === this.canvas || e.target.id === 'connections-layer') {
            if(this.isConnecting) {
                this.cancelConnection();
                return;
            }

            // If not Ctrl, clear selection
            if (!e.ctrlKey) {
                 if (this.selectedNodeIds.size > 0 || this.selectedConnection) {
                    this.selectedNodeIds.clear();
                    this.selectedConnection = null;
                    document.querySelectorAll('.node').forEach(el => el.classList.remove('selected'));
                    this.renderSidebar();
                    this.render();
                }
            }

            // Start Pan/Drag
            this.isDragging = true;
            this.dragStartX = e.clientX;
            this.dragStartY = e.clientY;
        }
    }

    canvasWheel(e) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;

        const rect = this.canvas.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        const worldX = (centerX - this.panX) / this.scale;
        const worldY = (centerY - this.panY) / this.scale;

        this.scale *= delta;

        this.panX = centerX - worldX * this.scale;
        this.panY = centerY - worldY * this.scale;

        this.render();
    }

    startNodeDrag(e, id) {
        if(this.isConnecting) {
            this.cancelConnection();
            return;
        }

        // If drag started on a node not in selection, select it (exclusive unless Ctrl)
        if (!this.selectedNodeIds.has(id)) {
            if (!e.ctrlKey) this.selectedNodeIds.clear();
            this.selectedNodeIds.add(id);
        }

        // Store initial positions for ALL selected nodes
        this.dragStartNodePositions = {};
        this.selectedNodeIds.forEach(nid => {
             this.dragStartNodePositions[nid] = { ...this.data.nodes[nid]._editor };
        });

        this.isDragging = true;
        this.draggedNodeId = id; // Reference for delta calc
        this.dragStartX = e.clientX;
        this.dragStartY = e.clientY;
    }

    handleMouseMove(e) {
        this.mousePos = { x: e.clientX, y: e.clientY };

        if (this.isConnecting) {
            this.render();
            return;
        }

        if (!this.isDragging) return;

        const dx = e.clientX - this.dragStartX;
        const dy = e.clientY - this.dragStartY;

        if (this.draggedNodeId) {
            // Move ALL selected nodes
            this.selectedNodeIds.forEach(nid => {
                const node = this.data.nodes[nid];
                const startPos = this.dragStartNodePositions[nid];
                if (startPos) {
                    node._editor.x = startPos.x + dx / this.scale;
                    node._editor.y = startPos.y + dy / this.scale;
                }
            });
            this.render();
        } else {
            // Panning
            this.panX += dx;
            this.panY += dy;
            this.render();
            this.dragStartX = e.clientX;
            this.dragStartY = e.clientY;
        }
    }

    stopDrag(e) {
        if(this.isConnecting) {
            const targetEl = document.elementFromPoint(e.clientX, e.clientY);

            if (targetEl && targetEl.classList.contains('node-port-in')) {
                const nodeEl = targetEl.closest('.node');
                if (nodeEl) {
                    const targetId = nodeEl.id.replace('node-', '');
                    this.finishConnection(targetId);
                    return;
                }
            }
            this.cancelConnection();
            return;
        }

        if (this.isDragging && this.draggedNodeId) {
            const dist = Math.hypot(e.clientX - this.dragStartX, e.clientY - this.dragStartY);
            if (dist < 5) {
                // Click behavior
                if (!e.ctrlKey) {
                    this.selectNode(this.draggedNodeId, false);
                }
            } else {
                // Drag behavior
                this.saveState();
            }
        }
        this.isDragging = false;
        this.draggedNodeId = null;
        this.dragStartNodePositions = null;
    }

    // --- KEYBOARD ---

    handleKeyDown(e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        const key = e.key.toLowerCase();

        if (e.ctrlKey && key === 'z') { e.preventDefault(); this.undo(); return; }
        if ((e.ctrlKey && key === 'y') || (e.ctrlKey && e.shiftKey && key === 'z')) { e.preventDefault(); this.redo(); return; }

        if (e.ctrlKey && key === 'c') {
            if (this.selectedNodeIds.size > 0) {
                 // For now, simple copy single. Enhancing to multi requires a structured clipboard format.
                 const firstId = this.selectedNodeIds.values().next().value;
                 if (firstId) this.clipboard = JSON.parse(JSON.stringify(this.data.nodes[firstId]));
            }
        }
        if (e.ctrlKey && key === 'v') {
            if (this.clipboard) {
                this.saveState();
                const newId = this.clipboard.id + '_copy_' + Date.now();
                const newNode = JSON.parse(JSON.stringify(this.clipboard));
                newNode.id = newId;
                newNode._editor.x += 20; newNode._editor.y += 20;
                this.data.nodes[newId] = newNode;
                this.render();
                this.selectNode(newId);
            }
        }
        if (e.key === 'Delete' || e.key === 'Backspace') {
            if (this.selectedNodeIds.size > 0) this.deleteCurrentNode();
            else if (this.selectedConnection) this.deleteCurrentConnection();
        }
        if (e.key === 'Escape') this.cancelConnection();
    }

    // --- DRAG AND DROP ---
    handleDragStart(e, type) { e.dataTransfer.setData("type", type); }
    handleDragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }
    handleDrop(e) {
        e.preventDefault();
        const type = e.dataTransfer.getData("type");
        if(type) {
            const rect = this.canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            const canvasX = (mouseX - this.panX) / this.scale;
            const canvasY = (mouseY - this.panY) / this.scale;
            this.addNode(null, type, canvasX, canvasY);
        }
    }

    // --- IMPORT / EXPORT ---
    downloadJSON() {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.data, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "story.json");
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    }

    importJSON(inputElement) {
        const file = inputElement.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const json = JSON.parse(e.target.result);
                if (json.nodes && json.startNode) {
                    this.loadData(json);
                    alert("Story loaded successfully!");
                    // Update LocalStorage too
                    try {
                        localStorage.setItem('survival_rpg_story', e.target.result);
                    } catch(err) { console.warn("LS full"); }
                } else {
                    alert("Invalid Story JSON format.");
                }
            } catch (err) {
                alert("Error parsing JSON: " + err);
            }
        };
        reader.readAsText(file);
        inputElement.value = '';
    }

    // --- SIDEBAR ---
    renderSidebar() {
        if (this.selectedConnection) {
            this.sidebarTitle.innerText = "Connection Selected";
            this.deleteBtn.style.display = 'none';
            this.sidebarContent.innerHTML = '';
            const { sourceId, type, index } = this.selectedConnection;
            const info = document.createElement('div');
            info.innerHTML = `
                <p><b>Source:</b> ${sourceId}</p>
                <p><b>Type:</b> ${type}</p>
                <button class="danger" onclick="editor.deleteCurrentConnection()">Delete Connection</button>
            `;
            this.sidebarContent.appendChild(info);
            return;
        }

        if (this.selectedNodeIds.size === 0) {
            this.sidebarTitle.innerText = "No Selection";
            this.deleteBtn.style.display = 'none';
            this.sidebarContent.innerHTML = '<p style="color:#666; text-align:center; margin-top:50px;">Select a node to edit<br><br>Ctrl+Click to select multiple<br>Drag background to box select</p>';
            return;
        }

        if (this.selectedNodeIds.size > 1) {
            this.sidebarTitle.innerText = `${this.selectedNodeIds.size} Nodes Selected`;
            this.deleteBtn.style.display = 'block';
            this.sidebarContent.innerHTML = `
                <div style="text-align:center; margin-top:20px;">
                    <p>Multiple items selected.</p>
                    <button class="danger" onclick="editor.deleteCurrentNode()">Delete All Selected</button>
                </div>
            `;
            return;
        }

        // Single Node Selection (Existing Logic)
        const id = this.selectedNodeIds.values().next().value;
        this.selectedNodeId = id; // Backwards compat for helper functions using this property

        const node = this.data.nodes[id];
        this.sidebarTitle.innerText = "Editing: " + node.id;
        this.deleteBtn.style.display = 'block';
        this.sidebarContent.innerHTML = '';

        // Form Fields
        const createField = (label, type, value, onChange) => {
            const div = document.createElement('div');
            div.className = 'form-group';
            div.innerHTML = `<label>${label}</label>`;
            let input;
            if (type === 'textarea') {
                input = document.createElement('textarea');
                input.value = value;
            } else {
                input = document.createElement('input');
                input.type = type;
                input.value = value;
            }
            input.onchange = (e) => {
                this.saveState();
                onChange(e.target.value);
            };
            div.appendChild(input);
            return div;
        };

        // ID Change (Renaming)
        this.sidebarContent.appendChild(createField("Node ID", "text", node.id, (newVal) => {
            if (newVal !== node.id && !this.data.nodes[newVal]) {
                this.data.nodes[newVal] = node;
                delete this.data.nodes[node.id];
                node.id = newVal;
                this.selectedNodeIds.clear();
                this.selectedNodeIds.add(newVal);
                this.selectedNodeId = newVal;
                this.render();
                this.renderSidebar();
            }
        }));

        // Node Properties (Same as before...)
        if(node.type !== 'logic') {
            let textVal = "";
            if(node.type === 'death') {
                textVal = node.deathMessage || "";
            } else if (node.type === 'win') {
                textVal = node.winMessage || "";
            } else if (typeof node.text === 'string') {
                textVal = node.text;
            } else {
                textVal = JSON.stringify(node.text, null, 2);
            }

            let labelText = "Text Content (HTML)";
            if (node.type === 'death') labelText = "Death Message";
            if (node.type === 'win') labelText = "Win Message";

            const textDiv = createField(labelText, "textarea", textVal, (val) => {
                if(node.type === 'death') {
                    node.deathMessage = val;
                } else if (node.type === 'win') {
                    node.winMessage = val;
                } else {
                    try {
                        if (val.trim().startsWith('[')) {
                            node.text = JSON.parse(val);
                        } else {
                            node.text = val;
                        }
                    } catch(e) {
                        alert("Invalid JSON for text array");
                    }
                }
                this.render();
            });
            this.sidebarContent.appendChild(textDiv);
        }

        if(node.type === 'logic') {
            const logicContainer = document.createElement('div');
            logicContainer.style.marginBottom = '15px';
            logicContainer.innerHTML = '<h3>Branch Logic</h3>';
            this.renderConditionEditor(logicContainer, node.condition, (newCond) => {
                this.saveState();
                node.condition = newCond;
            });
            this.sidebarContent.appendChild(logicContainer);
        }

        const typeSelect = document.createElement('select');
        ['choice', 'input', 'logic', 'death', 'win'].forEach(opt => {
            const o = document.createElement('option');
            o.value = opt; o.innerText = opt;
            if (node.type === opt || (!node.type && opt==='choice')) o.selected = true;
            typeSelect.appendChild(o);
        });
        typeSelect.onchange = (e) => {
            this.saveState();
            const newType = e.target.value;
            node.type = newType;

            if(newType === 'logic') {
                if(!node.condition) node.condition = { type: 'HAS_FLAG', flag: 'new' };
                if(node.nextTrue === undefined) node.nextTrue = null;
                if(node.nextFalse === undefined) node.nextFalse = null;
            } else if (newType === 'death') {
                if(!node.deathMessage) node.deathMessage = "Game Over.";
                delete node.choices;
            } else if (newType === 'win') {
                if(!node.winMessage) node.winMessage = "You Win!";
                delete node.choices;
            }

            this.render();
            this.renderSidebar();
        };
        const typeGroup = document.createElement('div');
        typeGroup.className = 'form-group';
        typeGroup.innerHTML = '<label>Type</label>';
        typeGroup.appendChild(typeSelect);
        this.sidebarContent.appendChild(typeGroup);

        if (node.type === 'input') {
            this.sidebarContent.appendChild(createField("Variable Name (e.g. flags.name)", "text", node.variable || "", (v) => node.variable = v));
        }

        this.sidebarContent.appendChild(createField("Location", "text", node.location || "", (v) => node.location = v));
        this.sidebarContent.appendChild(createField("Image URL (optional)", "text", node.image || "", (v) => node.image = v));
        this.sidebarContent.appendChild(createField("Time Set", "number", node.timeSet || "", (v) => node.timeSet = parseInt(v)));

        // --- CHOICES EDITOR (Standard Only) ---
        if(node.type !== 'logic' && node.type !== 'death' && node.type !== 'win') {
            const choicesLabel = document.createElement('h3');
            choicesLabel.innerText = "Choices / Navigation";
            choicesLabel.style.borderBottom = "1px solid #444";
            this.sidebarContent.appendChild(choicesLabel);

            const choicesContainer = document.createElement('div');

            const renderChoiceItem = (choice, index) => {
                const item = document.createElement('div');
                item.className = 'list-item';

                item.innerHTML = `
                    <div class="list-item-header">
                        <strong>#${index+1}</strong>
                        <button class="danger btn-sm" onclick="editor.removeChoice(${index})">X</button>
                    </div>
                    <label>Text</label>
                    <input type="text" class="choice-text" value="${choice.text || ''}" onchange="editor.updateChoice(${index}, 'text', this.value)">

                    <label>Target Node ID</label>
                    <input type="text" class="choice-next" value="${choice.next || ''}" onchange="editor.updateChoice(${index}, 'next', this.value)">

                    <div class="logic-area">
                        <label>Effects</label>
                        <div id="effects-container-${index}"></div>

                        <label style="margin-top:10px;">Condition (Show if...)</label>
                        <div id="condition-container-${index}"></div>
                    </div>
                `;
                setTimeout(() => {
                    const container = document.getElementById(`effects-container-${index}`);
                    if(container) {
                        this.renderEffectsEditor(container, choice.effects, (newEffects) => {
                            this.saveState();
                            choice.effects = newEffects;
                        });
                    }

                    const condContainer = document.getElementById(`condition-container-${index}`);
                    if(condContainer) {
                        this.renderConditionEditor(condContainer, choice.condition, (newCondition) => {
                            this.saveState();
                            choice.condition = newCondition;
                            if (!newCondition) this.renderSidebar();
                            else {
                                 this.renderConditionEditor(condContainer, choice.condition, (c) => {
                                     choice.condition = c;
                                     if(!c) this.renderSidebar();
                                 });
                            }
                        });
                    }
                }, 0);

                return item;
            };

            if (node.choices && node.choices.length > 0) {
                node.choices.forEach((c, i) => choicesContainer.appendChild(renderChoiceItem(c, i)));
            } else if (node.next && !node.choices) {
                 choicesContainer.innerHTML = `<div class="list-item">
                    <label>Direct Next Node</label>
                    <input type="text" value="${node.next}" onchange="editor.updateNodeProp('next', this.value)">
                 </div>`;
            }

            const addBtn = document.createElement('button');
            addBtn.innerText = "+ Add Choice";
            addBtn.className = "primary btn-sm";
            addBtn.onclick = () => {
                this.saveState();
                if (!node.choices) node.choices = [];
                if (node.next) { delete node.next; }
                node.choices.push({ text: "Option", next: "" });
                this.render();
                this.renderSidebar();
            };

            this.sidebarContent.appendChild(choicesContainer);
            this.sidebarContent.appendChild(addBtn);
        } else {
            const info = document.createElement('div');
            info.style.color = '#ccc';
            info.style.marginTop = '10px';
            if(node.type === 'logic')
                info.innerHTML = 'Connect the <b>True</b> and <b>False</b> ports to determine the path.';
            else if(node.type === 'death')
                info.innerHTML = 'This node ends the game session (Game Over). No outgoing connections allowed.';
            else if(node.type === 'win')
                info.innerHTML = 'This node ends the game session (Victory). No outgoing connections allowed.';
            this.sidebarContent.appendChild(info);
        }
    }

    updateNodeProp(prop, val) {
        if (!this.selectedNodeId) return;
        this.saveState();
        this.data.nodes[this.selectedNodeId][prop] = val;
        this.render();
    }

    updateChoice(index, prop, val) {
        if (!this.selectedNodeId) return;
        const node = this.data.nodes[this.selectedNodeId];
        if (node.choices && node.choices[index]) {
            this.saveState();
            node.choices[index][prop] = val;
            this.render();
        }
    }

    removeChoice(index) {
        if (!this.selectedNodeId) return;
        const node = this.data.nodes[this.selectedNodeId];
        if (node.choices) {
            this.saveState();
            node.choices.splice(index, 1);
            this.render();
            this.renderSidebar();
        }
    }

    renderEffectsEditor(container, effects, onChange) {
        container.innerHTML = '';
        container.style.marginTop = '10px';
        container.style.padding = '5px';
        container.style.background = '#222';
        container.style.border = '1px solid #444';

        if (!effects) effects = [];

        effects.forEach((eff, idx) => {
            const row = document.createElement('div');
            row.style.marginBottom = '5px';
            row.style.display = 'flex';
            row.style.gap = '5px';
            row.style.alignItems = 'center';
            row.style.borderBottom = '1px solid #333';
            row.style.paddingBottom = '5px';

            const typeSel = document.createElement('select');
            ['SET_FLAG', 'ADD_ITEM', 'REMOVE_ITEM', 'SET_VALUE', 'RESTART'].forEach(t => {
                const opt = document.createElement('option');
                opt.value = t; opt.innerText = t;
                if (eff.type === t) opt.selected = true;
                typeSel.appendChild(opt);
            });
            typeSel.style.width = '100px';
            typeSel.onchange = (e) => {
                effects[idx].type = e.target.value;
                if (effects[idx].type === 'SET_FLAG') { effects[idx].flag = 'new_flag'; effects[idx].value = true; }
                if (effects[idx].type === 'ADD_ITEM') { effects[idx].item = 'New Item'; }
                if (effects[idx].type === 'SET_VALUE') { effects[idx].property = 'timeMinutes'; effects[idx].value = 0; }
                onChange(effects);
            };
            row.appendChild(typeSel);

            if (eff.type === 'SET_FLAG') {
                const input = document.createElement('input');
                input.type = 'text'; input.value = eff.flag || ''; input.placeholder = "Flag Name";
                input.style.width = '80px';
                input.onchange = (e) => { effects[idx].flag = e.target.value; onChange(effects); };
                row.appendChild(input);

                const valCheck = document.createElement('input');
                valCheck.type = 'checkbox';
                valCheck.checked = eff.value !== false;
                valCheck.onchange = (e) => { effects[idx].value = e.target.checked; onChange(effects); };
                row.appendChild(valCheck);
            }
            else if (eff.type === 'ADD_ITEM' || eff.type === 'REMOVE_ITEM') {
                const input = document.createElement('input');
                input.type = 'text'; input.value = eff.item || ''; input.placeholder = "Item Name";
                input.style.flexGrow = 1;
                input.onchange = (e) => { effects[idx].item = e.target.value; onChange(effects); };
                row.appendChild(input);
            }
            else if (eff.type === 'SET_VALUE') {
                const propSel = document.createElement('select');
                ['timeMinutes', 'dayIndex', 'playerName', 'major'].forEach(p => {
                    const opt = document.createElement('option');
                    opt.value = p; opt.innerText = p;
                    if (eff.property === p) opt.selected = true;
                    propSel.appendChild(opt);
                });
                propSel.onchange = (e) => { effects[idx].property = e.target.value; onChange(effects); };
                row.appendChild(propSel);

                const valInput = document.createElement('input');
                valInput.type = 'text';
                valInput.value = eff.value || 0;
                valInput.style.width = '50px';
                valInput.onchange = (e) => {
                    effects[idx].value = isNaN(Number(e.target.value)) ? e.target.value : Number(e.target.value);
                    onChange(effects);
                };
                row.appendChild(valInput);
            }

            const delBtn = document.createElement('button');
            delBtn.innerText = 'x';
            delBtn.className = 'danger btn-sm';
            delBtn.onclick = () => {
                effects.splice(idx, 1);
                onChange(effects);
            };
            row.appendChild(delBtn);

            container.appendChild(row);
        });

        const addBtn = document.createElement('button');
        addBtn.innerText = "+ Add Effect";
        addBtn.className = "primary btn-sm";
        addBtn.onclick = () => {
            effects.push({ type: 'SET_FLAG', flag: 'new_flag', value: true });
            onChange(effects);
        };
        container.appendChild(addBtn);
    }

    renderConditionEditor(container, condition, onChange) {
        container.innerHTML = '';
        container.style.marginTop = '5px';
        container.style.padding = '5px';
        container.style.background = '#2a2a2a';
        container.style.border = '1px solid #c66900';

        if (!condition) {
            const addBtn = document.createElement('button');
            addBtn.innerText = "+ Add Condition";
            addBtn.className = 'btn-sm';
            addBtn.onclick = () => {
                onChange({ type: 'HAS_FLAG', flag: 'flag_name', value: true });
            };
            container.appendChild(addBtn);
            return;
        }

        const header = document.createElement('div');
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.marginBottom = '5px';
        header.innerHTML = '<span style="color:#ff9800; font-size:0.8rem;">Condition</span>';

        const clearBtn = document.createElement('button');
        clearBtn.innerText = "Remove";
        clearBtn.className = 'danger btn-sm';
        clearBtn.onclick = () => onChange(null);
        header.appendChild(clearBtn);
        container.appendChild(header);

        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.gap = '5px';
        row.style.marginBottom = '5px';

        const typeSel = document.createElement('select');
        ['HAS_FLAG', 'HAS_ITEM', 'NOT', 'OR', 'AND'].forEach(t => {
            const opt = document.createElement('option');
            opt.value = t; opt.innerText = t;
            if (condition.type === t) opt.selected = true;
            typeSel.appendChild(opt);
        });
        typeSel.onchange = (e) => {
            condition.type = e.target.value;
            if (condition.type === 'HAS_FLAG') { condition.flag = 'flag_name'; condition.value = true; delete condition.conditions; delete condition.item; }
            if (condition.type === 'HAS_ITEM') { condition.item = 'item_name'; delete condition.flag; delete condition.value; delete condition.conditions; }
            if (['OR', 'AND'].includes(condition.type)) { condition.conditions = []; delete condition.flag; delete condition.item; }
            if (condition.type === 'NOT') { condition.condition = { type: 'HAS_FLAG', flag: 'x' }; delete condition.flag; }
            onChange(condition);
        };
        row.appendChild(typeSel);
        container.appendChild(row);

        if (condition.type === 'HAS_FLAG') {
            const input = document.createElement('input');
            input.type = 'text'; input.value = condition.flag || ''; input.placeholder = "Flag Name";
            input.onchange = (e) => { condition.flag = e.target.value; onChange(condition); };
            container.appendChild(input);

            const valLabel = document.createElement('label');
            valLabel.style.display = 'inline-flex';
            valLabel.style.alignItems = 'center';
            valLabel.style.fontSize = '0.8rem';
            valLabel.style.marginTop = '5px';
            valLabel.innerHTML = `<input type="checkbox" ${condition.value !== false ? 'checked' : ''}> Is True`;
            valLabel.querySelector('input').onchange = (e) => { condition.value = e.target.checked; onChange(condition); };
            container.appendChild(valLabel);
        }
        else if (condition.type === 'HAS_ITEM') {
            const input = document.createElement('input');
            input.type = 'text'; input.value = condition.item || ''; input.placeholder = "Item Name";
            input.onchange = (e) => { condition.item = e.target.value; onChange(condition); };
            container.appendChild(input);
        }
        else if (condition.type === 'OR' || condition.type === 'AND') {
            const subContainer = document.createElement('div');
            subContainer.style.marginLeft = '10px';
            subContainer.style.borderLeft = '1px solid #555';

            if (condition.conditions) {
                condition.conditions.forEach((subC, idx) => {
                    const subWrapper = document.createElement('div');
                    this.renderConditionEditor(subWrapper, subC, (newSubC) => {
                        if (newSubC === null) {
                            condition.conditions.splice(idx, 1);
                        } else {
                            condition.conditions[idx] = newSubC;
                        }
                        onChange(condition);
                    });
                    subContainer.appendChild(subWrapper);
                });
            }

            const addSubBtn = document.createElement('button');
            addSubBtn.innerText = "+ Add Sub-Condition";
            addSubBtn.className = 'btn-sm';
            addSubBtn.style.marginTop = '5px';
            addSubBtn.onclick = () => {
                if (!condition.conditions) condition.conditions = [];
                condition.conditions.push({ type: 'HAS_FLAG', flag: 'new' });
                onChange(condition);
            };
            subContainer.appendChild(addSubBtn);
            container.appendChild(subContainer);
        }
        else if (condition.type === 'NOT') {
             const subWrapper = document.createElement('div');
             this.renderConditionEditor(subWrapper, condition.condition, (newSubC) => {
                 condition.condition = newSubC;
                 onChange(condition);
             });
             container.appendChild(subWrapper);
        }
    }
}

const editor = new StoryEditor();
