import * as THREE from 'three';
import {
    Fn, float, vec2, vec3, vec4, mat2, mat3, mat4,
    storage, uniform, If, Loop, Break, Continue,
    positionWorld, cameraPosition,
    mix, clamp, length, abs, min, max, cross, dot, pow, normalize, sin, cos, sqrt,
    int, uint,
    timerLocal
} from 'three/tsl';

import { MeshBasicNodeMaterial, StorageBufferAttribute } from 'three/webgpu';

const MAX_SHAPES = 1024;
const STRIDE = 20; // 5 vec4s (20 floats) per shape

// Define Struct Layout in Storage Buffer (Float32Array)
// Chunk 0: type (float), operation (float), padding, padding
// Chunk 1: pos.x, pos.y, pos.z, padding
// Chunk 2: rot.x, rot.y, rot.z, rot.w
// Chunk 3: size.x, size.y, size.z, blend
// Chunk 4: color.r, color.g, color.b, deformation

const MAX_STEPS = 100;
const MAX_DIST = 100.0;
const SURF_DIST = 0.001;

// --- TSL Functions ---

// Quaternion Rotation
const rotateVector = Fn( ( [ v, q ] ) => {
    // v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v)
    const qxyz = q.xyz;
    const t = cross(qxyz, v).add(v.mul(q.w));
    return v.add(cross(qxyz, t).mul(2.0));
} );

const inverseRotateVector = Fn( ( [ v, q ] ) => {
    const invQ = vec4( q.xyz.negate(), q.w );
    return rotateVector( v, invQ );
} );

// Smooth Min
const smin = Fn( ( [ a, b, k ] ) => {
    const h = clamp( float(0.5).add( float(0.5).mul( b.sub( a ) ).div( k ) ), 0.0, 1.0 );
    return mix( b, a, h ).sub( k.mul( h ).mul( float(1.0).sub( h ) ) );
} );

// SDF Primitives
const sdSphere = Fn( ( [ p, s ] ) => {
    return length(p).sub(s);
} );

const sdRoundBox = Fn( ( [ p, b, r ] ) => {
    const q = abs(p).sub(b);
    return length(max(q, 0.0)).add(min(max(q.x, max(q.y, q.z)), 0.0)).sub(r);
} );

const sdCapsule = Fn( ( [ p, h, r ] ) => {
    const py = p.y.sub( clamp( p.y, h.div(2.0).negate(), h.div(2.0) ) );
    const pNew = vec3( p.x, py, p.z );
    return length(pNew).sub(r);
} );

const sdCappedCylinder = Fn( ( [ p, h, r ] ) => {
    const d = abs(vec2(length(p.xz), p.y)).sub(vec2(r, h.div(2.0)));
    return min(max(d.x, d.y), 0.0).add(length(max(d, 0.0)));
} );

// Capped Cone
const sdCappedCone = Fn( ( [ p, h, r1, r2 ] ) => {
    const q = vec2( length(p.xz), p.y );
    const k1 = vec2(r2, h);
    const k2 = vec2(r2.sub(r1), h.mul(2.0));

    const r_local = float(r2).toVar();
    If( q.y.lessThan(0.0), () => {
        r_local.assign( r1 );
    } );

    const ca = vec2(q.x.sub(min(q.x, r_local)), abs(q.y).sub(h));
    const cb = q.sub(k1).add(k2.mul(clamp( dot(k1.sub(q), k2).div(dot(k2, k2)), 0.0, 1.0 )));

    const s = float(1.0).toVar();
    If( cb.x.lessThan(0.0).and(ca.y.lessThan(0.0)), () => {
        s.assign( -1.0 );
    } );

    return s.mul(sqrt(min(dot(ca, ca), dot(cb, cb))));
} );

const calcEllipsoid = Fn( ( [ p, r ] ) => {
    const k0 = length(p.div(r));
    const k1 = length(p.div(r.mul(r)));
    return k0.mul(k0.sub(1.0)).div(k1);
} );

// Deformation
const opDeform = Fn( ( [ p, type ] ) => {
    const pOut = vec3(p).toVar();

    If( type.equal( 1 ), () => { // Taper Top
        const k = float(0.3);
        const f = float(1.0).sub( k.mul( clamp( pOut.y, 0.0, 2.0 ) ) );
        const divF = max(0.1, f);
        pOut.x.assign( pOut.x.div(divF) );
        pOut.z.assign( pOut.z.div(divF) );
    } ).ElseIf( type.equal( 2 ), () => { // Taper Bottom
        const k = float(0.3);
        const f = float(1.0).sub( k.mul( clamp( pOut.y.negate(), 0.0, 2.0 ) ) );
        const divF = max(0.1, f);
        pOut.x.assign( pOut.x.div(divF) );
        pOut.z.assign( pOut.z.div(divF) );
    } ).ElseIf( type.equal( 3 ), () => { // Bend Fwd (Bend +Z)
        const k = float(0.2);
        const c = cos(k.mul(pOut.y));
        const s = sin(k.mul(pOut.y));
        const oldY = pOut.y.toVar();
        pOut.y.assign( c.mul(oldY).sub(s.mul(pOut.z)) );
        pOut.z.assign( s.mul(oldY).add(c.mul(pOut.z)) );
    } ).ElseIf( type.equal( 4 ), () => { // Bend Bwd (Bend -Z)
         const k = float(-0.2);
         const c = cos(k.mul(pOut.y));
         const s = sin(k.mul(pOut.y));
         const oldY = pOut.y.toVar();
         pOut.y.assign( c.mul(oldY).sub(s.mul(pOut.z)) );
         pOut.z.assign( s.mul(oldY).add(c.mul(pOut.z)) );
    } ).ElseIf( type.equal( 5 ), () => { // Twist
         const k = float(1.0);
         const c = cos(k.mul(pOut.y));
         const s = sin(k.mul(pOut.y));
         const oldX = pOut.x.toVar();
         pOut.x.assign( c.mul(oldX).sub(s.mul(pOut.z)) );
         pOut.z.assign( s.mul(oldX).add(c.mul(pOut.z)) );
    } );

    return pOut;
} );

// Map Function
// Returns vec2(dist, matID)
const mapWorld = Fn( ( [ p, shapeBuffer, shapeCount, globalSmoothness ] ) => {
    const d = float(MAX_DIST).toVar();
    const matID = float(0.0).toVar();

    Loop( { start: 0, end: shapeCount, type: 'int' }, ( { i } ) => {
        const idx = i.mul(STRIDE);

        // Load Shape Data
        // Chunk 0
        const type = int( shapeBuffer.element( idx ) );
        const op = int( shapeBuffer.element( idx.add(1) ) );

        // Chunk 1
        const pos = vec3(
            shapeBuffer.element( idx.add(4) ),
            shapeBuffer.element( idx.add(5) ),
            shapeBuffer.element( idx.add(6) )
        );

        // Chunk 2
        const rot = vec4(
            shapeBuffer.element( idx.add(8) ),
            shapeBuffer.element( idx.add(9) ),
            shapeBuffer.element( idx.add(10) ),
            shapeBuffer.element( idx.add(11) )
        );

        // Chunk 3
        const size = vec3(
            shapeBuffer.element( idx.add(12) ),
            shapeBuffer.element( idx.add(13) ),
            shapeBuffer.element( idx.add(14) )
        );
        const blend = shapeBuffer.element( idx.add(15) );

        // Chunk 4
        // deformation is at idx + 19 (chunk 4 index 3) ? No, chunk 4 starts at 16.
        // 16, 17, 18 (color), 19 (deformation)
        const deformation = int( shapeBuffer.element( idx.add(19) ) );

        // Transform Point
        const localP = inverseRotateVector( p.sub(pos), rot ).toVar();

        // Deform
        If( deformation.greaterThan(0), () => {
            localP.assign( opDeform( localP, deformation ) );
        } );

        const dist = float(MAX_DIST).toVar();

        If( type.equal(0), () => { // RoundBox
            dist.assign( sdRoundBox( localP, size, float(0.1) ) );
        } ).ElseIf( type.equal(1), () => { // CappedCylinder
            dist.assign( sdCappedCylinder( localP, size.y, size.x ) );
        } ).ElseIf( type.equal(2), () => { // Sphere
            dist.assign( sdSphere( localP, size.x ) );
        } ).ElseIf( type.equal(3), () => { // Capsule
            dist.assign( sdCapsule( localP, size.y, size.x ) );
        } ).ElseIf( type.equal(4), () => { // Cone
             // sdCappedCone(localP, s.size.y * 0.5, s.size.x, 0.0);
            dist.assign( sdCappedCone( localP, size.y.mul(0.5), size.x, float(0.0) ) );
        } ).ElseIf( type.equal(5), () => { // Ellipsoid
            dist.assign( calcEllipsoid( localP, size ) );
        } );

        If( i.equal(0), () => {
            d.assign( dist );
            matID.assign( float(i) );
        } ).Else( () => {
             If( op.equal(0), () => { // Smooth Union
                 const k = max(0.01, blend);
                 d.assign( smin(d, dist, k) );
                 // Need logic to mix material IDs?
                 // Simple raymarch usually just takes the closest, but for smooth blend it's tricky.
                 // We will just keep the ID of the closest "hard" surface or last blend?
                 // For now, let's just stick to d.
                 // If dist < d (roughly), update matID?
                 // But smin changes d.
                 // Let's assume matID updates if dist < d (before blend)
             } ).ElseIf( op.equal(1), () => { // Rigid Union
                 d.assign( min(d, dist) );
             } ).ElseIf( op.equal(2), () => { // Subtract
                 d.assign( max(d, dist.negate()) );
             } );

             // Naive material ID update (closest wins)
             // This doesn't handle smooth blend color mixing perfectly, but ok for now.
             If( dist.lessThan(d.add(0.1)), () => { // Threshold
                 // We'll calculate color later using weighted blend, so ID isn't critical
                 // except for maybe debugging.
                 // Actually calcColor re-loops.
             });
        } );

    } );

    return vec2(d, matID);
} );

const calcNormal = Fn( ( [ p, shapeBuffer, shapeCount, globalSmoothness ] ) => {
    const e = vec2(0.001, 0.0);
    const d = mapWorld( p, shapeBuffer, shapeCount, globalSmoothness ).x;
    const n = d.sub( vec3(
        mapWorld( p.sub(e.xyy), shapeBuffer, shapeCount, globalSmoothness ).x,
        mapWorld( p.sub(e.yxy), shapeBuffer, shapeCount, globalSmoothness ).x,
        mapWorld( p.sub(e.yyx), shapeBuffer, shapeCount, globalSmoothness ).x
    ) );
    return normalize(n);
} );

const calcColor = Fn( ( [ p, shapeBuffer, shapeCount ] ) => {
    const totalColor = vec3(0.0).toVar();
    const totalWeight = float(0.0).toVar();

    Loop( { start: 0, end: shapeCount, type: 'int' }, ( { i } ) => {
        const idx = i.mul(STRIDE);

        const type = int( shapeBuffer.element( idx ) );
        const op = int( shapeBuffer.element( idx.add(1) ) );

        // Skip Subtract
        If( op.notEqual(2), () => {
             const pos = vec3(
                shapeBuffer.element( idx.add(4) ),
                shapeBuffer.element( idx.add(5) ),
                shapeBuffer.element( idx.add(6) )
            );
            const rot = vec4(
                shapeBuffer.element( idx.add(8) ),
                shapeBuffer.element( idx.add(9) ),
                shapeBuffer.element( idx.add(10) ),
                shapeBuffer.element( idx.add(11) )
            );
            const size = vec3(
                shapeBuffer.element( idx.add(12) ),
                shapeBuffer.element( idx.add(13) ),
                shapeBuffer.element( idx.add(14) )
            );
            const color = vec3(
                shapeBuffer.element( idx.add(16) ),
                shapeBuffer.element( idx.add(17) ),
                shapeBuffer.element( idx.add(18) )
            );
            const deformation = int( shapeBuffer.element( idx.add(19) ) );

            const localP = inverseRotateVector( p.sub(pos), rot ).toVar();
            If( deformation.greaterThan(0), () => {
                localP.assign( opDeform( localP, deformation ) );
            } );

            const dist = float(MAX_DIST).toVar();

            If( type.equal(0), () => { dist.assign( sdRoundBox( localP, size, float(0.1) ) ); } )
            .ElseIf( type.equal(1), () => { dist.assign( sdCappedCylinder( localP, size.y, size.x ) ); } )
            .ElseIf( type.equal(2), () => { dist.assign( sdSphere( localP, size.x ) ); } )
            .ElseIf( type.equal(3), () => { dist.assign( sdCapsule( localP, size.y, size.x ) ); } )
            .ElseIf( type.equal(4), () => { dist.assign( sdCappedCone( localP, size.y.mul(0.5), size.x, float(0.0) ) ); } )
            .ElseIf( type.equal(5), () => { dist.assign( calcEllipsoid( localP, size ) ); } );

            const w = float(1.0).div( abs(dist).add(0.001) );
            const w4 = pow(w, 4.0);
            totalColor.addAssign( color.mul(w4) );
            totalWeight.addAssign( w4 );
        } );
    } );

    return totalColor.div( max(totalWeight, 0.001) );
} );

// Main Raymarch Shader
const raymarchShader = Fn( ( [ shapeBuffer, shapeCount, globalSmoothness ] ) => {
    // Ray Origin/Direction
    // Assuming Mesh is a Box containing camera
    // Actually, simple setup:
    const ro = cameraPosition;
    const rd = normalize( positionWorld.sub( ro ) );

    const t = float(0.0).toVar();
    const d = float(0.0).toVar();
    const hit = float(0.0).toVar();

    Loop( { start: 0, end: MAX_STEPS, type: 'int' }, () => {
        const p = ro.add( rd.mul(t) );
        const res = mapWorld( p, shapeBuffer, shapeCount, globalSmoothness );
        d.assign( res.x );

        If( d.lessThan( SURF_DIST ), () => {
            hit.assign( 1.0 );
            Break();
        } );
        If( t.greaterThan( MAX_DIST ), () => {
            Break();
        } );

        t.addAssign( d );
    } );

    const col = vec3(0.05).toVar(); // Background

    If( hit.greaterThan(0.5), () => {
        const p = ro.add( rd.mul(t) );
        const n = calcNormal( p, shapeBuffer, shapeCount, globalSmoothness );
        const lightDir = normalize( vec3(0.5, 0.8, 0.5) );

        const diff = max( dot(n, lightDir), 0.0 );
        const rim = float(1.0).sub( max( dot(n, rd.negate()), 0.0 ) );
        const rimPow = pow(rim, 3.0);

        const amb = float(0.3);
        const objCol = calcColor( p, shapeBuffer, shapeCount );

        col.assign( objCol.mul( diff.add(amb) ).add( vec3(0.5).mul(rimPow).mul(0.2) ) );

        // Gamma
        col.assign( pow(col, vec3(0.4545)) );
    } ).Else( () => {
         // Discard or keep background
         // discard(); // TSL discard?
         // For now just background color
    } );

    return vec4(col, 1.0);
} );


export class CreatureRenderer {
    constructor(scene) {
        this.scene = scene;
        this.mesh = null;

        // Storage Buffer
        this.shapeArray = new Float32Array(MAX_SHAPES * STRIDE);
        this.shapeAttribute = new StorageBufferAttribute(this.shapeArray, 1);
        this.shapeBufferNode = storage( this.shapeAttribute, 'float', MAX_SHAPES * STRIDE );

        this.uShapeCount = uniform(0); // int uniform
        this.uGlobalSmoothness = uniform(0.1);

        this.initMesh();
    }

    initMesh() {
        const geometry = new THREE.BoxGeometry(20, 20, 20);

        // Material
        const material = new MeshBasicNodeMaterial();
        material.side = THREE.BackSide;
        material.transparent = true;

        // Assign the color node
        material.colorNode = raymarchShader( this.shapeBufferNode, this.uShapeCount, this.uGlobalSmoothness );

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.set(0, 2, 0);
        this.scene.add(this.mesh);
    }

    clear() {
        this.uShapeCount.value = 0;
        // We don't remove mesh, just set count to 0 so loop doesn't run (or runs 0 times)
    }

    render(graphData) {
        if (!graphData || !graphData.topology_graph) {
            console.error("Invalid graph data for renderer");
            return;
        }

        const shapeList = this._processGraph(graphData);
        const count = Math.min(shapeList.length, MAX_SHAPES);

        this.uShapeCount.value = count;
        this.uGlobalSmoothness.value = graphData.style_parameters?.smoothness || 0.1;

        // Update Buffer
        for (let i = 0; i < count; i++) {
            const s = shapeList[i];
            const offset = i * STRIDE;

            // Chunk 0
            this.shapeArray[offset] = s.type;
            this.shapeArray[offset + 1] = s.operation;
            // +2, +3 padding

            // Chunk 1
            this.shapeArray[offset + 4] = s.pos.x;
            this.shapeArray[offset + 5] = s.pos.y;
            this.shapeArray[offset + 6] = s.pos.z;
            // +7 padding

            // Chunk 2
            this.shapeArray[offset + 8] = s.rot.x;
            this.shapeArray[offset + 9] = s.rot.y;
            this.shapeArray[offset + 10] = s.rot.z;
            this.shapeArray[offset + 11] = s.rot.w;

            // Chunk 3
            this.shapeArray[offset + 12] = s.size.x;
            this.shapeArray[offset + 13] = s.size.y;
            this.shapeArray[offset + 14] = s.size.z;
            this.shapeArray[offset + 15] = s.blend;

            // Chunk 4
            this.shapeArray[offset + 16] = s.color.x;
            this.shapeArray[offset + 17] = s.color.y;
            this.shapeArray[offset + 18] = s.color.z;
            this.shapeArray[offset + 19] = s.deformation;
        }

        this.shapeAttribute.needsUpdate = true;
    }

    update(camera) {
        // TSL handles camera position automatically via `cameraPosition` node.
        // Time? `timerLocal` can be used.
        // If we needed manual uniforms, we'd update them here.
    }

    // ... _processGraph and _createShape methods remain largely the same,
    // but we need to ensure they return data compatible with our new structure.
    // I will copy them from the previous file and ensure they are correct.

    _processGraph(data) {
        const nodes = data.topology_graph.nodes;
        const rootId = data.topology_graph.root_node;
        const style = data.style_parameters || {};

        const primaryMaterial = style.primary_material || "organic_flesh";
        const globalSmoothness = style.smoothness || 0.1;

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

        const processNode = (nodeId, parentMatrix) => {
            const node = nodeMap.get(nodeId);
            if (!node) return;

            let layoutCount = 1;
            let layoutType = "none";
            let layoutAxis = "y";
            let layoutSpread = 0;

            if (node.layout) {
                 if (typeof node.layout === 'object') {
                     layoutCount = Math.max(1, Math.min(node.layout.count || 1, 20));
                     layoutType = node.layout.type || "none";
                     layoutAxis = node.layout.axis || "y";
                     layoutSpread = node.layout.spread || 0;
                 }
            }

            if (layoutType === "none") layoutCount = 1;

            for (let i = 0; i < layoutCount; i++) {

                const localMatrix = new THREE.Matrix4();
                const basePos = new THREE.Vector3(...node.relative_pos);

                if (layoutType === "radial" && layoutCount > 1) {
                    const spreadRad = layoutSpread * (Math.PI / 180);
                    const startAngle = -spreadRad / 2;
                    const step = spreadRad / (layoutCount - 1);
                    const angle = startAngle + i * step;

                    const axisVec = new THREE.Vector3();
                    if (layoutAxis === 'x') axisVec.set(1, 0, 0);
                    else if (layoutAxis === 'z') axisVec.set(0, 0, 1);
                    else axisVec.set(0, 1, 0);

                    const rotMat = new THREE.Matrix4().makeRotationAxis(axisVec, angle);
                    const transMat = new THREE.Matrix4().makeTranslation(basePos.x, basePos.y, basePos.z);

                    localMatrix.multiplyMatrices(rotMat, transMat);

                } else if (layoutType === "linear" && layoutCount > 1) {
                    const startOffset = -layoutSpread / 2;
                    const step = layoutSpread / (layoutCount - 1);
                    const offset = startOffset + i * step;

                    const offsetVec = new THREE.Vector3();
                    if (layoutAxis === 'x') offsetVec.set(offset, 0, 0);
                    else if (layoutAxis === 'z') offsetVec.set(0, 0, offset);
                    else offsetVec.set(0, offset, 0);

                    const finalPos = basePos.clone().add(offsetVec);
                    localMatrix.makeTranslation(finalPos.x, finalPos.y, finalPos.z);

                } else {
                    localMatrix.makeTranslation(basePos.x, basePos.y, basePos.z);
                }

                const worldMatrix = new THREE.Matrix4();
                if (parentMatrix) {
                    worldMatrix.multiplyMatrices(parentMatrix, localMatrix);
                } else {
                    worldMatrix.copy(localMatrix);
                }

                const worldPos = new THREE.Vector3();
                const worldQuat = new THREE.Quaternion();
                const worldScale = new THREE.Vector3();

                worldMatrix.decompose(worldPos, worldQuat, worldScale);

                const shape = this._createShape(node, worldPos, worldQuat, primaryMaterial, globalSmoothness);
                resultShapes.push(shape);

                if (node.symmetry_pair && !nodeMap.has(node.symmetry_pair)) {
                    const mirrorPos = new THREE.Vector3(-worldPos.x, worldPos.y, worldPos.z);
                    const mirrorQuat = new THREE.Quaternion(worldQuat.x, -worldQuat.y, -worldQuat.z, worldQuat.w);
                    const mirrorShape = this._createShape(node, mirrorPos, mirrorQuat, primaryMaterial, globalSmoothness);
                    resultShapes.push(mirrorShape);
                }

                const children = childrenMap.get(nodeId);
                if (children) {
                    children.forEach(childId => processNode(childId, worldMatrix));
                }
            }
        };

        processNode(rootId, new THREE.Matrix4());

        return resultShapes;
    }

    _createShape(node, pos, rot, primaryMaterial, defaultSmoothness) {
        let type = 0;
        if (node.sdf_primitive === "sdRoundBox") type = 0;
        else if (node.sdf_primitive === "sdCappedCylinder") type = 1;
        else if (node.sdf_primitive === "sdSphere") type = 2;
        else if (node.sdf_primitive === "sdCapsule") type = 3;
        else if (node.sdf_primitive === "sdCone") type = 4;
        else if (node.sdf_primitive === "sdEllipsoid") type = 5;

        let op = 0;
        if (node.connection_type === "smooth_union") op = 0;
        else if (node.connection_type === "rigid_union") op = 1;
        else if (node.connection_type === "ball_joint") op = 1;
        else if (node.connection_type === "subtract") op = 2;

        let deformation = 0;
        if (node.deformation === "taper_top") deformation = 1;
        else if (node.deformation === "taper_bottom") deformation = 2;
        else if (node.deformation === "bend_forward") deformation = 3;
        else if (node.deformation === "bend_backward") deformation = 4;
        else if (node.deformation === "twist") deformation = 5;

        let rawScale = new THREE.Vector3(...node.scale).multiplyScalar(0.5);
        // Safety clamp to prevent zero-scale errors (e.g. division by zero in ellipsoid)
        rawScale.x = Math.max(0.001, rawScale.x);
        rawScale.y = Math.max(0.001, rawScale.y);
        rawScale.z = Math.max(0.001, rawScale.z);
        let finalRot = rot.clone();
        let finalSize = rawScale.clone();

        if (type === 1 || type === 3 || type === 4) {
            const x = rawScale.x;
            const y = rawScale.y;
            const z = rawScale.z;

            let maxAxis = 'y';
            let radius = Math.max(x, z);
            let height = y * 2.0;

            if (x > y && x > z) {
                maxAxis = 'x';
                radius = Math.max(y, z);
                height = x * 2.0;
                const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2);
                finalRot.multiply(q);
            } else if (z > y && z > x) {
                maxAxis = 'z';
                radius = Math.max(x, y);
                height = z * 2.0;
                const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
                finalRot.multiply(q);
            } else {
                radius = Math.max(x, z);
                height = y * 2.0;
            }

            finalSize.x = radius;

            if (type === 3) { // Capsule
                let stick = height - 2.0 * radius;
                finalSize.y = Math.max(0.0, stick);
            } else {
                finalSize.y = height;
            }
        }

        let color;
        if (node.color && Array.isArray(node.color) && node.color.length === 3) {
             color = new THREE.Vector3(...node.color);
        } else {
             color = this._getColor(primaryMaterial, node.semantic_role);
        }

        return {
            type: type,
            operation: op,
            pos: pos,
            rot: finalRot,
            size: finalSize,
            color: color,
            blend: defaultSmoothness,
            deformation: deformation
        };
    }

    _getColor(materialName, semanticRole) {
        let col = new THREE.Vector3(0.5, 0.5, 0.5);

        if (materialName === "organic_flesh") col.set(0.8, 0.5, 0.4);
        else if (materialName === "chitin_shell") col.set(0.2, 0.15, 0.1);
        else if (materialName === "crystal") col.set(0.1, 0.8, 0.9);
        else if (materialName === "lava_rock") col.set(0.1, 0.1, 0.1);
        else if (materialName === "plant_matter") col.set(0.2, 0.6, 0.1);
        else if (materialName === "mechanical") col.set(0.6, 0.6, 0.7);

        if (semanticRole === "core") {
            col.multiplyScalar(0.9);
        } else if (semanticRole === "weapon") {
            col.set(0.8, 0.1, 0.1);
        } else if (semanticRole === "ik_end_effector") {
            col.multiplyScalar(0.7);
        } else if (semanticRole === "decoration") {
            col.multiplyScalar(1.2);
        }

        return col;
    }
}
