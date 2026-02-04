import * as THREE from 'three';

export class CreatureRenderer {
    constructor(scene) {
        this.scene = scene;
        this.rootGroup = null;

        // Materials
        this.matBody = new THREE.MeshStandardMaterial({ color: 0x4db6ac, roughness: 0.7 });
        this.matLimb = new THREE.MeshStandardMaterial({ color: 0x26a69a, roughness: 0.7 });
        this.matJoint = new THREE.MeshStandardMaterial({ color: 0x00796b, roughness: 0.9 });
        this.matEye = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 2.0 });
        this.matWing = new THREE.MeshStandardMaterial({ color: 0xffeb3b, transparent: true, opacity: 0.6, side: THREE.DoubleSide });
        this.matSpike = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.2, metalness: 0.5 });
    }

    clear() {
        if (this.rootGroup) {
            this.scene.remove(this.rootGroup);
            // Basic cleanup to avoid memory leaks (though minimal in this scope)
            this.rootGroup.traverse((obj) => {
                if (obj.geometry) obj.geometry.dispose();
            });
            this.rootGroup = null;
        }
    }

    render(treeRoot) {
        this.clear();
        this.rootGroup = new THREE.Group();
        this.scene.add(this.rootGroup);

        this._renderRecursive(treeRoot, this.rootGroup);
    }

    _renderRecursive(node, parentObj) {
        // Create a group for this node to handle its own transform relative to parent
        const nodeGroup = new THREE.Group();

        // Apply Transform
        if (node.transform) {
            nodeGroup.position.set(...node.transform.pos);
            nodeGroup.rotation.set(
                THREE.MathUtils.degToRad(node.transform.rot[0]),
                THREE.MathUtils.degToRad(node.transform.rot[1]),
                THREE.MathUtils.degToRad(node.transform.rot[2])
            );
            nodeGroup.scale.set(...node.transform.scl);
        }

        parentObj.add(nodeGroup);

        // Generate Geometry for this part
        const mesh = this._createMeshForSymbol(node.symbol, node.params);
        if (mesh) {
            nodeGroup.add(mesh);
        }

        // Recurse
        if (node.children) {
            node.children.forEach(child => {
                this._renderRecursive(child, nodeGroup);
            });
        }
    }

    _createMeshForSymbol(symbol, params) {
        let geometry, material;

        // Normalize symbol to handle variations if needed
        const s = symbol.toLowerCase();

        if (s.includes("torso")) {
            geometry = new THREE.BoxGeometry(1, 1, 1);
            material = this.matBody;
        }
        else if (s.includes("head")) {
            geometry = new THREE.SphereGeometry(0.6, 16, 16);
            material = this.matBody;
        }
        else if (s.includes("neck")) {
            geometry = new THREE.CapsuleGeometry(0.3, 0.8, 4, 8);
            material = this.matLimb;
        }
        else if (s.includes("arm") || s.includes("leg") || s.includes("forearm") || s.includes("calf")) {
            // Capsule oriented along Y usually
            geometry = new THREE.CapsuleGeometry(0.25, 0.8, 4, 8);
            material = this.matLimb;
        }
        else if (s.includes("hand") || s.includes("foot")) {
            geometry = new THREE.BoxGeometry(0.4, 0.4, 0.6);
            material = this.matJoint;
        }
        else if (s.includes("eye_laser")) {
            geometry = new THREE.CylinderGeometry(0.05, 0.05, 1.0, 8);
            // Rotate cylinder to point forward Z if default is Y
            geometry.rotateX(Math.PI / 2);
            material = this.matEye;
        }
        else if (s.includes("wing")) {
            geometry = new THREE.PlaneGeometry(1.5, 2.5);
            // Orient plane
            geometry.rotateX(Math.PI / 2);
            material = this.matWing;
        }
        else if (s.includes("spike")) {
            geometry = new THREE.ConeGeometry(0.1, 0.5, 8);
            geometry.rotateX(Math.PI / 2); // Point Z
            material = this.matSpike;
        }
        else {
            // Default placeholder for unknown symbols (like 'root' or intermediate nodes)
            // If it's a structural node like 'root', we might not want to render anything.
            if (s === 'root') return null;

            // Debug helper
            // geometry = new THREE.BoxGeometry(0.2, 0.2, 0.2);
            // material = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true });
            return null;
        }

        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        return mesh;
    }
}
