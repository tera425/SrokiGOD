(() => {
  'use strict';

  const GRID_SIZE = 20;
  const CELL_SIZE = 1;
  const STEP_INTERVAL_MS_BASE = 140;
  const SPEED_MULTIPLIER_LEVELS = [1, 1.25, 1.5, 1.75, 2];
  let speedLevel = 0;

  const appEl = document.getElementById('app');
  const scoreEl = document.getElementById('score');
  const speedEl = document.getElementById('speed');
  const messageEl = document.getElementById('message');

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0f14);

  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
  const gridWorldSize = GRID_SIZE * CELL_SIZE;
  camera.position.set(gridWorldSize * 0.7, gridWorldSize * 0.9, gridWorldSize * 0.9);
  camera.lookAt(new THREE.Vector3(0, 0, 0));

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  appEl.appendChild(renderer.domElement);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
  dirLight.position.set(0.75, 1.0, 0.5).multiplyScalar(50);
  scene.add(dirLight);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(gridWorldSize + 2, gridWorldSize + 2),
    new THREE.MeshStandardMaterial({ color: 0x0e151b, metalness: 0.1, roughness: 0.9 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0;
  scene.add(floor);

  const gridHelper = new THREE.GridHelper(gridWorldSize, GRID_SIZE, 0x223344, 0x112233);
  gridHelper.material.opacity = 0.55;
  gridHelper.material.transparent = true;
  scene.add(gridHelper);

  const rimMaterial = new THREE.MeshStandardMaterial({ color: 0x1a2a36, metalness: 0.2, roughness: 0.8 });
  const wallHeight = 0.5;
  const rimThickness = 0.3;
  const rimGeometries = [
    new THREE.BoxGeometry(gridWorldSize + 2 * rimThickness, wallHeight, rimThickness),
    new THREE.BoxGeometry(gridWorldSize + 2 * rimThickness, wallHeight, rimThickness),
    new THREE.BoxGeometry(rimThickness, wallHeight, gridWorldSize + 2 * rimThickness),
    new THREE.BoxGeometry(rimThickness, wallHeight, gridWorldSize + 2 * rimThickness)
  ];
  const north = new THREE.Mesh(rimGeometries[0], rimMaterial);
  north.position.set(0, wallHeight / 2, gridWorldSize / 2 + rimThickness / 2);
  const south = new THREE.Mesh(rimGeometries[1], rimMaterial);
  south.position.set(0, wallHeight / 2, -gridWorldSize / 2 - rimThickness / 2);
  const west = new THREE.Mesh(rimGeometries[2], rimMaterial);
  west.position.set(-gridWorldSize / 2 - rimThickness / 2, wallHeight / 2, 0);
  const east = new THREE.Mesh(rimGeometries[3], rimMaterial);
  east.position.set(gridWorldSize / 2 + rimThickness / 2, wallHeight / 2, 0);
  scene.add(north, south, west, east);

  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x35c66a, roughness: 0.4, metalness: 0.3 });
  const headMaterial = new THREE.MeshStandardMaterial({ color: 0x4ff18b, emissive: 0x113322, emissiveIntensity: 0.5, roughness: 0.3, metalness: 0.35 });
  const foodMaterial = new THREE.MeshStandardMaterial({ color: 0xff4d4d, emissive: 0x220000, emissiveIntensity: 0.4, roughness: 0.4, metalness: 0.2 });

  const snakeMeshes = [];
  const snakeGroup = new THREE.Group();
  scene.add(snakeGroup);

  const foodMesh = new THREE.Mesh(new THREE.SphereGeometry(0.4, 20, 20), foodMaterial);
  foodMesh.position.y = 0.5;
  scene.add(foodMesh);

  let gameState = 'ready';
  let direction = { x: 1, z: 0 };
  let nextDirection = { x: 1, z: 0 };
  let snake = [];
  let cellsOccupied = new Set();
  let food = null;
  let score = 0;
  let stepIntervalMs = STEP_INTERVAL_MS_BASE / SPEED_MULTIPLIER_LEVELS[speedLevel];
  let accumulatorMs = 0;
  let lastTime = performance.now();

  function gridToWorld(n) {
    return (n - (GRID_SIZE - 1) / 2) * CELL_SIZE;
  }

  function posKey(x, z) {
    return `${x},${z}`;
  }

  function createSegmentMesh(isHead) {
    const padding = 0.12;
    const geo = new THREE.BoxGeometry(1 - padding, 1 - padding, 1 - padding);
    const mesh = new THREE.Mesh(geo, isHead ? headMaterial : bodyMaterial);
    mesh.position.y = 0.5;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    return mesh;
  }

  function rebuildSnakeMeshes() {
    while (snakeMeshes.length < snake.length) {
      const mesh = createSegmentMesh(false);
      snakeMeshes.push(mesh);
      snakeGroup.add(mesh);
    }
    for (let i = 0; i < snake.length; i++) {
      const mesh = snakeMeshes[i];
      mesh.material = i === 0 ? headMaterial : bodyMaterial;
      mesh.visible = true;
      mesh.position.set(gridToWorld(snake[i].x), 0.5, gridToWorld(snake[i].z));
    }
    for (let i = snake.length; i < snakeMeshes.length; i++) {
      snakeMeshes[i].visible = false;
    }
  }

  function spawnFood() {
    const freeCellsCount = GRID_SIZE * GRID_SIZE - snake.length;
    if (freeCellsCount <= 0) return false;
    let x, z;
    do {
      x = Math.floor(Math.random() * GRID_SIZE);
      z = Math.floor(Math.random() * GRID_SIZE);
    } while (cellsOccupied.has(posKey(x, z)));
    food = { x, z };
    foodMesh.position.set(gridToWorld(x), 0.5, gridToWorld(z));
    return true;
  }

  function resetGame() {
    snake = [];
    cellsOccupied.clear();
    const startX = Math.floor(GRID_SIZE / 2) - 2;
    const startZ = Math.floor(GRID_SIZE / 2);
    for (let i = 0; i < 4; i++) {
      const x = startX + i;
      const z = startZ;
      snake.push({ x, z });
      cellsOccupied.add(posKey(x, z));
    }
    direction = { x: 1, z: 0 };
    nextDirection = { x: 1, z: 0 };
    score = 0;
    speedLevel = 0;
    stepIntervalMs = STEP_INTERVAL_MS_BASE / SPEED_MULTIPLIER_LEVELS[speedLevel];
    updateScoreUI();
    updateSpeedUI();
    rebuildSnakeMeshes();
    spawnFood();
    setMessageVisible(true, '3D Змейка', 'Управление: стрелки или WASD. Пробел — пауза. Enter — старт/рестарт.');
  }

  function setMessageVisible(visible, title, subtitle) {
    if (!messageEl) return;
    messageEl.style.display = visible ? 'block' : 'none';
    if (visible) {
      messageEl.innerHTML = `
        <h1>${title}</h1>
        <p>${subtitle || ''}</p>
        <button id="startBtn">Играть</button>
      `;
      const btn = document.getElementById('startBtn');
      if (btn) {
        btn.addEventListener('click', () => {
          startGame();
        });
      }
    }
  }

  function updateScoreUI() {
    if (scoreEl) scoreEl.textContent = `Счёт: ${score}`;
  }

  function updateSpeedUI() {
    if (speedEl) speedEl.textContent = `Скорость: ${SPEED_MULTIPLIER_LEVELS[speedLevel]}x`;
  }

  function maybeIncreaseSpeed() {
    const thresholds = [5, 10, 18, 28];
    for (let i = SPEED_MULTIPLIER_LEVELS.length - 1; i >= 0; i--) {
      if (score >= (thresholds[i - 1] || 0) && i !== speedLevel) {
        if (score >= thresholds[i - 1]) {
          speedLevel = i;
          stepIntervalMs = STEP_INTERVAL_MS_BASE / SPEED_MULTIPLIER_LEVELS[speedLevel];
          updateSpeedUI();
          break;
        }
      }
    }
  }

  function startGame() {
    gameState = 'playing';
    setMessageVisible(false);
  }

  function gameOver() {
    gameState = 'dead';
    setMessageVisible(true, 'Игра окончена', `Ваш счёт: ${score}<br/>Нажмите Enter или кнопку, чтобы сыграть снова.`);
  }

  function isOpposite(dirA, dirB) {
    return dirA.x === -dirB.x && dirA.z === -dirB.z;
  }

  function handleInputDirectionChange(dir) {
    if (gameState !== 'playing') return;
    if (snake.length > 1 && isOpposite(dir, direction)) return;
    nextDirection = dir;
  }

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Enter') {
      if (gameState === 'ready') {
        startGame();
      } else if (gameState === 'dead') {
        resetGame();
        startGame();
      }
    } else if (e.code === 'Space') {
      if (gameState === 'playing') {
        gameState = 'paused';
        setMessageVisible(true, 'Пауза', 'Нажмите Пробел, чтобы продолжить.');
      } else if (gameState === 'paused') {
        gameState = 'playing';
        setMessageVisible(false);
      }
    } else if (e.code === 'ArrowUp' || e.code === 'KeyW') {
      handleInputDirectionChange({ x: 0, z: -1 });
    } else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
      handleInputDirectionChange({ x: 0, z: 1 });
    } else if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
      handleInputDirectionChange({ x: -1, z: 0 });
    } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
      handleInputDirectionChange({ x: 1, z: 0 });
    }
  });

  window.addEventListener('resize', () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  });

  function updateSnake() {
    direction = nextDirection;

    const newHead = { x: snake[0].x + direction.x, z: snake[0].z + direction.z };

    if (newHead.x < 0 || newHead.x >= GRID_SIZE || newHead.z < 0 || newHead.z >= GRID_SIZE) {
      gameOver();
      return;
    }

    const newHeadKey = posKey(newHead.x, newHead.z);
    const isEating = (food && newHead.x === food.x && newHead.z === food.z);
    const tail = snake[snake.length - 1];
    const tailKey = posKey(tail.x, tail.z);

    const willOverlapSelf = cellsOccupied.has(newHeadKey) && !(newHeadKey === tailKey && !isEating);
    if (willOverlapSelf) {
      gameOver();
      return;
    }

    snake.unshift(newHead);
    cellsOccupied.add(newHeadKey);

    if (isEating) {
      score += 1;
      updateScoreUI();
      maybeIncreaseSpeed();
      if (!spawnFood()) {
        setMessageVisible(true, 'Победа!', `Вы заполнили всё поле. Счёт: ${score}.`);
        gameState = 'dead';
      }
    } else {
      const removed = snake.pop();
      cellsOccupied.delete(posKey(removed.x, removed.z));
    }

    rebuildSnakeMeshes();
  }

  function animate(time) {
    const dt = time - lastTime;
    lastTime = time;

    if (gameState === 'playing') {
      accumulatorMs += dt;
      while (accumulatorMs >= stepIntervalMs) {
        updateSnake();
        accumulatorMs -= stepIntervalMs;
        if (gameState !== 'playing') break;
      }
      foodMesh.position.y = 0.5 + Math.sin(time * 0.005) * 0.08;
    }

    if (snakeMeshes[0]) {
      snakeMeshes[0].rotation.y = Math.atan2(direction.x, direction.z);
    }

    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }

  resetGame();

  requestAnimationFrame((t) => {
    lastTime = t;
    animate(t);
  });

})();