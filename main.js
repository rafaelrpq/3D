import * as THREE from 'three';
// import { AnaglyphEffect } from 'three/examples/jsm/effects/AnaglyphEffect'; // Removed in favor of custom implementation
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

// --- Configuration ---
const ROOM_SIZE = 20;
const WALL_HEIGHT = 3;
const PLAYER_SPEED = 0.07;
const JUMP_FORCE = 0.17;
const GRAVITY = 0.008;

// --- Visual Helpers ---
function addEdges(mesh) {
    const edges = new THREE.EdgesGeometry(mesh.geometry);
    const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x000000 }));
    mesh.add(line);
    return line;
}

// --- Sound Manager (Synthesized) ---
const SoundManager = {
    ctx: new (window.AudioContext || window.webkitAudioContext)(),

    playShot() {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(440, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(110, this.ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.1);
    },

    playExplosion() {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        const bufferSize = this.ctx.sampleRate * 0.2;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.2);
        noise.connect(gain);
        gain.connect(this.ctx.destination);
        noise.start();
    },

    chargeOsc: null,
    chargeGain: null,

    startChargeSound() {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        this.stopChargeSound();

        this.chargeOsc = this.ctx.createOscillator();
        this.chargeGain = this.ctx.createGain();
        this.chargeOsc.type = 'sawtooth';
        this.chargeOsc.frequency.setValueAtTime(110, this.ctx.currentTime);
        this.chargeGain.gain.setValueAtTime(0, this.ctx.currentTime);
        this.chargeGain.gain.linearRampToValueAtTime(0.05, this.ctx.currentTime + 0.1);

        this.chargeOsc.connect(this.chargeGain);
        this.chargeGain.connect(this.ctx.destination);
        this.chargeOsc.start();
    },

    updateChargeSound(progress) {
        if (!this.chargeOsc) return;
        // Frequency goes from 110Hz to 440Hz over charging
        const freq = 110 + progress * 330;
        this.chargeOsc.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.05);
        this.chargeGain.gain.setTargetAtTime(0.05 + progress * 0.05, this.ctx.currentTime, 0.05);
    },

    stopChargeSound() {
        if (this.chargeOsc) {
            this.chargeGain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.05);
            this.chargeOsc.stop(this.ctx.currentTime + 0.05);
            this.chargeOsc = null;
            this.chargeGain = null;
        }
    }
};

// --- Input Handler ---
const keys = {
    ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false,
    KeyX: false, KeyS: false
};

window.addEventListener('keydown', (e) => {
    if (keys.hasOwnProperty(e.code)) keys[e.code] = true;
});
window.addEventListener('keyup', (e) => {
    if (keys.hasOwnProperty(e.code)) keys[e.code] = false;
});

// --- Gamepad Handler ---
const GamepadHandler = {
    connected: false,
    getInputs() {
        const gamepads = navigator.getGamepads();
        // Look for the first non-null gamepad
        const gp = Array.from(gamepads).find(g => g !== null);

        if (!gp) return null;

        if (!this.connected) {
            console.log("Gamepad detected:", gp.id);
            this.connected = true;
        }

        const inputs = {
            move: new THREE.Vector2(0, 0),
            jump: false,
            shoot: false
        };

        // Left Stick
        const threshold = 0.2;
        if (Math.abs(gp.axes[0]) > threshold) inputs.move.x = gp.axes[0];
        if (Math.abs(gp.axes[1]) > threshold) inputs.move.y = gp.axes[1];

        // D-Pad
        if (gp.buttons[12]?.pressed) inputs.move.y = -1; // Up
        if (gp.buttons[13]?.pressed) inputs.move.y = 1;  // Down
        if (gp.buttons[14]?.pressed) inputs.move.x = -1; // Left
        if (gp.buttons[15]?.pressed) inputs.move.x = 1;  // Right

        // Buttons
        inputs.jump = gp.buttons[0]?.pressed; // A / Cross
        inputs.shoot = gp.buttons[2]?.pressed || gp.buttons[7]?.pressed; // X / Square or R2

        return inputs;
    }
};

window.addEventListener("gamepadconnected", (e) => {
    console.log("Gamepad connected at index %d: %s. %d buttons, %d axes.",
        e.gamepad.index, e.gamepad.id,
        e.gamepad.buttons.length, e.gamepad.axes.length);
});

window.addEventListener("gamepaddisconnected", (e) => {
    console.log("Gamepad disconnected from index %d: %s",
        e.gamepad.index, e.gamepad.id);
    GamepadHandler.connected = false;
});

// --- Scene Setup ---
const scene = new THREE.Scene();
window.scene = scene; // Expose for debugging
scene.background = new THREE.Color(0x333333);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 8, 8);
camera.lookAt(0, 0, 0);

const canvas = document.querySelector('#game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;

// --- Custom 3D Anaglyph Effect ---
class CustomAnaglyphEffect {
    constructor(renderer, width = 512, height = 512) {
        this.colorMatrixLeft = new THREE.Matrix3().fromArray([
            0.456100, -0.0400822, -0.0152161,
            0.500484, -0.0378246, -0.0205971,
            0.176381, -0.0157589, -0.00546856
        ]);
        this.colorMatrixRight = new THREE.Matrix3().fromArray([
            -0.0434706, 0.378476, -0.0721527,
            -0.0879388, 0.73364, -0.112961,
            -0.00155529, -0.0184503, 1.2264
        ]);

        this._stereo = new THREE.StereoCamera();
        this._stereo.eyeSep = 0.064; // Default value

        const _params = { minFilter: THREE.LinearFilter, magFilter: THREE.NearestFilter, format: THREE.RGBAFormat };
        this._renderTargetL = new THREE.WebGLRenderTarget(width, height, _params);
        this._renderTargetR = new THREE.WebGLRenderTarget(width, height, _params);

        const _material = new THREE.ShaderMaterial({
            uniforms: {
                'mapLeft': { value: this._renderTargetL.texture },
                'mapRight': { value: this._renderTargetR.texture },
                'colorMatrixLeft': { value: this.colorMatrixLeft },
                'colorMatrixRight': { value: this.colorMatrixRight }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D mapLeft;
                uniform sampler2D mapRight;
                varying vec2 vUv;
                uniform mat3 colorMatrixLeft;
                uniform mat3 colorMatrixRight;
                void main() {
                    vec2 uv = vUv;
                    vec4 colorL = texture2D(mapLeft, uv);
                    vec4 colorR = texture2D(mapRight, uv);
                    vec3 color = clamp(colorMatrixLeft * colorL.rgb + colorMatrixRight * colorR.rgb, 0., 1.);
                    gl_FragColor = vec4(color.r, color.g, color.b, max(colorL.a, colorR.a));
                    #include <tonemapping_fragment>
                    #include <colorspace_fragment>
                }
            `
        });

        this._quad = new FullScreenQuad(_material);

        this.setIntensity = function (value) {
            // value 0 to 1, map to something visible
            // Default eyeSep is 0.064. Let's map 0-1 to 0 - 0.5
            this._stereo.eyeSep = value * 0.5;
        };

        this.setSize = function (width, height) {
            renderer.setSize(width, height);
            const pixelRatio = renderer.getPixelRatio();
            this._renderTargetL.setSize(width * pixelRatio, height * pixelRatio);
            this._renderTargetR.setSize(width * pixelRatio, height * pixelRatio);
        };

        this.render = function (scene, camera) {
            const currentRenderTarget = renderer.getRenderTarget();
            if (scene.matrixWorldAutoUpdate === true) scene.updateMatrixWorld();
            if (camera.parent === null && camera.matrixWorldAutoUpdate === true) camera.updateMatrixWorld();
            this._stereo.update(camera);

            renderer.setRenderTarget(this._renderTargetL);
            renderer.clear();
            renderer.render(scene, this._stereo.cameraL);

            renderer.setRenderTarget(this._renderTargetR);
            renderer.clear();
            renderer.render(scene, this._stereo.cameraR);

            renderer.setRenderTarget(null);
            this._quad.render(renderer);
            renderer.setRenderTarget(currentRenderTarget);
        };

        this.dispose = function () {
            this._renderTargetL.dispose();
            this._renderTargetR.dispose();
            _material.dispose();
            this._quad.dispose();
        };
    }
}

const effect = new CustomAnaglyphEffect(renderer);
effect.setSize(window.innerWidth, window.innerHeight);
effect.setIntensity(0.05); // Initial intensity
let isAnaglyphActive = false;

const toggle3D = () => {
    isAnaglyphActive = !isAnaglyphActive;
    const btn = document.getElementById('toggle-3d');
    const intensityContainer = document.getElementById('intensity-container');

    if (isAnaglyphActive) {
        btn.classList.add('active');
        btn.textContent = '3D: ON';
        intensityContainer.style.display = 'flex';
    } else {
        btn.classList.remove('active');
        btn.textContent = '3D: OFF';
        intensityContainer.style.display = 'none';
    }
};

document.getElementById('toggle-3d').addEventListener('click', toggle3D);
document.getElementById('anaglyph-intensity').addEventListener('input', (e) => {
    const intensity = parseFloat(e.target.value);
    effect.setIntensity(intensity);
    console.log("3D Intensity set to:", intensity);
});

window.addEventListener('keydown', (e) => {
    if (e.code === 'Digit3') toggle3D();
});

// --- Lighting ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
scene.add(ambientLight);

const pointLight = new THREE.PointLight(0xffffff, 0.5);
pointLight.position.set(5, 5, 5);
pointLight.castShadow = true;
scene.add(pointLight);

// --- Game Objects Groups ---
const walls = [];
const obstacles = [];
const projectiles = [];
const particles = [];

// --- Room Creation ---
function createRoom() {
    const floorGeo = new THREE.PlaneGeometry(ROOM_SIZE, ROOM_SIZE);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x888888 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const wallMat = new THREE.MeshStandardMaterial({ color: 0x666666, transparent: true, opacity: 1 });

    // Walls: North, South, East, West
    const wallConfigs = [
        { size: [ROOM_SIZE, WALL_HEIGHT, 0.5], pos: [0, WALL_HEIGHT / 2, -ROOM_SIZE / 2 - 0.255] },
        { size: [ROOM_SIZE, WALL_HEIGHT, 0.5], pos: [0, WALL_HEIGHT / 2, ROOM_SIZE / 2 + 0.255] },
        { size: [0.5, WALL_HEIGHT, ROOM_SIZE], pos: [-ROOM_SIZE / 2 - 0.255, WALL_HEIGHT / 2, 0] },
        { size: [0.5, WALL_HEIGHT, ROOM_SIZE], pos: [ROOM_SIZE / 2 + 0.255, WALL_HEIGHT / 2, 0] },
        // { size: [0.5, WALL_HEIGHT, ROOM_SIZE / 2], pos: [4, WALL_HEIGHT / 2, 5] },
    ];

    wallConfigs.forEach(cfg => {
        const geo = new THREE.BoxGeometry(...cfg.size);
        const wall = new THREE.Mesh(geo, wallMat.clone());
        wall.position.set(...cfg.pos);
        wall.castShadow = true;
        wall.receiveShadow = true;
        scene.add(wall);
        walls.push(wall);
        addEdges(wall, 0x888888);
    });

    // Add Obstacles
    const obsGeo = new THREE.BoxGeometry(1, 1.5, 1);
    const obsMat = new THREE.MeshStandardMaterial({ color: 0x664422, transparent: true, opacity: 1 });
    const obsPositions = [
        [2, 0.75, 2], [-2, 0.75, -2], [2, 0.75, -2]
    ];
    obsPositions.forEach(pos => {
        const obs = new THREE.Mesh(obsGeo, obsMat.clone());
        obs.position.set(...pos);
        obs.castShadow = true;
        obs.receiveShadow = true;
        obs.userData.hits = 0;
        scene.add(obs);
        obstacles.push(obs);
        addEdges(obs, 0xffaa00);
    });
}
createRoom();

// --- Player Class ---
class Player {
    constructor() {
        const geo = new THREE.BoxGeometry(0.6, 0.6, 0.6);
        const mat = new THREE.MeshStandardMaterial({ color: 0x00ff88 });
        this.mesh = new THREE.Mesh(geo, mat);
        this.mesh.position.y = 0.3;
        this.mesh.castShadow = true;
        scene.add(this.mesh);
        addEdges(this.mesh, 0x00ff88);

        this.velocity = new THREE.Vector3();
        this.isGrounded = true;
        this.canShoot = true;
        this.direction = new THREE.Vector3(0, 0, 1);
        this.jumpKeyWasDown = false;
        this.shootKeyWasDown = false;
        this.isCharging = false;
        this.chargeTime = 0;
        this.chargeLevel = 1;

        // Energy Stats
        this.maxEnergy = 100;
        this.currentEnergy = 100;
        this.hudBar = document.getElementById('energy-bar');
        this.standingOn = null;

        // Add Indicator (Visor/Eyes)
        const indicatorGeo = new THREE.BoxGeometry(0.5, 0.1, 0.1);
        const indicatorMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
        this.indicator = new THREE.Mesh(indicatorGeo, indicatorMat);
        this.indicator.position.set(0, 0.1, 0.3); // Front of the cube (+Z)
        this.mesh.add(this.indicator);

        // Charge Indicator Sphere
        const chargeGeo = new THREE.SphereGeometry(0.15, 16, 16);
        const chargeMat = new THREE.MeshStandardMaterial({ 
            color: 0xffff00, 
            transparent: true, 
            opacity: 0.8,
            emissive: 0xffff00,
            emissiveIntensity: 2
        });
        this.chargeSphere = new THREE.Mesh(chargeGeo, chargeMat);
        this.chargeSphere.position.set(0, 0.2, 0.4); // Exactly at firing height and in front (+Z)
        this.chargeSphere.visible = false;
        this.mesh.add(this.chargeSphere);
    }

    update() {
        // Regenerate energy slowly
        if (this.currentEnergy < this.maxEnergy) {
            this.currentEnergy = Math.min(this.maxEnergy, this.currentEnergy + 0.1);
            this.updateHUD();
        }

        // Movement
        const moveDir = new THREE.Vector3(0, 0, 0);
        if (keys.ArrowUp) moveDir.z -= 1;
        if (keys.ArrowDown) moveDir.z += 1;
        if (keys.ArrowLeft) moveDir.x -= 1;
        if (keys.ArrowRight) moveDir.x += 1;

        // Gamepad Movement
        const gp = GamepadHandler.getInputs();
        if (gp) {
            if (Math.abs(gp.move.x) > 0 || Math.abs(gp.move.y) > 0) {
                moveDir.x = gp.move.x;
                moveDir.z = gp.move.y;
            }
        }

        if (moveDir.length() > 0) {
            moveDir.normalize();
            this.direction.copy(moveDir);

            const nextX = this.mesh.position.x + moveDir.x * PLAYER_SPEED;
            const nextZ = this.mesh.position.z + moveDir.z * PLAYER_SPEED;

            // Wall Collision Check (X)
            if (!this.checkWallCollision(nextX, this.mesh.position.z)) {
                this.mesh.position.x = nextX;
            }
            // Wall Collision Check (Z)
            if (!this.checkWallCollision(this.mesh.position.x, nextZ)) {
                this.mesh.position.z = nextZ;
            }

            // Rotate mesh to face movement direction
            const angle = Math.atan2(moveDir.x, moveDir.z);
            this.mesh.rotation.y = angle;
        }

        // Jump
        const jumpRequested = keys.KeyX || (gp && gp.jump);
        if (jumpRequested && this.isGrounded && !this.jumpKeyWasDown) {
            this.velocity.y = JUMP_FORCE;
            this.isGrounded = false;
        }
        this.jumpKeyWasDown = jumpRequested;

        if (!this.isGrounded || this.velocity.y > 0) {
            this.velocity.y -= GRAVITY;
            this.mesh.position.y += this.velocity.y;

            const currentGround = this.getGroundLevel(this.mesh.position.x, this.mesh.position.z);

            if (this.mesh.position.y <= currentGround && this.velocity.y <= 0) {
                this.mesh.position.y = currentGround;
                this.velocity.y = 0;
                this.isGrounded = true;
            } else {
                this.isGrounded = false;
            }
        } else {
            // Check if still grounded (e.g., if walked off a ledge)
            const currentGround = this.getGroundLevel(this.mesh.position.x, this.mesh.position.z);
            if (this.mesh.position.y > currentGround + 0.01) {
                this.isGrounded = false;
            } else {
                this.mesh.position.y = currentGround;
            }
        }

        // Shoot
        const shootRequested = keys.KeyS || (gp && gp.shoot);
        
        if (shootRequested && this.canShoot && this.currentEnergy >= 5) {
            if (!this.shootKeyWasDown) {
                this.isCharging = true;
                this.chargeTime = 0;
                this.chargeLevel = 1;
                this.chargeSphere.visible = true;
                SoundManager.startChargeSound();
            } else if (this.isCharging) {
                this.chargeTime += 1/60; // Assuming 60fps
                if (this.chargeTime > 1.0) this.chargeLevel = 3;
                else if (this.chargeTime > 0.5) this.chargeLevel = 2;
                else this.chargeLevel = 1;

                // Update sound
                SoundManager.updateChargeSound(Math.min(this.chargeTime, 1.0));

                // Update Charge Sphere
                const scale = 1 + (this.chargeLevel - 1) * 0.7; // Grows larger
                this.chargeSphere.scale.set(scale, scale, scale);
                
                const color = this.chargeLevel === 3 ? 0xff0000 : (this.chargeLevel === 2 ? 0xffaa00 : 0xffff00);
                this.chargeSphere.material.color.setHex(color);
                this.chargeSphere.material.emissive.setHex(color);

                // Spawn "sucking" particles
                if (Math.random() > 0.3) this.spawnChargeParticle();
            }
        } else if (!shootRequested && this.shootKeyWasDown && this.isCharging) {
            // Release shot
            const energyCost = 5 * this.chargeLevel;
            if (this.currentEnergy >= energyCost) {
                this.shoot(this.chargeLevel);
                this.currentEnergy -= energyCost;
                this.updateHUD();
                this.canShoot = false;
                setTimeout(() => this.canShoot = true, 300);
            }
            this.isCharging = false;
            this.chargeSphere.visible = false;
            this.chargeSphere.scale.set(1, 1, 1);
            SoundManager.stopChargeSound();
        }
        this.shootKeyWasDown = shootRequested;

        // Follow Camera (Rigid)
        camera.position.x = this.mesh.position.x;
        camera.position.z = this.mesh.position.z + 6;
        camera.lookAt(this.mesh.position);
    }

    updateHUD() {
        const percent = (this.currentEnergy / this.maxEnergy) * 100;
        this.hudBar.style.width = `${percent}%`;

        // Color transition based on energy
        if (percent < 30) {
            this.hudBar.style.background = 'linear-gradient(90deg, #ff4444, #cc0000)';
        } else {
            this.hudBar.style.background = 'linear-gradient(90deg, #00ff88, #00aa66)';
        }
    }

    getGroundLevel(x, z) {
        let ground = 0;
        let newStandingOn = null;
        const playerTempBox = new THREE.Box3().setFromCenterAndSize(
            new THREE.Vector3(x, 5, z), // Use a high Y to cover all objects
            new THREE.Vector3(0.5, 10, 0.5)
        );

        const collidables = [...walls, ...obstacles];
        collidables.forEach(obj => {
            const box = new THREE.Box3().setFromObject(obj);
            // Check X/Z overlap
            const overlapX = x + 0.25 > box.min.x && x - 0.25 < box.max.x;
            const overlapZ = z + 0.25 > box.min.z && z - 0.25 < box.max.z;

            if (overlapX && overlapZ) {
                // Only consider it ground if it's below or at the player's feet
                if (box.max.y <= this.mesh.position.y - 0.2) {
                    if (box.max.y >= ground) {
                        ground = box.max.y;
                        newStandingOn = obj;
                    }
                }
            }
        });
        this.standingOn = newStandingOn;
        return ground + 0.3;
    }

    checkWallCollision(x, z) {
        const playerBox = new THREE.Box3().setFromCenterAndSize(
            new THREE.Vector3(x, this.mesh.position.y, z),
            new THREE.Vector3(0.6, 0.6, 0.6)
        );

        // Check walls and obstacles
        const collidables = [...walls, ...obstacles];
        for (const obj of collidables) {
            const box = new THREE.Box3().setFromObject(obj);

            // Height check: if player feet (y-0.3) are above object top (box.max.y)
            // or player top (y+0.3) is below object bottom (box.min.y), no collision.
            const playerBottom = this.mesh.position.y - 0.3;
            const playerTop = this.mesh.position.y + 0.3;

            const verticalHole = playerBottom >= box.max.y - 0.05 || playerTop <= box.min.y + 0.05;

            if (!verticalHole && box.intersectsBox(playerBox)) return true;
        }

        return false;
    }

    shoot(power = 1) {
        const muzzlePos = new THREE.Vector3();
        this.chargeSphere.getWorldPosition(muzzlePos);
        const bullet = new Projectile(muzzlePos, this.direction.clone(), power);
        projectiles.push(bullet);
        SoundManager.playShot();
    }

    spawnChargeParticle() {
        const muzzlePos = new THREE.Vector3();
        this.chargeSphere.getWorldPosition(muzzlePos);

        const spawnRadius = 1.0 + Math.random() * 0.5;
        const angle = Math.random() * Math.PI * 2;
        const phi = Math.random() * Math.PI;
        
        const spawnPos = new THREE.Vector3(
            muzzlePos.x + Math.sin(phi) * Math.cos(angle) * spawnRadius,
            muzzlePos.y + Math.sin(phi) * Math.sin(angle) * spawnRadius,
            muzzlePos.z + Math.cos(phi) * spawnRadius
        );

        const geo = new THREE.BoxGeometry(0.04, 0.04, 0.04);
        const color = this.chargeLevel === 3 ? 0xff0000 : (this.chargeLevel === 2 ? 0xffaa00 : 0xffff00);
        const mat = new THREE.MeshBasicMaterial({ color: color });
        const p = new THREE.Mesh(geo, mat);
        p.position.copy(spawnPos);
        
        p.userData.isChargeParticle = true;
        p.userData.target = this.chargeSphere;
        p.userData.life = 1.0;
        
        scene.add(p);
        particles.push(p);
    }
}

// --- Projectile Class ---
class Projectile {
    constructor(pos, dir, power = 1) {
        const size = 0.1 * power; // Visual indicator of power
        const geo = new THREE.SphereGeometry(size);
        const mat = new THREE.MeshBasicMaterial({ 
            color: power === 3 ? 0xff0000 : (power === 2 ? 0xffaa00 : 0xffff00) 
        });
        this.mesh = new THREE.Mesh(geo, mat);
        this.mesh.position.copy(pos);
        // Removed y offset as we use the muzzle position
        scene.add(this.mesh);

        this.dir = dir.clone().normalize();
        this.speed = 0.2;
        this.power = power;
        this.alive = true;

        // Dynamic Light
        this.light = new THREE.PointLight(mat.color, 1 * power, 3 * power);
        this.mesh.add(this.light);
    }

    update() {
        this.mesh.position.addScaledVector(this.dir, this.speed);

        // Wall & Obstacle Collision
        const collidables = [...walls, ...obstacles];
        for (const obj of collidables) {
            const box = new THREE.Box3().setFromObject(obj);
            if (box.containsPoint(this.mesh.position)) {
                this.handleCollision(obj);
                break;
            }
        }

        // Room limits
        if (Math.abs(this.mesh.position.x) > ROOM_SIZE || Math.abs(this.mesh.position.z) > ROOM_SIZE) {
            this.destroy();
        }
    }

    handleCollision(obj) {
        if (obj.userData.hits !== undefined) {
            obj.userData.hits += this.power;
            console.log(`Object hit with power ${this.power}! Total hits: ${obj.userData.hits}`);
            if (obj.userData.hits >= 10) {
                createBigExplosion(obj.position.clone());
                scene.remove(obj);
                // Remove from lists
                const wallIdx = walls.indexOf(obj);
                if (wallIdx > -1) walls.splice(wallIdx, 1);
                const obsIdx = obstacles.indexOf(obj);
                if (obsIdx > -1) obstacles.splice(obsIdx, 1);
            } else {
                this.explode();
                // Visual feedback for hit
                obj.scale.setScalar(1.1);
                setTimeout(() => obj.scale.setScalar(1), 50);
            }
        } else {
            this.explode();
        }
    }

    explode() {
        createExplosion(this.mesh.position.clone());
        SoundManager.playExplosion();
        this.destroy();
    }

    destroy() {
        this.alive = false;
        scene.remove(this.mesh);
    }
}

// --- Effects ---
function createExplosion(pos) {
    const particleCount = 10;
    const geo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });

    // Explosion Light
    const expLight = new THREE.PointLight(0xffaa00, 2, 5);
    expLight.position.copy(pos);
    scene.add(expLight);

    for (let i = 0; i < particleCount; i++) {
        const p = new THREE.Mesh(geo, mat);
        p.position.copy(pos);
        p.userData.velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 0.2,
            (Math.random() - 0.5) * 0.2,
            (Math.random() - 0.5) * 0.2
        );
        p.userData.life = 1.0;
        scene.add(p);
        particles.push(p);
    }

    setTimeout(() => scene.remove(expLight), 200);
}

function createBigExplosion(pos) {
    const particleCount = 50;
    const geo = new THREE.BoxGeometry(0.2, 0.2, 0.2);
    const mat = new THREE.MeshBasicMaterial({ color: 0xff4400 });

    // Intense Light
    const expLight = new THREE.PointLight(0xff4400, 5, 10);
    expLight.position.copy(pos);
    scene.add(expLight);

    for (let i = 0; i < particleCount; i++) {
        const p = new THREE.Mesh(geo, mat);
        p.position.copy(pos);
        p.userData.velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 0.4,
            Math.random() * 0.01, // Reduced upward velocity
            (Math.random() - 0.5) * 0.4
        );
        p.userData.life = 2.0;
        scene.add(p);
        particles.push(p);
    }

    SoundManager.playExplosion();
    setTimeout(() => SoundManager.playExplosion(), 100);
    setTimeout(() => scene.remove(expLight), 500);
}

const player = new Player();
window.player = player; // Expose for debugging
const raycaster = new THREE.Raycaster();

// --- Main Loop ---
function animate() {
    requestAnimationFrame(animate);

    player.update();

    // Update Projectiles
    for (let i = projectiles.length - 1; i >= 0; i--) {
        projectiles[i].update();
        if (!projectiles[i].alive) projectiles.splice(i, 1);
    }

    // Update Particles
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        
        if (p.userData.isChargeParticle) {
            const targetPos = new THREE.Vector3();
            p.userData.target.getWorldPosition(targetPos);
            
            const dir = targetPos.clone().sub(p.position);
            const dist = dir.length();
            
            if (dist < 0.1) {
                scene.remove(p);
                particles.splice(i, 1);
                continue;
            }
            
            dir.normalize();
            p.position.addScaledVector(dir, 0.08); // Speed of "suck"
            p.userData.life -= 0.01;
        } else {
            p.position.add(p.userData.velocity);
            p.userData.life -= 0.02;
        }

        p.scale.setScalar(p.userData.life);
        if (p.userData.life <= 0) {
            scene.remove(p);
            particles.splice(i, 1);
        }
    }

    // Wall/Obstacle Translucency (Raycaster Camera -> Player)
    const camToPlayer = player.mesh.position.clone().sub(camera.position);
    raycaster.set(camera.position, camToPlayer.normalize());
    const collidables = [...walls, ...obstacles];
    const intersects = raycaster.intersectObjects(collidables);

    collidables.forEach(w => w.material.opacity = 1);
    intersects.forEach(hit => {
        if (hit.object !== player.standingOn) {
            hit.object.material.opacity = 0.3;
        }
    });

    if (isAnaglyphActive) {
        effect.render(scene, camera);
    } else {
        renderer.render(scene, camera);
    }
}

// Handle Window Resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    effect.setSize(window.innerWidth, window.innerHeight);
});

animate();
