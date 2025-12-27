import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// --- SYSTEM SETUP ---
// Debug: confirm module executed
console.log('Assets/script.js module loaded');

// Global error logging to help diagnose load/runtime issues
window.addEventListener('error', (e) => {
    console.error('PAGE ERROR:', e.message, e.filename + ':' + e.lineno);
    const el = document.getElementById('interaction-text');
    if (el) el.innerText = 'Error: ' + e.message;
});
window.addEventListener('unhandledrejection', (ev) => {
    console.error('Unhandled rejection:', ev.reason);
    const el = document.getElementById('interaction-text');
    if (el) el.innerText = 'Promise error: ' + (ev.reason && ev.reason.message ? ev.reason.message : ev.reason);
});
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111);
scene.fog = new THREE.FogExp2(0x111111, 0.02); // Tæt tåge

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: false }); // False for retro feel
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true; // Shadows ON
renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Soft Shadows
document.getElementById('game-container').appendChild(renderer.domElement);

// --- POST PROCESSING (ULTRA GRAPHICS) ---
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);

// Bloom Effect (Glød)
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
bloomPass.threshold = 0.2; // Hvor lyst skal det være for at gløde
bloomPass.strength = 1.2;  // Hvor kraftig glød
bloomPass.radius = 0.5;
composer.addPass(bloomPass);

// --- LYD SYSTEM (Procedural) ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playSound(type) {
    if(audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    
    if (type === 'step') { // Fodtrin
        osc.type = 'triangle'; osc.frequency.setValueAtTime(100, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
        osc.start(); osc.stop(audioCtx.currentTime + 0.1);
    } else if (type === 'chop') { // Hug
        osc.type = 'sawtooth'; osc.frequency.setValueAtTime(150, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(50, audioCtx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.2, audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
        osc.start(); osc.stop(audioCtx.currentTime + 0.2);
    } else if (type === 'ui') { // Menu bip
        osc.type = 'sine'; osc.frequency.setValueAtTime(800, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.05, audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
        osc.start(); osc.stop(audioCtx.currentTime + 0.1);
    }
}
// Vindstøj generator
const bufferSize = audioCtx.sampleRate * 2;
const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
const data = buffer.getChannelData(0);
for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
const windNoise = audioCtx.createBufferSource();
windNoise.buffer = buffer; windNoise.loop = true;
const windGain = audioCtx.createGain(); windGain.gain.value = 0.05;
windNoise.connect(windGain); windGain.connect(audioCtx.destination);

// --- GAME STATE ---
let gameState = { hp: 100, hunger: 100, thirst: 100, dead: false, time: 12.0 };
let inventory = ['Bønner', 'Bandage']; // Start items
let holdingItem = null;
let buildings = []; // Gemmer vægge osv

// --- PLAYER CONTROLS ---
const controls = new PointerLockControls(camera, document.body);
const player = controls.getObject(); // convenience reference for vertical movement
// Initial player height and allow jump at start
player.position.y = 1.6;
const moveSpeed = 5.0;
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();
let canJump = true;
let raycaster = new THREE.Raycaster();

// Værktøjs Model (Højre Hånd)
const handGroup = new THREE.Group();
camera.add(handGroup);
handGroup.position.set(0.5, -0.4, -0.8); // Placering i skærmen

// Lav en primitiv økse
const axeGeo = new THREE.BoxGeometry(0.1, 0.6, 0.1);
const axeMat = new THREE.MeshStandardMaterial({ color: 0x8B4513 }); 
const axeHandle = new THREE.Mesh(axeGeo, axeMat);
const axeBlade = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.3), new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.2 }));
axeBlade.position.y = 0.25; axeBlade.position.z = 0.05;
const axeModel = new THREE.Group();
axeModel.add(axeHandle); axeModel.add(axeBlade);
handGroup.add(axeModel);
axeModel.visible = false; // Skjult indtil man finder en økse (eller crafter den)

// --- WORLD GENERATION (TERRAIN) ---
const floorGeo = new THREE.PlaneGeometry(200, 200, 100, 100);
// Simpel støj til bakker
const posAttr = floorGeo.attributes.position;
for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const y = posAttr.getY(i);
    // Lav en sø i midten
    const dist = Math.sqrt(x*x + y*y);
    let z = Math.sin(x/20) * Math.cos(y/20) * 2; 
    if(dist < 30) z = -2; // SØEN
    posAttr.setZ(i, z);
}
floorGeo.computeVertexNormals();
const floorMat = new THREE.MeshStandardMaterial({ color: 0x2e4a28, roughness: 1.0 }); // Mat jord
const floor = new THREE.Mesh(floorGeo, floorMat);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// Vand
const waterGeo = new THREE.CircleGeometry(30, 32);
const waterMat = new THREE.MeshStandardMaterial({ color: 0x2244aa, roughness: 0.1, transparent: true, opacity: 0.8 });
const water = new THREE.Mesh(waterGeo, waterMat);
water.rotation.x = -Math.PI / 2;
water.position.y = -0.5; // Lidt under jorden for at undgå flimmer
scene.add(water);

// Træer & Sten
const trees = [];
const treeGeo = new THREE.ConeGeometry(1, 6, 8);
const treeMat = new THREE.MeshStandardMaterial({ color: 0x1a2e1a, roughness: 1.0 });
const trunkGeo = new THREE.CylinderGeometry(0.3, 0.3, 2, 8);
const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3d2817 });

for(let i=0; i<300; i++) {
    const x = (Math.random() - 0.5) * 180;
    const z = (Math.random() - 0.5) * 180;
    if(Math.sqrt(x*x + z*z) < 35) continue; // Ingen træer i søen

    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.set(x, 1, z);
    trunk.castShadow = true; trunk.receiveShadow = true;
    
    const leaves = new THREE.Mesh(treeGeo, treeMat);
    leaves.position.set(0, 3, 0);
    leaves.castShadow = true;
    trunk.add(leaves);
    
    scene.add(trunk);
    trees.push(trunk);
}

// Bilen (Dry Van) - Base
const carGroup = new THREE.Group();
const carBody = new THREE.Mesh(new THREE.BoxGeometry(4, 2.5, 8), new THREE.MeshStandardMaterial({ color: 0xaaaaaa }));
carBody.position.y = 1.25;
carBody.castShadow = true;
carGroup.add(carBody);
carGroup.position.set(40, 0, 0); // Lidt væk fra søen
scene.add(carGroup);

// --- LIGHTING ---
const ambientLight = new THREE.AmbientLight(0x404040, 0.5); // Gråt basislys
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xffaa33, 1);
sunLight.position.set(50, 50, 50);
sunLight.castShadow = true;
sunLight.shadow.mapSize.width = 2048; 
sunLight.shadow.mapSize.height = 2048;
scene.add(sunLight);

// Bållys (Dynamisk)
const fireLight = new THREE.PointLight(0xff6600, 0, 20); // Starter slukket
fireLight.position.set(45, 1, 0);
scene.add(fireLight);

// --- INPUT & UI LOGIC ---
// Styring af bevægelse
const moveState = { forward: false, backward: false, left: false, right: false };

document.addEventListener('keydown', (event) => {
    // Support both event.code and event.key for broader browser compatibility
    const code = event.code || '';
    const key = event.key || '';

    if (code === 'KeyW' || key === 'w' || key === 'W') moveState.forward = true;
    if (code === 'KeyA' || key === 'a' || key === 'A') moveState.left = true;
    if (code === 'KeyS' || key === 's' || key === 'S') moveState.backward = true;
    if (code === 'KeyD' || key === 'd' || key === 'D') moveState.right = true;

    // Jump (Space)
    if (code === 'Space' || key === ' ' || key === 'Spacebar') {
        console.log('Jump key pressed, canJump=', canJump);
        if (canJump === true) {
            velocity.y = 8; // initial upward velocity (m/s)
            canJump = false;
        }
    }

    // Eksisterende knapper
    if (code === 'Tab' || key === 'Tab') {
        event.preventDefault();
        const inv = document.getElementById('inventory');
        if (inv) {
            inv.style.display = inv.style.display === 'none' ? 'flex' : 'none';
            updateInventoryUI();
            if(inv.style.display === 'flex') controls.unlock(); else controls.lock();
        }
    }

    if (code === 'KeyE' || key === 'e' || key === 'E') tryInteract();
});

document.addEventListener('keyup', (event) => {
    switch (event.code) {
        case 'KeyW': moveState.forward = false; break;
        case 'KeyA': moveState.left = false; break;
        case 'KeyS': moveState.backward = false; break;
        case 'KeyD': moveState.right = false; break;
    }
});

// Mus klik (Hugge / Fiske / Bygge)
document.addEventListener('mousedown', () => {
    if (!controls.isLocked) return;

    // Do not handle axe if building or fishing input is expected
    if (buildMode || holdingItem === 'rod') return;

    // Animation (axe / interaction)
    if(handGroup.children.length > 0) {
        handGroup.rotation.x = -0.5;
        setTimeout(() => handGroup.rotation.x = 0, 150);
        playSound('chop');
        
        // Check Hit
        raycaster.setFromCamera(new THREE.Vector2(0,0), camera);
        const intersects = raycaster.intersectObjects(trees);
        if(intersects.length > 0 && intersects[0].distance < 3) {
            inventory.push('Træ');
            showInteraction("Fik 1x Træ");
        }
    }
});

// --- CORE FUNCTIONS ---
function tryInteract() {
    raycaster.setFromCamera(new THREE.Vector2(0,0), camera);
    const intersects = raycaster.intersectObjects([water, carBody]);
    if(intersects.length > 0 && intersects[0].distance < 4) {
        const hit = intersects[0].object;
        if(hit === water) {
            gameState.thirst = 100;
            showInteraction("Drak vand (Risiko for bakterier!)");
        } else if(hit === carBody) {
             if (questItems.length === 0) {
                 document.getElementById('interaction-text').style.color = "#0f0";
                 showInteraction("RADIO REPARERET! TILKALDER HELIKOPTER...");
                 let winLoop = setInterval(() => playSound('ui'), 200);
                 setTimeout(() => {
                     clearInterval(winLoop);
                     alert("HELIKOPTEREN ER LANDET. DU OVERLEVEDE!");
                     location.reload();
                 }, 5000);
             } else {
                 showInteraction(`Mangler stadig dele... (${questItems.length} tilbage)`);
             }
        }
    }
}

function showInteraction(text) {
    const el = document.getElementById('interaction-text');
    el.innerText = text;
    setTimeout(() => el.innerText = "", 2000);
}

function updateInventoryUI() {
    const grid = document.getElementById('inv-grid');
    grid.innerHTML = "";
    inventory.forEach(item => {
        const div = document.createElement('div');
        div.className = 'inv-slot';
        div.innerText = item;
        div.onclick = () => {
            if(item === 'Bønner') { gameState.hunger = Math.min(100, gameState.hunger + 30); inventory.splice(inventory.indexOf(item), 1); updateInventoryUI(); }
            if(item === 'Sten-Økse') { axeModel.visible = true; holdingItem = 'axe'; controls.lock(); }
        };
        grid.appendChild(div);
    });
}



// --- GAME LOOP ---
const clock = new THREE.Clock();
function animate() {
    if(gameState.dead) return;

    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    const time = Date.now() * 0.0005;

// Fysik & Bevægelse
    if (controls.isLocked) {
        // Beregn retning baseret på WASD
        direction.z = Number(moveState.forward) - Number(moveState.backward);
        direction.x = Number(moveState.right) - Number(moveState.left);
        direction.normalize(); // Sørger for at man ikke løber hurtigere skråt

        // Headbob & Lyd
        if (moveState.forward || moveState.backward || moveState.left || moveState.right) {
            velocity.z -= direction.z * 400.0 * delta;
            velocity.x -= direction.x * 400.0 * delta;
            
            // Headbob effekt
            camera.position.y += Math.sin(time * 15) * 0.005;
            if(Math.sin(time * 15) < -0.9) playSound('step'); // Fodtrin
        }

        controls.moveRight(-velocity.x * delta);
        controls.moveForward(-velocity.z * delta); // NB: Forward i Three.js er negativ Z

        // Vertical physics (gravity & jumping)
        // Apply gravity
        velocity.y -= 20.0 * delta; // tweak gravity strength as needed

        // Move player vertically
        player.position.y += velocity.y * delta;

        // Ground collision
        const groundY = 1.6; // typical eye height above ground
        if (player.position.y <= groundY) {
            velocity.y = 0;
            player.position.y = groundY;
            canJump = true;
        }

        velocity.x -= velocity.x * 10.0 * delta; // Glidende stop
        velocity.z -= velocity.z * 10.0 * delta;
    }

    // Dag / Nat Cyklus
    gameState.time += delta * 0.1; // Tiden går
    const sunY = Math.sin(gameState.time * 0.5) * 100;
    sunLight.position.y = sunY;
    
    // Farver ændres baseret på tid
    if(sunY < 0) { // Nat
        scene.fog.color.setHex(0x000000);
        sunLight.intensity = 0;
        fireLight.intensity = 2 + Math.sin(time * 10)*0.5; // Bål flakker
    } else { // Dag
        scene.fog.color.setHex(0x111111);
        sunLight.intensity = 1;
        fireLight.intensity = 0;
    }

    // Survival Stats (Dø langsomt)
    gameState.hunger -= delta * 0.5;
    gameState.thirst -= delta * 0.8;
    
    // Opdater UI
    document.getElementById('hp-val').innerText = Math.floor(gameState.hp);
    document.getElementById('food-val').innerText = Math.floor(gameState.hunger);
    document.getElementById('water-val').innerText = Math.floor(gameState.thirst);

    // Dødstjek
    if(gameState.hp <= 0 || gameState.hunger <= 0 || gameState.thirst <= 0) {
        gameState.dead = true;
        document.getElementById('death-screen').style.display = 'flex';
        document.getElementById('ui-layer').style.display = 'none';
        
        // Cinematic Death Camera
        camera.rotation.z = Math.PI / 2; // Vælt omkuld
        camera.position.y = 0.5;
        composer.passes.forEach(pass => pass.enabled = false); // Sluk effekter
    }

    // --- Per-frame build / radio signal logic ---
    try {
        updateGhost();

        const signalEl = document.getElementById('signal-strength');
        if (signalEl) {
            if(questItems.length > 0) {
                let dist = Infinity;
                questItems.forEach(item => {
                    const d = camera.position.distanceTo(item.position);
                    if (d < dist) dist = d;
                });
                if(dist < 10) signalEl.innerText = "_/\\_ (MEGET TÆT PÅ!)";
                else if(dist < 30) signalEl.innerText = "--/-- (Tæt på)";
                else if(dist < 60) signalEl.innerText = "___-_ (Svagt signal)";
                else signalEl.innerText = "_____ (Intet signal)";
            } else {
                signalEl.innerText = "ALLE DELE FUNDET! GÅ TIL BILEN!";
            }
        }
    } catch(e) { console.warn('Per-frame UI update failed', e); }

    // Process fishing (uses delta)
    try { processFishing(delta); } catch(e) { console.warn('processFishing error', e); }

    // Quest pickup: remove quest items when player is very close
    try {
        for (let i = questItems.length - 1; i >= 0; i--) {
            const item = questItems[i];
            const d = camera.position.distanceTo(item.position);
            if (d < 2) {
                scene.remove(item);
                questItems.splice(i, 1);
                playSound('ui');
                showInteraction('FANDT EN RADIO DEL!');
            }
        }
    } catch(e) { console.warn('quest pickup error', e); }

    // Opdater Monster AI
    try { updateMonster(delta); } catch(e) { console.warn('updateMonster error', e); }

    // RENDER (Med Post-Processing)
    composer.render();
}

// --- MENU / UI BUTTONS ---
const startBtn = document.getElementById('btn-start');
const controlsBtn = document.getElementById('btn-controls');

if (startBtn) startBtn.addEventListener('click', () => {
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('ui-layer').style.display = 'block';
    if (audioCtx.state === 'suspended') audioCtx.resume();
    try { windNoise.start(); } catch (e) {}
    controls.lock();
    animate();
});

if (controlsBtn) controlsBtn.addEventListener('click', () => {
    const controlsText = "Styring:\nWASD - Bevægelse\nSpace - Hop\nMouse - Kig rundt\nE - Interagér\nTab - Rygsæk";
    alert(controlsText);
    if (audioCtx.state === 'suspended') audioCtx.resume();
    playSound('ui');
});

// --- MODUL 4: BYGGERI & QUEST SYSTEM ---

// 1. Variabler til byggeri
let buildMode = null; // Hvad bygger vi lige nu? (f.eks. 'wall')
let ghostMesh = null; // Den gennemsigtige blå model

// Lav "Ghost" materialet (Gennemsigtig blå)
const ghostMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, wireframe: true, transparent: true, opacity: 0.5 });

// Start byggeri (Kaldes når du trykker på knapperne i inventory)
function startBuild(type) {
    if(buildMode) scene.remove(ghostMesh); // Fjern gammel ghost
    buildMode = type;
    
    // Lav den rigtige form baseret på hvad vi bygger
    let geo;
    if(type === 'fire') geo = new THREE.CylinderGeometry(0.5, 0.5, 0.5, 8);
    else if(type === 'wall') geo = new THREE.BoxGeometry(4, 3, 0.5);
    
    ghostMesh = new THREE.Mesh(geo, ghostMat);
    scene.add(ghostMesh);
    
    // Luk inventory så vi kan se
    document.getElementById('inventory').style.display = 'none';
    controls.lock();
}

// Opdater Ghost position (Kør denne i animate loopet)
function updateGhost() {
    if(!buildMode || !ghostMesh) return;

    // Placer ghost 5 meter foran spilleren
    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);
    const targetPos = camera.position.clone().add(direction.multiplyScalar(5));
    
    // "Snap" til jorden (Y = 0 + halv højde)
    targetPos.y = (buildMode === 'wall') ? 1.5 : 0.25; 
    
    // Rotation (Muren skal rotere med spilleren)
    ghostMesh.position.copy(targetPos);
    ghostMesh.rotation.y = Math.atan2(direction.x, direction.z);
    
    // Tjek om det er lovligt (bliver rød hvis for tæt på træer)
    // (For simpelheds skyld: Altid blå i denne version)
}

// Placer objektet (Ved klik)
function placeBuilding() {
    if(!buildMode || !ghostMesh) return;
    
    // Lav det rigtige objekt
    if(buildMode === 'fire') {
        // Lav bålet (Visuelt + Lys)
        const fireWood = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.5, 8), new THREE.MeshStandardMaterial({color: 0x442200}));
        fireWood.position.copy(ghostMesh.position);
        scene.add(fireWood);
        
        // Tilføj lyset
        const light = new THREE.PointLight(0xff6600, 1, 15);
        light.position.set(0, 1, 0);
        fireWood.add(light);
        
        // Partikler (Ild) kan tilføjes her senere
        playSound('chop'); // Brug hug-lyd som bygge-lyd midlertidigt
    } 
    else if(buildMode === 'wall') {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 0.5), new THREE.MeshStandardMaterial({color: 0x5c4033}));
        wall.position.copy(ghostMesh.position);
        wall.rotation.copy(ghostMesh.rotation);
        wall.castShadow = true; wall.receiveShadow = true;
        scene.add(wall);
        playSound('chop');
    }

    // Ryd op
    scene.remove(ghostMesh);
    buildMode = null;
    ghostMesh = null;
}

// 2. QUEST SYSTEM: Radio Delene
const questItems = [];
function spawnQuestItems() {
    // Vi gemmer 3 dele ude i skoven
    const positions = [
        {x: -60, z: -60, name: 'Radio Batteri'}, // Langt væk i hjørnet
        {x: 60, z: -40, name: 'Antenne Kabel'},  // Det modsatte hjørne
        {x: 0, z: -80, name: 'Frekvens Modul'}   // Dybt inde i skoven
    ];

    positions.forEach(pos => {
        // Lav en lille rød kasse som Quest Item
        const geo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
        const mat = new THREE.MeshBasicMaterial({ color: 0xff0000 }); // Rød = Vigtig
        const item = new THREE.Mesh(geo, mat);
        item.position.set(pos.x, 0.5, pos.z);
        
        // Tilføj et svagt lys så man kan finde den i mørke
        const light = new THREE.PointLight(0xff0000, 1, 5);
        item.add(light);
        
        item.userData = { isQuestItem: true, name: pos.name };
        scene.add(item);
        questItems.push(item);
    });
}

// Start missionen med det samme
spawnQuestItems();

// --- CRAFTING KNAPPER ---
document.getElementById('craft-axe').addEventListener('click', () => {
    if(inventory.includes('Træ')) {
        inventory.push('Sten-Økse'); 
        inventory.splice(inventory.indexOf('Træ'), 1);
        updateInventoryUI();
    }
});

// NYT: Byg Bål
document.getElementById('craft-fire').addEventListener('click', () => {
    if(inventory.filter(i => i === 'Træ').length >= 4) {
        // Fjern 4 træ
        for(let i=0; i<4; i++) inventory.splice(inventory.indexOf('Træ'), 1);
        updateInventoryUI();
        startBuild('fire'); // Start Ghost mode
    } else {
        alert("Mangler Træ! (Kræver 4)");
    }
});

// NYT: Byg Mur
document.getElementById('craft-wall').addEventListener('click', () => {
    if(inventory.filter(i => i === 'Træ').length >= 4) {
        for(let i=0; i<4; i++) inventory.splice(inventory.indexOf('Træ'), 1);
        updateInventoryUI();
        startBuild('wall');
    } else {
        alert("Mangler Træ! (Kræver 4)");
    }
});

// (Per-frame build/radio/interaction logic moved into the animate loop)

let monster = null;
const monsterSpeed = 3.5; // Lidt langsommere end spilleren (som løber 5.0)

function updateMonster(delta) {
    // 1. TJEK TIDSPUNKT (Er det nat?)
    // Solens Y-position er negativ om natten
    const isNight = sunLight.position.y < 0;

    // SPAWN LOGIK
    if (isNight && !monster) {
        spawnMonster();
    } else if (!isNight && monster) {
        // Solen står op -> Monsteret brænder op/forsvinder
        scene.remove(monster);
        monster = null;
        // Fjern blod-effekt hvis den var der
        document.getElementById('blood-vignette').style.opacity = 0;
        return; 
    }

    // Hvis der ikke er noget monster nu, så stop her
    if (!monster) return;

    // 2. BEVÆGELSE (Stalking AI)
    const dist = monster.position.distanceTo(camera.position);
    
    // Få monsteret til at kigge på spilleren (men kun horisontalt)
    monster.lookAt(camera.position.x, 1, camera.position.z);

    // Hvis den er meget langt væk, teleporterer den tættere på (for at holde presset oppe)
    if (dist > 60) {
        const angle = Math.random() * Math.PI * 2;
        monster.position.x = camera.position.x + Math.cos(angle) * 30;
        monster.position.z = camera.position.z + Math.sin(angle) * 30;
    }

    // Bevægelse mod spilleren
    if (dist > 2) {
        // Den bevæger sig fremad
        monster.translateZ(monsterSpeed * delta);
        
        // Lav en tung fodtrin-lyd, hvis den er tæt på
        if (Math.random() < 0.05 && dist < 15) {
            playSound('chop'); // Genbrug af "Thud" lyden
        }
    } else {
        // 3. ANGREB (Hvis den er helt tæt på)
        gameState.hp -= delta * 20; // Mister 20 liv i sekundet!
        gameState.hp = Math.max(0, gameState.hp); // Prevent negative HP
        
        // Visuel Feedback (Skærmen bliver rød)
        const vignette = document.getElementById('blood-vignette');
        vignette.style.opacity = (100 - gameState.hp) / 50; // Jo mindre liv, jo mere rød
        vignette.style.boxShadow = "inset 0 0 100px rgba(255,0,0,0.8)";
        
        // Skub spilleren lidt tilbage (Knockback)
        camera.position.x += (camera.position.x - monster.position.x) * 0.1;
        camera.position.z += (camera.position.z - monster.position.z) * 0.1;
    }
}

function spawnMonster() {
    // Lav modellen (Simpel men uhyggelig)
    const geo = new THREE.CapsuleGeometry(0.6, 2.5, 4, 8); // Høj og tynd
    const mat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 }); // Kulsort
    monster = new THREE.Mesh(geo, mat);
    
    // Giv den lysende øjne
    const eyeGeo = new THREE.SphereGeometry(0.1);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff0000 }); // Rød
    
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-0.2, 0.8, 0.5); // Venstre øje
    monster.add(eyeL);

    const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeR.position.set(0.2, 0.8, 0.5); // Højre øje
    monster.add(eyeR);

    // Spawn et tilfældigt sted i tågen (20 meter væk)
    const angle = Math.random() * Math.PI * 2;
    monster.position.set(
        camera.position.x + Math.cos(angle) * 30,
        1.5, // Højde
        camera.position.z + Math.sin(angle) * 30
    );
    
    monster.castShadow = true;
    scene.add(monster);
    
    // Chat besked (For debugging/uhygge)
    showInteraction("Noget rører på sig i mørket...");
}

// Monster AI is updated from the main animate loop

// Fiskeri variabler
let fishing = { active: false, bobber: null, waitTime: 0, bite: false };

function castLine() {
    if(fishing.active) {
        // Hiv ind!
        if(fishing.bite) {
            inventory.push('Rå Ørred');
            showInteraction("Fangede en Ørred!");
            playSound('ui'); // "Ding" lyd
        } else {
            showInteraction("Hentede snøren ind (intet bid)");
        }
        
        // Ryd op
        scene.remove(fishing.bobber);
        fishing.active = false;
        fishing.bobber = null;
        
    } else {
        // Kast ud!
        fishing.active = true;
        fishing.bite = false;
        fishing.waitTime = 2 + Math.random() * 5; // Vent 2-7 sekunder
        
        // Lav proppen visuelt
        const geo = new THREE.BoxGeometry(0.2, 0.2, 0.2);
        const mat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        fishing.bobber = new THREE.Mesh(geo, mat);
        
        // Placer den ude i vandet (simpelt hack: 10 meter foran kameraet)
        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        fishing.bobber.position.copy(camera.position).add(dir.multiplyScalar(8));
        fishing.bobber.position.y = -0.4; // I vandoverfladen
        scene.add(fishing.bobber);
        
        showInteraction("Venter på bid...");
    }
}

document.addEventListener('mousedown', () => {
    if(controls.isLocked) {
        // Hvis vi bygger:
        if(buildMode) { placeBuilding(); return; }

        // NYT: Hvis vi holder fiskestangen (du skal huske at crafte den først!)
        if(holdingItem === 'rod') {
            castLine();
            return;
        }

        // Ellers: Hug med øksen (Den gamle kode)
        if(handGroup.children.length > 0) {
            // ... (din gamle hugge-kode her) ...
             handGroup.rotation.x = -0.5;
            setTimeout(() => handGroup.rotation.x = 0, 150);
            playSound('chop');
            // ...
        }
    }
});

// Fiskeri Logik
// Process fishing per-frame. Called from animate(delta).
function processFishing(delta) {
    if (!fishing.active) return;
    fishing.waitTime -= delta;
    if (fishing.waitTime <= 0 && !fishing.bite) {
        fishing.bite = true;
        if (fishing.bobber) fishing.bobber.position.y = -1.0;
        playSound('ui');
        showInteraction("BID! KLIK NU!");
        setTimeout(() => {
            if (fishing.active && !fishing.bite) return; // already handled
            if (fishing.active && fishing.bite) {
                // if user didn't click in time, fish escapes
                if (fishing.active) {
                    showInteraction("Fisken slap væk...");
                    if (fishing.bobber) scene.remove(fishing.bobber);
                    fishing.active = false;
                }
            }
        }, 1500);
    }
}

// Hjælpefunktion til at fjerne 1 ting
function removeItem(name) {
    const idx = inventory.indexOf(name);
    if (idx !== -1) inventory.splice(idx, 1);
    updateInventoryUI();
}

// Note: quest pickup and victory checks are handled per-frame inside `animate()` (signal UI already present).