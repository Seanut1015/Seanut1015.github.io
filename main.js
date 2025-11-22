import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ... (Your imports at the top) ...

// --- AUDIO MANAGER CLASS ---
class AudioManager {
    constructor() {
        this.bgmVolumeSlider = document.getElementById('bgm-volume');
        this.seVolumeSlider = document.getElementById('se-volume');
        this.bgmAudio = document.getElementById('bgm-audio');
        this.winSoundPlayed = false;

        // 將遊戲事件名稱映射到 audio 元素
        this.seMap = {
            'place_mark': document.getElementById('se-place-mark'),
            'win': document.getElementById('se-win'),
            'lose': document.getElementById('se-lose'),
            'menu_click': document.getElementById('se-menu-click')
        };
        
        // **!!! 請確保您的音檔路徑正確 !!!**
        this.bgmAudio.src = '/audio/bgm.mp3'; 
        this.seMap['place_mark'].src = '/audio/se_place_mark.wav';
        this.seMap['win'].src = '/audio/se_win.wav';
        this.seMap['lose'].src = '/audio/se_lose.wav';
        this.seMap['menu_click'].src = '/audio/se_menu_click.wav';


        this.loadSettings();
        this.addEventListeners();
    }

    loadSettings() {
        // 從 LocalStorage 載入音量設定 (記憶音量)
        let bgmVolume = localStorage.getItem('bgmVolume');
        let seVolume = localStorage.getItem('seVolume');

        if (bgmVolume !== null) {
            this.bgmVolumeSlider.value = bgmVolume;
        }
        if (seVolume !== null) {
            this.seVolumeSlider.value = seVolume;
        }

        // 初始化所有音訊元素的音量
        this.updateBGMVolume(this.bgmVolumeSlider.value);
        this.updateSEVolume(this.seVolumeSlider.value);
    }

    saveSettings() {
        localStorage.setItem('bgmVolume', this.bgmVolumeSlider.value);
        localStorage.setItem('seVolume', this.seVolumeSlider.value);
    }

    addEventListeners() {
        // BGM 音量調整
        this.bgmVolumeSlider.addEventListener('input', (e) => {
            this.updateBGMVolume(e.target.value);
            this.saveSettings();
        });

        // SE 音量調整
        this.seVolumeSlider.addEventListener('input', (e) => {
            this.updateSEVolume(e.target.value);
            this.saveSettings();
        });
        
        // --- 選單點擊音效 (應用在所有大廳和選色按鈕上) ---
        document.querySelectorAll('button:not(.color-btn)').forEach(btn => {
            btn.addEventListener('click', () => this.playSE('menu_click'));
        });
    }

    updateBGMVolume(volume) {
        this.bgmAudio.volume = parseFloat(volume);
    }

    updateSEVolume(volume) {
        const floatVolume = parseFloat(volume);
        for (const key in this.seMap) {
            this.seMap[key].volume = floatVolume;
        }
    }

    startBGM() {
        if (this.bgmAudio.paused) {
            // 處理瀏覽器自動播放限制 (可能需要用戶點擊頁面後才能播放)
            this.bgmAudio.play().catch(error => {
                console.warn("BGM autoplay failed, waiting for user interaction:", error);
            });
        }
    }

    stopBGM() {
        this.bgmAudio.pause();
    }

    playSE(event) {
        const audio = this.seMap[event];
        if (audio) {
            // 重置播放，確保音效可以疊加播放 (例如快速點擊)
            audio.currentTime = 0;
            audio.play().catch(error => {
                console.warn(`Failed to play ${event} SE:`, error);
            });
        }
    }
}

const audioManager = new AudioManager(); 
// --- AUDIO MANAGER 結束 ---

// ... (Your existing global variables and DOM elements) ...
// --- DOM Elements ---
const loginScreen = document.getElementById('login-screen');
const roomScreen = document.getElementById('room-selection-screen');
const lobbyContainer = document.getElementById('lobby-container');
const waitingOverlay = document.getElementById('waiting-room-overlay');
const gameView = document.getElementById('game-view');

const usernameInput = document.getElementById('username-input');
const loginBtn = document.getElementById('login-btn');
const loginError = document.getElementById('login-error');
const playerDisplay = document.getElementById('player-display');
const roomList = document.getElementById('room-list');
const createRoomBtn = document.getElementById('create-room-btn');

const roomIdDisplay = document.getElementById('room-id-display');
const waitingStatus = document.getElementById('waiting-status');
const playerListDiv = document.getElementById('player-list');
const startGameBtn = document.getElementById('start-game-btn');
const leaveRoomBtn = document.getElementById('leave-room-btn');

// Game UI
const setupModalBackdrop = document.getElementById('setup-modal-backdrop');
const setupTitle = document.getElementById('setup-title');
const colorPicker = document.getElementById('color-picker');
const colorBtns = document.querySelectorAll('.color-btn');
const gameMessage = document.getElementById('game-message');
const infoElement = document.getElementById('info');
const resetButton = document.getElementById('reset-button');
const voteCountSpan = document.getElementById('vote-count');

// --- State ---
let myPlayerId = null;
let myPlayerNumber = null;
let currentGameState = {};
let isThreeJsInitialized = false;

// --- WebSocket Setup ---
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsURL = `wss://threedoxg.onrender.com/ws`; // 改為固定路徑，不帶ID
const ws = new WebSocket(wsURL);

ws.onopen = () => {
    console.log("Connected to server");
};

ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    handleServerMessage(data);
};

function handleServerMessage(data) {
    switch (data.type) {
        case 'LOGIN_SUCCESS':
            myPlayerId = data.player_id;
            loginScreen.classList.add('hidden');
            roomScreen.classList.remove('hidden');
            playerDisplay.innerText = `(${myPlayerId})`;
            break;
        
        case 'ERROR':
            alert(data.message);
            if (data.message === "ID already taken") loginError.innerText = data.message;
            break;

        case 'ROOM_LIST':
            renderRoomList(data.rooms);
            break;

        case 'GAME_STATE':
            updateGameState(data);
            break;
    }
}

// --- Lobby Logic ---
loginBtn.addEventListener('click', () => {
    const id = usernameInput.value.trim();
    if (id) ws.send(JSON.stringify({ type: 'LOGIN', player_id: id }));
});

createRoomBtn.addEventListener('click', () => {
    ws.send(JSON.stringify({ type: 'CREATE_ROOM' }));
});

leaveRoomBtn.addEventListener('click', () => {
    ws.send(JSON.stringify({ type: 'LEAVE_ROOM' }));
    // 回到大廳 UI
    waitingOverlay.classList.add('hidden');
    gameView.classList.add('hidden');
    lobbyContainer.classList.remove('hidden');
    
    // 隱藏 canvas
    if (renderer) renderer.domElement.style.display = 'none';
});

startGameBtn.addEventListener('click', () => {
    ws.send(JSON.stringify({ type: 'START_GAME' }));
});


function renderRoomList(rooms) {
    roomList.innerHTML = '';
    
    if (rooms.length === 0) {
        // 空狀態顯示
        roomList.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; color: #666; margin-top: 50px;">
                <h3>No active rooms found</h3>
                <p>Create a new room to get started!</p>
            </div>
        `;
        return;
    }

    rooms.forEach(room => {
        // 建立卡片元素
        const card = document.createElement('div');
        card.className = 'room-card';
        
        // 卡片內容
        card.innerHTML = `
            <div class="room-status-badge">
                Waiting (${room.count}/2)
            </div>
            <div class="room-info">
                <h3>Room ${room.id}</h3>
                <p>👤 Host: ${room.host}</p>
            </div>
            <button class="room-join-btn" onclick="joinRoom('${room.id}')">
                Join Game
            </button>
        `;
        
        roomList.appendChild(card);
    });
}

// 暴露給全域以便 HTML onclick 調用
window.joinRoom = (roomId) => {
    ws.send(JSON.stringify({ type: 'JOIN_ROOM', room_id: roomId }));
};

function updateGameState(state) {
    currentGameState = state;
    if (state.your_player_number) myPlayerNumber = state.your_player_number;

    // 1. 控制視圖顯示
    lobbyContainer.classList.add('hidden');
    
    if (!state.is_playing) {
        // --- 等待室階段 ---
        waitingOverlay.classList.remove('hidden');
        gameView.classList.add('hidden');
        if (renderer) renderer.domElement.style.display = 'none';

        roomIdDisplay.innerText = `Room: ${state.room_id}`;
        playerListDiv.innerHTML = state.players_info.map(p => `<div class="player-tag">${p.name}</div>`).join('');
        
        waitingStatus.innerText = state.player_count < 2 ? "Waiting for opponent..." : "Ready to start!";
        
        // 只有房主且滿人時顯示開始按鈕
        if (state.is_host && state.player_count === 2) {
            startGameBtn.classList.remove('hidden');
            startGameBtn.disabled = false;
        } else {
            startGameBtn.classList.add('hidden');
        }

        audioManager.stopBGM();
    } else {
        // --- 遊戲進行階段 ---
        waitingOverlay.classList.add('hidden');
        gameView.classList.remove('hidden');
        
        // 初始化 Three.js (如果還沒)
        if (!isThreeJsInitialized) {
            initThreeJS();
            isThreeJsInitialized = true;
            audioManager.startBGM(); // Three.js 初始化後播放 BGM
        }
        renderer.domElement.style.display = 'block'; // 顯示 canvas

        updateGameUI(state);
        updateBoard(state);
        
    }
}

// --- Three.js Logic (被封裝起來) ---
let scene, camera, renderer, controls, raycaster, group;
let pointer = new THREE.Vector2();
let objects = [];
const spacing = 2;
const gridSize = 4;
let hoveredObject = null;
let outlineSprite = null;

function initThreeJS() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement); // Canvas 是全螢幕的，我們用 CSS z-index 控制層級

    controls = new OrbitControls(camera, renderer.domElement);
    raycaster = new THREE.Raycaster();

    // 初始化棋盤 (placeholder)
    group = new THREE.Group();
    for (let i = 0; i < gridSize; i++) { for (let j = 0; j < gridSize; j++) { for (let k = 0; k < gridSize; k++) {
        const geometry = new THREE.SphereGeometry(0.5, 16, 8);
        const material = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.15 });
        const sphere = new THREE.Mesh(geometry, material);
        sphere.position.set(i * spacing, j * spacing, k * spacing);
        sphere.userData = { x: i, y: j, z: k, type: 'placeholder' };
        group.add(sphere); objects.push(sphere);
    }}}
    scene.add(group);

    // Center Logic
    const box = new THREE.Box3().setFromObject(group);
    const center = box.getCenter(new THREE.Vector3());
    group.position.sub(center);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 7.5);
    scene.add(directionalLight);
    camera.position.z = 15;

    // Events
    window.addEventListener('click', onPointerClick);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('resize', () => {
        renderer.setSize(window.innerWidth, window.innerHeight);
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
    });

    animate();
}

function animate() {
    requestAnimationFrame(animate);
    if (controls) controls.update();
    if (renderer && scene && camera) renderer.render(scene, camera);
}

// --- Game UI Update ---
function updateGameUI(state) {
    // 處理選顏色與等待對手選色
    if (!state.game_started) {
        setupModalBackdrop.classList.remove('hidden');
        const myColor = state.player_colors[myPlayerNumber];
        
        if (!myColor) {
            setupTitle.innerText = 'Choose your color';
            gameMessage.innerText = '';
            colorPicker.classList.remove('hidden');
            colorBtns.forEach(btn => {
                const color = btn.dataset.color;
                btn.disabled = state.chosen_colors.includes(color);
                btn.onclick = () => ws.send(JSON.stringify({ type: 'SELECT_COLOR', color: color }));
            });
        } else {
            setupTitle.innerText = 'Waiting for opponent...';
            colorPicker.classList.add('hidden');
            gameMessage.innerText = 'You are ready!';
        }
    } else {
        setupModalBackdrop.classList.add('hidden');
    }

    if (state.game_started && !state.winner) {
        audioManager.winSoundPlayed = false;
    }

    // 顯示回合資訊
    if (state.winner) {
        infoElement.innerText = state.winner === 'Tie' ? "It's a Tie!" : `Player ${state.winner} Wins!`;
        if (state.winner !== 'Tie') {
            // 判斷當前玩家是贏家還是輸家
            // 注意：state.winner 是 '1' 或 '2' 的字串
            const winPlayerNum = state.winner === '1' ? 1 : 2; 

            // 檢查是否是當前瀏覽器的玩家贏了
            if (winPlayerNum === myPlayerNumber) {
                audioManager.playSE('win');
            } else {
                audioManager.playSE('lose');
            }
            audioManager.winSoundPlayed = true;
        }
    } else if (state.game_started) {
        infoElement.innerText = state.turn === myPlayerNumber ? "Your Turn" : `Player ${state.turn}'s Turn`;
    }

    // 投票按鈕
    if (state.game_started) {
        voteCountSpan.classList.remove('hidden');
        voteCountSpan.innerText = `(${state.reset_votes_count}/2)`;
        resetButton.disabled = false;
    }
}

function updateBoard(state) {
    // 清除舊的棋子
    if(group) {
        const toRemove = [];
        group.children.forEach(child => {
            if (child.userData.type === 'move') toRemove.push(child);
        });
        toRemove.forEach(child => group.remove(child));

        // 重新放置棋子
        for (let x = 0; x < 4; x++) {
            for (let y = 0; y < 4; y++) {
                for (let z = 0; z < 4; z++) {
                    if (state.board[x][y][z] !== 0) {
                        const pNum = state.board[x][y][z] === 1 ? 1 : 2;
                        placeMark(x, y, z, pNum, state.player_colors);
                    }
                }
            }
        }
    }
}

function placeMark(x, y, z, player, colors) {
    const geometry = new THREE.SphereGeometry(0.4, 32, 16);
    const colorHex = colors[player];
    if(!colorHex) return;
    
    const material = new THREE.MeshStandardMaterial({ color: parseInt(colorHex, 16), metalness: 0.3, roughness: 0.5 });
    const mark = new THREE.Mesh(geometry, material);
    mark.position.set(x * spacing, y * spacing, z * spacing);
    mark.userData = { type: 'move' };
    group.add(mark);
}

// --- Interaction Logic (Sprite, Click) ---
// (這部分與你原本的邏輯幾乎相同，只是 ws.send 的格式變了)

function createOutlineSprite(colorHex) {
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.beginPath(); ctx.arc(64, 64, 55, 0, 2 * Math.PI);
    ctx.lineWidth = 10; ctx.strokeStyle = `#${colorHex}`; ctx.stroke();
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(1.5, 1.5, 1.0);
    return sprite;
}

function onPointerClick(event) {
    if (!currentGameState.is_playing || currentGameState.turn !== myPlayerNumber || !currentGameState.game_started || currentGameState.winner) return;
    
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = - (event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObjects(objects);

    if (intersects.length > 0) {
        const obj = intersects[0].object;
        if (obj.userData.type === 'placeholder') {
            const { x, y, z } = obj.userData;
            ws.send(JSON.stringify({ type: 'MOVE', move: { x, y, z } }));
            audioManager.playSE('place_mark');
            if (outlineSprite) { group.remove(outlineSprite); outlineSprite = null; }
        }
    }
}

function onPointerMove(event) {
    if(!currentGameState.is_playing) return;
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    pointer.y = - (event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObjects(objects);
    const target = intersects.length > 0 && intersects[0].object.userData.type === 'placeholder' ? intersects[0].object : null;
    
    const canSelect = currentGameState.turn === myPlayerNumber && currentGameState.game_started && !currentGameState.winner;

    if (hoveredObject !== target) {
        if (outlineSprite) { group.remove(outlineSprite); outlineSprite = null; }
        if (target && canSelect) {
            const color = currentGameState.player_colors[myPlayerNumber];
            if(color) {
                outlineSprite = createOutlineSprite(color);
                outlineSprite.position.copy(target.position);
                group.add(outlineSprite);
                hoveredObject = target;
            }
        } else {
            hoveredObject = null;
        }
    }
}

resetButton.addEventListener('click', () => {
    if (!resetButton.disabled) {
        ws.send(JSON.stringify({ type: 'RESET' }));
        resetButton.disabled = true;
    }
});
