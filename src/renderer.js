import * as THREE from 'three';

const MAX_SHAPES = 64;

const vertexShader = `
varying vec3 vWorldPosition;

void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

const fragmentShader = `
precision highp float;

#define MAX_SHAPES 64
#define MAX_STEPS 100
#define MAX_DIST 100.0
#define SURF_DIST 0.001

struct Shape {
    int type; // 0: Sphere, 1: Box, 2: Capsule, 3: Cylinder
    vec3 pos;
    vec4 rot; // Quaternion
    vec3 size;
    vec3 color;
    float blend;
};

uniform Shape uShapes[MAX_SHAPES];
uniform int uShapeCount;
uniform float uTime;
uniform vec3 uCameraPos;
uniform vec3 uLightDir;

varying vec3 vWorldPosition;

// --- Math Helpers ---
vec3 rotateVector(vec3 v, vec4 q) {
    return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v);
}

vec3 inverseRotateVector(vec3 v, vec4 q) {
    return rotateVector(v, vec4(-q.xyz, q.w));
}

float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
}

// --- SDF Primitives ---
float sdSphere(vec3 p, float s) {
    return length(p) - s;
}

float sdBox(vec3 p, vec3 b) {
    vec3 q = abs(p) - b;
    return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

float sdRoundBox(vec3 p, vec3 b, float r) {
    vec3 q = abs(p) - b;
    return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r;
}

float sdCapsule(vec3 p, float h, float r) {
    p.y -= clamp(p.y, -h/2.0, h/2.0);
    return length(p) - r;
}

float sdCylinder(vec3 p, float h, float r) {
    vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r, h/2.0);
    return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

// --- Map Function ---
vec2 map(vec3 p) {
    float d = MAX_DIST;
    float matID = 0.0;

    // Default floor/ground (optional, but good for context)
    // float dPlane = p.y;
    // d = dPlane;

    if (uShapeCount == 0) return vec2(d, matID);

    // Track min distance and interpolated color (simplified: just closest object color)
    // To do true color blending, we need to track weights.
    // For now, let's just use the color of the closest object or blend based on d.

    // We'll iterate all shapes
    // To support color blending with smin is complex.
    // Simplified approach: Calculate geometry first.

    for (int i = 0; i < MAX_SHAPES; i++) {
        if (i >= uShapeCount) break;

        Shape s = uShapes[i];

        // Transform point to local space
        vec3 localP = inverseRotateVector(p - s.pos, s.rot);

        float dist = MAX_DIST;

        if (s.type == 0) { // Sphere
            dist = sdSphere(localP, s.size.x);
        } else if (s.type == 1) { // Box (Rounded)
            dist = sdRoundBox(localP, s.size, 0.1); // Fixed roundness for now
        } else if (s.type == 2) { // Capsule
            dist = sdCapsule(localP, s.size.y, s.size.x);
        } else if (s.type == 3) { // Cylinder
            dist = sdCylinder(localP, s.size.y, s.size.x);
        }

        // Blend
        // We use s.blend (k)
        if (i == 0) {
            d = dist;
            matID = float(i);
        } else {
            // Smooth min
            // float k = s.blend;
            float k = 0.4; // Global blend factor for organic look
            d = smin(d, dist, k);

            // For color blending, we can't easily do it here without more complex logic.
            // Just returning distance for now.
        }
    }

    return vec2(d, matID); // matID not fully utilized for color blending yet
}

// Compute Normal
vec3 calcNormal(vec3 p) {
    float d = map(p).x;
    vec2 e = vec2(0.001, 0.0);
    vec3 n = d - vec3(
        map(p - e.xyy).x,
        map(p - e.yxy).x,
        map(p - e.yyx).x
    );
    return normalize(n);
}

// Get Color at point (Expensive: re-evaluates all shapes to blend colors)
vec3 calcColor(vec3 p) {
    vec3 totalColor = vec3(0.0);
    float totalWeight = 0.0;
    float k = 0.4; // Same blend factor

    for (int i = 0; i < MAX_SHAPES; i++) {
        if (i >= uShapeCount) break;
        Shape s = uShapes[i];
        vec3 localP = inverseRotateVector(p - s.pos, s.rot);
        float dist = MAX_DIST;

        if (s.type == 0) dist = sdSphere(localP, s.size.x);
        else if (s.type == 1) dist = sdRoundBox(localP, s.size, 0.1);
        else if (s.type == 2) dist = sdCapsule(localP, s.size.y, s.size.x);
        else if (s.type == 3) dist = sdCylinder(localP, s.size.y, s.size.x);

        // Weight based on distance (closer = more influence)
        // A simple Inverse Distance Weighting or similar relative to the surface influence
        // Using the mixing factor from smin is ideal but hard to extract post-hoc.
        // Approximation: weight = 1.0 / (abs(dist) + epsilon)
        float w = 1.0 / (abs(dist) + 0.001);
        w = pow(w, 2.0); // Sharpen
        totalColor += s.color * w;
        totalWeight += w;
    }
    return totalColor / max(totalWeight, 0.001);
}

void main() {
    vec3 ro = uCameraPos;
    vec3 rd = normalize(vWorldPosition - ro);

    float t = 0.0;
    float d = 0.0;

    // Raymarching
    for (int i = 0; i < MAX_STEPS; i++) {
        vec3 p = ro + rd * t;
        vec2 res = map(p);
        d = res.x;

        if (d < SURF_DIST || t > MAX_DIST) break;
        t += d;
    }

    vec3 col = vec3(0.0);

    if (d < SURF_DIST) {
        vec3 p = ro + rd * t;
        vec3 n = calcNormal(p);
        vec3 lightDir = normalize(uLightDir);

        // Lighting
        float diff = max(dot(n, lightDir), 0.0);
        float amb = 0.2;

        // Color
        vec3 objCol = calcColor(p);

        col = objCol * (diff + amb);

        // Gamma correction
        col = pow(col, vec3(0.4545));
    } else {
        discard; // Draw background (or let Three.js scene background show)
    }

    gl_FragColor = vec4(col, 1.0);
}
`;

export class CreatureRenderer {
    constructor(scene) {
        this.scene = scene;
        this.mesh = null;
        this.uniforms = {
            uTime: { value: 0.0 },
            uShapeCount: { value: 0 },
            uShapes: { value: [] }, // Will be array of structs
            uCameraPos: { value: new THREE.Vector3() },
            uLightDir: { value: new THREE.Vector3(0.5, 0.8, 0.5) }
        };

        // Initialize uniforms structure for array
        // Three.js handles arrays of structs if we initialize them.
        // We need to create dummy objects for the array to ensure shader compilation.
        const shapes = [];
        for (let i = 0; i < MAX_SHAPES; i++) {
            shapes.push({
                type: 0,
                pos: new THREE.Vector3(),
                rot: new THREE.Vector4(0,0,0,1),
                size: new THREE.Vector3(1,1,1),
                color: new THREE.Vector3(0,1,0),
                blend: 0.4
            });
        }
        this.uniforms.uShapes.value = shapes;
    }

    clear() {
        if (this.mesh) {
            this.scene.remove(this.mesh);
            this.mesh.geometry.dispose();
            this.mesh.material.dispose();
            this.mesh = null;
        }
    }

    render(treeRoot) {
        this.clear();

        // 1. Flatten Tree
        const shapeList = [];
        this._flattenRecursive(treeRoot, new THREE.Matrix4(), shapeList);

        // 2. Update Uniforms
        const count = Math.min(shapeList.length, MAX_SHAPES);
        this.uniforms.uShapeCount.value = count;

        for (let i = 0; i < count; i++) {
            const s = shapeList[i];
            const u = this.uniforms.uShapes.value[i];

            u.type = s.type;
            u.pos.copy(s.pos);
            u.rot.copy(s.rot);
            u.size.copy(s.size);
            u.color.copy(s.color);
            u.blend = s.blend;
        }

        // 3. Create Bounding Geometry
        // We use a large box to ensure the ray hits.
        const geometry = new THREE.BoxGeometry(15, 15, 15);
        const material = new THREE.ShaderMaterial({
            vertexShader: vertexShader,
            fragmentShader: fragmentShader,
            uniforms: this.uniforms,
            side: THREE.BackSide, // Render inside the box
            transparent: true // Optional, if we want to blend with bg
        });

        this.mesh = new THREE.Mesh(geometry, material);
        // Center the box roughly where the creature is
        this.mesh.position.set(0, 2, 0);
        this.scene.add(this.mesh);
    }

    update(camera) {
        if (this.mesh) {
            this.uniforms.uCameraPos.value.copy(camera.position);
            this.uniforms.uTime.value = performance.now() / 1000.0;
        }
    }

    _flattenRecursive(node, parentMatrix, list) {
        // Compute Local Matrix
        const localMatrix = new THREE.Matrix4();

        // Transform
        if (node.transform) {
            const t = node.transform;
            const pos = new THREE.Vector3(...t.pos);
            const rot = new THREE.Euler(
                THREE.MathUtils.degToRad(t.rot[0]),
                THREE.MathUtils.degToRad(t.rot[1]),
                THREE.MathUtils.degToRad(t.rot[2])
            );
            const scl = new THREE.Vector3(...t.scl);

            localMatrix.compose(pos, new THREE.Quaternion().setFromEuler(rot), scl);
        }

        // World Matrix
        const worldMatrix = new THREE.Matrix4();
        worldMatrix.multiplyMatrices(parentMatrix, localMatrix);

        // Decompose
        const pos = new THREE.Vector3();
        const quat = new THREE.Quaternion();
        const scale = new THREE.Vector3();
        worldMatrix.decompose(pos, quat, scale);

        // Create Shape Data
        const shapeData = this._createShapeFromSymbol(node.symbol, scale, node.params);
        if (shapeData) {
            shapeData.pos = pos;
            shapeData.rot = new THREE.Vector4(quat.x, quat.y, quat.z, quat.w);
            list.push(shapeData);
        }

        // Recurse
        if (node.children) {
            node.children.forEach(child => {
                this._flattenRecursive(child, worldMatrix, list);
            });
        }
    }

    _createShapeFromSymbol(symbol, scale, params) {
        // Normalize
        const s = symbol.toLowerCase();

        // Defaults
        let type = 0; // Sphere
        let size = new THREE.Vector3(0.5, 0.5, 0.5);
        let color = new THREE.Vector3(0.2, 0.8, 0.5); // Greenish
        let blend = 0.4;

        if (s.includes("torso")) {
            type = 1; // Box
            size.set(0.5 * scale.x, 0.5 * scale.y, 0.5 * scale.z);
            color.set(0.3, 0.7, 0.6);
        }
        else if (s.includes("head")) {
            type = 0; // Sphere
            size.x = 0.6 * scale.x; // Radius
            color.set(0.3, 0.7, 0.6);
        }
        else if (s.includes("neck")) {
            type = 2; // Capsule
            size.x = 0.2 * scale.x; // Radius
            size.y = 0.6 * scale.y; // Height
            color.set(0.2, 0.6, 0.5);
        }
        else if (s.includes("arm") || s.includes("leg") || s.includes("forearm") || s.includes("calf")) {
            type = 2; // Capsule
            size.x = 0.15 * scale.x; // Radius
            size.y = 0.8 * scale.y;  // Height
            color.set(0.2, 0.6, 0.5);
        }
        else if (s.includes("hand") || s.includes("foot")) {
            type = 1; // Box
            size.set(0.2 * scale.x, 0.2 * scale.y, 0.2 * scale.z);
            color.set(0.1, 0.5, 0.4);
        }
        else if (s.includes("wing")) {
            type = 1; // Box (Thin)
            size.set(0.8 * scale.x, 0.05 * scale.y, 1.2 * scale.z);
            color.set(0.9, 0.9, 0.2);
        }
        else if (s.includes("spike")) {
            type = 2; // Capsule (Pointy look via geometry?) - Just use small capsule
            size.x = 0.05 * scale.x;
            size.y = 0.6 * scale.y;
            color.set(0.8, 0.8, 0.8);
        }
        else if (s.includes("eye") || s.includes("laser")) {
            type = 3; // Cylinder
            size.x = 0.05 * scale.x;
            size.y = 1.0 * scale.y;
            color.set(1.0, 0.0, 0.0);
        }
        else {
            if (s === "root") return null;
            // Default Sphere
            type = 0;
            size.x = 0.2 * scale.x;
        }

        return { type, size, color, blend };
    }
}
