import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GrammarSystem } from './grammar.js';
import { LLM } from './llm.js';
import { CreatureRenderer } from './renderer.js';
import { GENE_LIST } from './genes.js';

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

        // Populate with random genes on startup
        this.populateRandomGenes();

        // Generate a default creature on startup
        this.generateCreature();
    }

    populateRandomGenes() {
        // Pick 8-16 random genes
        const count = Math.floor(Math.random() * (16 - 8 + 1)) + 8;
        const shuffled = [...GENE_LIST].sort(() => 0.5 - Math.random());
        const selected = shuffled.slice(0, count);

        const input = document.getElementById('gene-input');
        if (input) {
            input.value = selected.join(', ');
        }
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
        if (this.creatureRenderer) {
            this.creatureRenderer.update(this.camera);
        }
        this.renderer.render(this.scene, this.camera);
    }

    setupUI() {
        const generateBtn = document.getElementById('generate-btn');
        if (generateBtn) {
            generateBtn.addEventListener('click', () => {
                this.generateCreature();
            });
        }

        const randomizeBtn = document.getElementById('randomize-btn');
        if (randomizeBtn) {
            randomizeBtn.addEventListener('click', () => {
                this.populateRandomGenes();
            });
        }
    }

    async generateCreature() {
        // Collect Genes
        const input = document.getElementById('gene-input');
        const geneString = input ? input.value : "";
        // Split by comma, trim whitespace, and remove empty entries
        const selectedGenes = geneString.split(',').map(s => s.trim()).filter(s => s.length > 0);

        console.log("Selected Genes:", selectedGenes);

        // Show loading state
        console.log("Requesting LLM generation...");
        const btn = document.getElementById('generate-btn');
        if (btn) {
            btn.disabled = true;
            btn.innerText = "Generating...";
        }

        try {
            // 1. LLM generates grammar rules based on genes
            const rules = await LLM.generateGrammar(selectedGenes);
            console.log("Grammar received:", rules);

            // 2. Grammar System expands the rules into a structure tree
            this.grammarSystem.setRules(rules);
            const structureTree = this.grammarSystem.expand('root');

            // 3. Renderer constructs the 3D representation
            this.creatureRenderer.render(structureTree);
        } catch (e) {
            console.error("Generation failed:", e);
        } finally {
             if (btn) {
                btn.disabled = false;
                btn.innerText = "Generate Creature";
            }
        }
    }
}

new App();
