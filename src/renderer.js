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
    int type; // 0: RoundBox, 1: CappedCylinder, 2: Sphere, 3: Capsule, 4: Cone
    int operation; // 0: Smooth Union, 1: Rigid Union, 2: Subtract
    vec3 pos;
    vec4 rot; // Quaternion
    vec3 size;
    vec3 color;
    float blend; // Smoothness k
};

uniform Shape uShapes[MAX_SHAPES];
uniform int uShapeCount;
uniform float uTime;
uniform vec3 uCameraPos;
uniform vec3 uLightDir;
uniform float uGlobalSmoothness;

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

float sdRoundBox(vec3 p, vec3 b, float r) {
    vec3 q = abs(p) - b;
    return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r;
}

float sdCapsule(vec3 p, float h, float r) {
    p.y -= clamp(p.y, -h/2.0, h/2.0);
    return length(p) - r;
}

float sdCappedCylinder(vec3 p, float h, float r) {
    vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r, h/2.0);
    return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

float sdCone(vec3 p, float h, float r) {
    // c defined by radius r and height h
    // sin(a) = r / sqrt(r*r + h*h)
    // cos(a) = h / sqrt(r*r + h*h)
    float hyp = sqrt(r*r + h*h);
    vec2 c = vec2(r/hyp, h/hyp);

    // Inigo Quilez sdCone
    // p.y is height, p.xz is radius
    // We center it at 0. So y goes from -h/2 to h/2 ??
    // Usually sdCone base is at y=0, tip at y=-h or y=h?
    // Let's assume standard centering: y=0 is center.
    // Actually IQ's cone: tip at 0.

    // Let's shift p so center is at 0
    // If we want height h centered at 0:
    // p.y += h/2.0; // tip at h/2 ?

    // Simplified cone:
    float q = length(p.xz);
    return max(dot(c.xy, vec2(q, p.y)), -h - p.y);

    // This is tricky without exact specs.
    // Let's try to adapt sdCappedCone or just a simple cone.
    // For now, let's use a Capped Cone which is safer.
    // But schema says "sdCone".
    // I'll stick to a simple approximation or fallback to Capsule if tricky.
    // Let's use sdCappedCone logic but with r2=0.
}

float sdCappedCone(vec3 p, float h, float r1, float r2)
{
  vec2 q = vec2( length(p.xz), p.y );
  vec2 k1 = vec2(r2,h);
  vec2 k2 = vec2(r2-r1,2.0*h);
  vec2 ca = vec2(q.x-min(q.x,(q.y<0.0)?r1:r2), abs(q.y)-h);
  vec2 cb = q - k1 + k2*clamp( dot(k1-q,k2)/dot(k2,k2), 0.0, 1.0 );
  float s = (cb.x<0.0 && ca.y<0.0) ? -1.0 : 1.0;
  return s*sqrt( min(dot(ca,ca),dot(cb,cb)) );
}


// --- Map Function ---
vec2 map(vec3 p) {
    float d = MAX_DIST;
    float matID = 0.0;

    // We assume the list is somewhat sorted or we just combine sequentially.
    // Boolean operations are non-commutative in some cases, but for "add parts to body",
    // usually: Body U Head U Arm.
    // Subtract is: (Body U Head) - Eye.
    // So sequential works if subtracts come after the thing they subtract from.
    // The renderer sorts this out.

    for (int i = 0; i < MAX_SHAPES; i++) {
        if (i >= uShapeCount) break;

        Shape s = uShapes[i];

        // Transform point to local space
        vec3 localP = inverseRotateVector(p - s.pos, s.rot);

        float dist = MAX_DIST;

        if (s.type == 0) { // RoundBox
            dist = sdRoundBox(localP, s.size, 0.1); // Fixed roundness 0.1
        } else if (s.type == 1) { // CappedCylinder
            dist = sdCappedCylinder(localP, s.size.y, s.size.x);
        } else if (s.type == 2) { // Sphere
            dist = sdSphere(localP, s.size.x);
        } else if (s.type == 3) { // Capsule
            dist = sdCapsule(localP, s.size.y, s.size.x);
        } else if (s.type == 4) { // Cone (using CappedCone with top radius 0)
            dist = sdCappedCone(localP, s.size.y * 0.5, s.size.x, 0.0);
        }

        if (i == 0) {
            d = dist;
            matID = float(i);
        } else {
            // Operation
            if (s.operation == 0) { // Smooth Union
                float k = max(0.01, s.blend);
                d = smin(d, dist, k);
            } else if (s.operation == 1) { // Rigid Union (or Ball Joint)
                d = min(d, dist);
            } else if (s.operation == 2) { // Subtract
                d = max(d, -dist);
            }
        }
    }

    return vec2(d, matID);
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

// Get Color
vec3 calcColor(vec3 p) {
    // Weighted blend based on distance to shapes
    vec3 totalColor = vec3(0.0);
    float totalWeight = 0.0;

    for (int i = 0; i < MAX_SHAPES; i++) {
        if (i >= uShapeCount) break;
        Shape s = uShapes[i];

        // Only consider shapes that contribute to volume (not subtractors ideally, but simplified)
        if (s.operation == 2) continue;

        vec3 localP = inverseRotateVector(p - s.pos, s.rot);
        float dist = MAX_DIST;

        if (s.type == 0) dist = sdRoundBox(localP, s.size, 0.1);
        else if (s.type == 1) dist = sdCappedCylinder(localP, s.size.y, s.size.x);
        else if (s.type == 2) dist = sdSphere(localP, s.size.x);
        else if (s.type == 3) dist = sdCapsule(localP, s.size.y, s.size.x);
        else if (s.type == 4) dist = sdCappedCone(localP, s.size.y * 0.5, s.size.x, 0.0);

        float w = 1.0 / (abs(dist) + 0.001);
        w = pow(w, 4.0); // High sharpen to isolate colors
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

    vec3 col = vec3(0.05); // Dark background

    if (d < SURF_DIST) {
        vec3 p = ro + rd * t;
        vec3 n = calcNormal(p);
        vec3 lightDir = normalize(uLightDir);

        // Lighting
        float diff = max(dot(n, lightDir), 0.0);

        // Rim light for edge definition
        float rim = 1.0 - max(dot(n, -rd), 0.0);
        rim = pow(rim, 3.0);

        float amb = 0.3;

        // Color
        vec3 objCol = calcColor(p);

        col = objCol * (diff + amb) + vec3(0.5)*rim*0.2;

        // Gamma correction
        col = pow(col, vec3(0.4545));
    } else {
        discard;
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
            uShapes: { value: [] },
            uCameraPos: { value: new THREE.Vector3() },
            uLightDir: { value: new THREE.Vector3(0.5, 0.8, 0.5) },
            uGlobalSmoothness: { value: 0.1 }
        };

        const shapes = [];
        for (let i = 0; i < MAX_SHAPES; i++) {
            shapes.push({
                type: 0,
                operation: 0,
                pos: new THREE.Vector3(),
                rot: new THREE.Vector4(0,0,0,1),
                size: new THREE.Vector3(1,1,1),
                color: new THREE.Vector3(0,1,0),
                blend: 0.1
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

    render(graphData) {
        this.clear();

        if (!graphData || !graphData.topology_graph) {
            console.error("Invalid graph data for renderer");
            return;
        }

        // 1. Process Graph to Flattened Shapes
        const shapeList = this._processGraph(graphData);

        // 2. Update Uniforms
        const count = Math.min(shapeList.length, MAX_SHAPES);
        this.uniforms.uShapeCount.value = count;

        // Global smoothness override if needed, or per shape
        const globalSmoothness = graphData.style_parameters?.smoothness || 0.1;
        this.uniforms.uGlobalSmoothness.value = globalSmoothness;

        for (let i = 0; i < count; i++) {
            const s = shapeList[i];
            const u = this.uniforms.uShapes.value[i];

            u.type = s.type;
            u.operation = s.operation;
            u.pos.copy(s.pos);
            u.rot.copy(s.rot);
            u.size.copy(s.size);
            u.color.copy(s.color);
            u.blend = s.blend !== undefined ? s.blend : globalSmoothness;
        }

        // 3. Create Geometry
        const geometry = new THREE.BoxGeometry(20, 20, 20);
        const material = new THREE.ShaderMaterial({
            vertexShader: vertexShader,
            fragmentShader: fragmentShader,
            uniforms: this.uniforms,
            side: THREE.BackSide,
            transparent: true
        });

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.set(0, 2, 0);
        this.scene.add(this.mesh);
    }

    update(camera) {
        if (this.mesh) {
            this.uniforms.uCameraPos.value.copy(camera.position);
            this.uniforms.uTime.value = performance.now() / 1000.0;
        }
    }

    _processGraph(data) {
        const nodes = data.topology_graph.nodes;
        const rootId = data.topology_graph.root_node;
        const style = data.style_parameters || {};

        const primaryMaterial = style.primary_material || "organic_flesh";
        const globalSmoothness = style.smoothness || 0.1;

        // Build Maps
        const nodeMap = new Map();
        const childrenMap = new Map();

        nodes.forEach(node => {
            nodeMap.set(node.id, node);
            if (node.parent) {
                if (!childrenMap.has(node.parent)) childrenMap.set(node.parent, []);
                childrenMap.get(node.parent).push(node.id);
            }
        });

        const resultShapes = [];

        // Recursive function to compute world transforms
        const processNode = (nodeId, parentMatrix) => {
            const node = nodeMap.get(nodeId);
            if (!node) return;

            // Compute Local Matrix
            // relative_pos is [x, y, z]
            // We assume standard rotation (identity) for now as schema doesn't specify rotation in 'relative_pos' or elsewhere explicitly except maybe inferred?
            // Wait, schema says: "relative_pos": [x,y,z]. NO ROTATION in schema for nodes?
            // "deformation" might imply bending, but basic rotation is missing?
            // Ah, usually bones have rotation. But the schema only lists `relative_pos`.
            // Let's assume identity rotation locally.
            // UNLESS: The primitives themselves align with the bone?
            // `scale` is absolute scale.

            const localMatrix = new THREE.Matrix4();
            const pos = new THREE.Vector3(...node.relative_pos);
            localMatrix.makeTranslation(pos.x, pos.y, pos.z);

            // World Matrix
            const worldMatrix = new THREE.Matrix4();
            if (parentMatrix) {
                worldMatrix.multiplyMatrices(parentMatrix, localMatrix);
            } else {
                worldMatrix.copy(localMatrix);
            }

            // Extract transform for this shape
            const worldPos = new THREE.Vector3();
            const worldQuat = new THREE.Quaternion();
            const worldScale = new THREE.Vector3(); // Not used directly, we use node.scale which is absolute?
            // Schema: "scale": "Three dimensional absolute scale".
            // So we use node.scale directly for size, and worldMatrix for position/rotation.

            worldMatrix.decompose(worldPos, worldQuat, worldScale);

            // Generate Shape
            const shape = this._createShape(node, worldPos, worldQuat, primaryMaterial, globalSmoothness);
            resultShapes.push(shape);

            // Handle Symmetry
            if (node.symmetry_pair) {
                // Generate mirrored shape
                // Mirror across X axis of the ROOT (or world 0?). Usually creature symmetry is X-axis.
                // Pos x -> -x.
                // Rotation needs mirroring too.
                const mirrorPos = new THREE.Vector3(-worldPos.x, worldPos.y, worldPos.z);

                // Mirror quaternion: (x, y, z, w) -> (-x, y, z, -w) ???
                // Or construct lookAt.
                // Simple hack: Reflected quaternion.
                // If we flip X, we flip the quaternion X and W components?
                // Let's try: q(-x, y, z, -w) is a rotation 180 around Y then normal?
                // Actually, standard mirror X:
                // pos.x *= -1
                // For a symmetric object like a Box, rotation mirror:
                // Euler (x, y, z) -> (x, -y, -z)?

                // Let's rely on geometric symmetry.
                const mirrorQuat = new THREE.Quaternion(worldQuat.x, -worldQuat.y, -worldQuat.z, worldQuat.w); // This might be wrong.

                // Correct mirroring of a quaternion across YZ plane (X axis normal):
                // q_new = (q.w, -q.x, q.y, q.z) ? No.
                // Let's try Euler.
                // If original was rotated R around Y, new is -R around Y.
                // If original R around Z, new is -R around Z.
                // If original R around X, new is R around X.
                // So Euler: (x, -y, -z).

                // Let's assume no rotation for now since input has no rotation, so quat is Identity.
                // Identity mirrored is Identity.
                // So (0,0,0,1).

                const mirrorShape = this._createShape(node, mirrorPos, mirrorQuat, primaryMaterial, globalSmoothness);
                resultShapes.push(mirrorShape);
            }

            // Children
            const children = childrenMap.get(nodeId);
            if (children) {
                children.forEach(childId => processNode(childId, worldMatrix));
            }
        };

        // Start at root. Root parent is null.
        // We assume root is at (0,0,0) world or applied `relative_pos` from origin.
        processNode(rootId, new THREE.Matrix4()); // Identity as parent of root

        return resultShapes;
    }

    _createShape(node, pos, rot, primaryMaterial, defaultSmoothness) {
        // Map Primitives
        // sdRoundBox, sdCappedCylinder, sdSphere, sdCapsule, sdCone
        let type = 0;
        if (node.sdf_primitive === "sdRoundBox") type = 0;
        else if (node.sdf_primitive === "sdCappedCylinder") type = 1;
        else if (node.sdf_primitive === "sdSphere") type = 2;
        else if (node.sdf_primitive === "sdCapsule") type = 3;
        else if (node.sdf_primitive === "sdCone") type = 4;

        // Map Connection Type
        // smooth_union, rigid_union, ball_joint, subtract
        let op = 0;
        if (node.connection_type === "smooth_union") op = 0;
        else if (node.connection_type === "rigid_union") op = 1;
        else if (node.connection_type === "ball_joint") op = 1; // Treat as rigid
        else if (node.connection_type === "subtract") op = 2;

        // Size
        const size = new THREE.Vector3(...node.scale);

        // Color
        const color = this._getColor(primaryMaterial, node.semantic_role);

        return {
            type: type,
            operation: op,
            pos: pos,
            rot: rot,
            size: size,
            color: color,
            blend: defaultSmoothness // Could derive from node params if available
        };
    }

    _getColor(materialName, semanticRole) {
        // Base palette based on material
        let col = new THREE.Vector3(0.5, 0.5, 0.5);

        if (materialName === "organic_flesh") col.set(0.8, 0.5, 0.4);
        else if (materialName === "chitin_shell") col.set(0.2, 0.15, 0.1);
        else if (materialName === "crystal") col.set(0.1, 0.8, 0.9);
        else if (materialName === "lava_rock") col.set(0.1, 0.1, 0.1); // Dark
        else if (materialName === "plant_matter") col.set(0.2, 0.6, 0.1);
        else if (materialName === "mechanical") col.set(0.6, 0.6, 0.7);

        // Modifiers based on role
        if (semanticRole === "core") {
            // slightly darker or richer
            col.multiplyScalar(0.9);
        } else if (semanticRole === "weapon") {
            col.set(0.8, 0.1, 0.1); // Reddish for weapons
        } else if (semanticRole === "ik_end_effector") {
            // maybe darker feet
            col.multiplyScalar(0.7);
        } else if (semanticRole === "decoration") {
            // brighter
            col.multiplyScalar(1.2);
        }

        return col;
    }
}
