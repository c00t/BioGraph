import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GrammarSystem } from './grammar.js';
import { MockLLM } from './mock_llm.js';
import { CreatureRenderer } from './renderer.js';

class App {
    constructor() {
        this.container = document.getElementById('canvas-container');
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;

        // App Components
        this.grammarSystem = new GrammarSystem();
        this.creatureRenderer = null; // Initialized after scene

        this.init();
        this.animate();
        this.setupUI();

        // Generate a default creature on startup
        this.generateCreature();
    }

    init() {
        // Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x222222);
        this.scene.fog = new THREE.Fog(0x222222, 20, 100);

        // Camera
        this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(8, 6, 8);
        this.camera.lookAt(0, 2, 0);

        // Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.container.appendChild(this.renderer.domElement);

        // Controls
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.target.set(0, 2, 0);

        // Lights
        const ambientLight = new THREE.AmbientLight(0x404040, 1.0);
        this.scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 2.5);
        dirLight.position.set(5, 10, 5);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 2048;
        dirLight.shadow.mapSize.height = 2048;
        this.scene.add(dirLight);

        // Ground
        const gridHelper = new THREE.GridHelper(50, 50, 0x555555, 0x333333);
        this.scene.add(gridHelper);

        // Initialize Creature Renderer
        this.creatureRenderer = new CreatureRenderer(this.scene);

        // Resize handler
        window.addEventListener('resize', () => this.onWindowResize(), false);
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    setupUI() {
        document.getElementById('generate-btn').addEventListener('click', () => {
            this.generateCreature();
        });
    }

    generateCreature() {
        // Collect Genes
        const checkboxes = document.querySelectorAll('#gene-list input:checked');
        const selectedGenes = Array.from(checkboxes).map(cb => cb.value);
        console.log("Selected Genes:", selectedGenes);

        // 1. Mock LLM generates grammar rules based on genes
        const rules = MockLLM.generateGrammar(selectedGenes);

        // 2. Grammar System expands the rules into a structure tree
        this.grammarSystem.setRules(rules);
        const structureTree = this.grammarSystem.expand('root');

        // 3. Renderer constructs the 3D representation
        this.creatureRenderer.render(structureTree);
    }
}

new App();
