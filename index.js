//======10========20========30========40========50========60========70========80
import * as THREE from 'https://cdn.skypack.dev/three@v0.132.2'

const defaultLayer = 0;
const uiLayer = 1;      // On top of everything  
const pickLayer = 2;    // Visible only for raycasting

const controlPointGeometry = new THREE.CircleGeometry(1, 16);
const whiteMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
const grayMaterial = new THREE.MeshBasicMaterial({ color: 0x999999 });
const redMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
const greenMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
const shortcutMaterial = new THREE.MeshBasicMaterial({
	color: 0xffff00,
  transparent: true,
  opacity: 0.5,
});
const solutionStageHitboxMaterial = whiteMaterial;
const solutionStageMeshColorFront = new THREE.Vector3(1, 1, 1);
const solutionStageMeshColorBack = new THREE.Vector3(0.3, 0.3, 0.3);

function requireNamedArgument(name, args) {
  const value = args[name];
  if (value === undefined) {
    throw new Error("'" + name + "' is required.");
  }
  return value;
}

Object.assign(THREE.Box2.prototype, {
	getCenter3(target) {
    const target2 = new THREE.Vector2();
  	this.getCenter(target2);
    return target.copy2(target2);
  },
  expandByPoints(points) {
    for (let i = 0; i < points.length; ++i) {
      this.expandByPoint(points[i]);
    }
  },
});
Object.assign(THREE.Vector2.prototype, {
  as2() { return this; },
	clone3() { return new THREE.Vector3(this.x, this.y, 0); },
  rotate90Right() { return this.set(this.y, -this.x); },
});
Object.assign(THREE.Vector2.prototype, {
 	as3: THREE.Vector2.prototype.clone3,
  clone2: THREE.Vector2.prototype.clone,
});

Object.assign(THREE.Vector3.prototype, {
  as2() { return this.clone2(); },
  as3() { return this; },
	clone2() { return new THREE.Vector2(this.x, this.y); },
  copy2(v) { return this.set(v.x, v.y, 0); },
  rotateXy90right() { return this.set(this.y, -this.x, this.z); }
});
Object.assign(THREE.Vector3.prototype, {
  as2: THREE.Vector3.prototype.clone2,
});

class Line2 {
	constructor(args = {}) {
  	this.origin = args.origin ? args.origin.as2() : new THREE.Vector2(0, 0);
    this.normal = args.normal ? args.normal.as2() : new THREE.Vector2(0, 1);
  }
  
  setFromPoints(origin, other) {
  	this.origin.copy(origin);
    this.normal.copy(other).sub(origin).rotate90Right();
    return this;
  }
  
  clone() {
  	return new Line2({
    	origin: this.origin.clone(),
      normal: this.normal.clone(),
    });
  }
  
  copy(other) {
  	this.origin.copy(other.origin);
    this.normal.copy(other.normal);
    return this;
  }
  
  dot(p) {
  	return p.clone().sub(this.origin).dot(this.normal);
  }
  
  equals(other) {
  	return other
    	&& this.origin.equals(other.origin)
      && this.normal.equals(origin.normal);
  }
  
  static fromPoints(origin, other) {
  	return new Line2().setFromPoints(origin, other);
  }
}

class Shortcut {
	constructor() {
  	this.line0 = new Line2();
    this.line1 = new Line2();
    this.axis = new Line2();
  }
  
  equals(other) {
  	return other
    	&& this.line0.equals(other.line0)
      && this.line1.equals(other.line1);
  }
}

class ForbiddenBall {
	constructor(args) {
  	this._center = args.center;
    this._radius = args.radius;
    this._radiusSq = this._radius * this._radius;
  }
  
  keepAway(position, fallbackPosition) {
  	const arm = position.clone().sub(this._center);
    const distanceSq = arm.lengthSq();
    if (distanceSq < this._radiusSq) {
    	let factor = this._radius / Math.sqrt(distanceSq);
      if (isFinite(factor)) {
      	arm.multiplyScalar(factor);
        position.copy(this._center).add(arm);
      } else {
      	position
        	.copy(fallbackPosition).sub(this._center)
          .setLength(this._radius).add(this._center);
      }
    }
  }
}

class Folder {
  fold(args) {
  	const faces = requireNamedArgument('faces', args);
    const creaseLines = requireNamedArgument('creaseLines', args);
  
  	const zones = [];
    const zonePush = function (p, u) {
      this.positions.push(p);
      this.uvs.push(u);
    }
    const zoneDot = function (p) {
      return this._line.dot(p);
    }
    const lastZoneDot = function (p) {
      return -1;
    }
    for (let k = 0; k <= creaseLines.length; ++k) {
    	const zone = {
      	faces: [],
      	push: zonePush,
      };
      if (k == 0) {
      	zone.matrix = new THREE.Matrix3().identity();
      } else {
      	zone.matrix = this._reflection(zones[k - 1]._line)
        	.premultiply(zones[k - 1].matrix);
      }
      if (k < creaseLines.length) {
        zone._line = creaseLines[k];
        zone.dot = zoneDot;
      } else {
        zone.dot = lastZoneDot;
      }
      zones.push(zone);
    }
    
    const outputFaces = [];
    for (let i = 0; i < faces.length; ++i) {
    	const face = faces[i];
    
    	for (let k = 0; k < zones.length; ++k) {
      	const zone = zones[k];
      	zone.positions = [];
        zone.uvs = [];
      }
      
      this._crease(face, zones);
      
      for (let k = 0; k < zones.length; ++k) {
      	const zone = zones[k];
        if (zone.positions.length < 3) {
          continue;
        }
      	const outputFace = Object.assign({}, face);
        outputFace.positions = zone.positions;
        outputFace.uvs = zone.uvs;
        zone.faces.push(outputFace);
      }
    }
    
    for (let k = zones.length - 1; k >= 0; --k) {
      const zone = zones[k];

      if (k > 0) {
        const matrix = zone.matrix;
        for (let l = 0; l < zone.faces.length; ++l) {
        	const positions = zone.faces[l].positions;
          for (let j = 0; j < positions.length; ++j) {
            positions[j].applyMatrix3(matrix);
          }
        }
      }

      if (k % 2 == 1) {
        for (let l = 0; l < zone.faces.length; ++l) {
        	const outputFace = zone.faces[l];
          outputFace.positions.reverse();
          outputFace.uvs.reverse();
          outputFace.side = !outputFace.side;
        }
      }
      
      for (let l = 0; l < zone.faces.length; ++l) {
      	outputFaces.push(zone.faces[l]);
      }
    }
    
    return outputFaces;
  }
  
  _crease(face, zones) {
    const positions = face.positions;
    const uvs = face.uvs;
    const vertexCount = positions.length;
    
    let p1 = positions[vertexCount - 1];
    let u1 = uvs[vertexCount - 1];
    let k1 = 0;
    while (zones[k1].dot(p1) > 0) {
      ++k1;
    }
    zones[k1].push(p1.clone(), u1.clone());
    
    for (let j = 0; j < vertexCount; ++j) {
      const p0 = p1;
      const u0 = u1;
    	const k0 = k1;
      
      p1 = positions[j];
      u1 = uvs[j];
    	k1 = 0;
      while (zones[k1].dot(p1) > 0) {
        ++k1;
      }
      
      if (k0 != k1) {
      	let kstart = k0, kend = k1, dk = 1;
        if (k1 < k0) {
        	--kstart; --kend; dk = -1;
        }
        for (let k = kstart; k != kend; k += dk) {
          const d0 = zones[k].dot(p0);
          const d1 = zones[k].dot(p1);
          const a = d0 / (d0 - d1);
          const p = p0.clone().lerp(p1, a);
          const u = u0.clone().lerp(u1, a);
          zones[k    ].push(p, u);
          zones[k + 1].push(p.clone(), u.clone());
        }
      }
      
    	zones[k1].push(p1.clone(), u1.clone());
    }
  }
  
  _reflection(line) {
    const s = -2 / line.normal.lengthSq();
    const nxnx = s * line.normal.x * line.normal.x;
    const nxny = s * line.normal.x * line.normal.y;
    const nyny = s * line.normal.y * line.normal.y;
    const nn = new THREE.Matrix3().set(
    	nxnx + 1, nxny    , 0,
      nxny    , nyny + 1, 0,
             0,        0, 1);
    const m = new THREE.Matrix3().identity();
    translate2(m, line.origin.clone().negate());
    m.premultiply(nn);
    translate2(m, line.origin);
    return m;
  }
}

class ShortcutControl extends THREE.Group {
	constructor() {
  	super();
    
    this.onChange = () => {};
  	this._axisPoint0 = createControlPoint(-0.05, -0.05);
    this._axisPoint1 = createControlPoint(-0.05,  1.05);
    this._wingPoint0 = createControlPoint(0, 0);
    this._wingPoint1 = createControlPoint(0, 0);
    this._wingRadius0 = 0.1;
    this._wingRadius1 = 0.1;
    
    this.add(
    	this._axisPoint0, this._axisPoint1,
      this._wingPoint0, this._wingPoint1);
    
    const forbidden0 = new ForbiddenBall({
    	center: this._axisPoint0.position, radius: 0.1 });
    const forbidden1 = new ForbiddenBall({
 			center: this._axisPoint1.position, radius: 0.1 });
      
    this._axisPoint0.onChange = (e) => {
    	forbidden1.keepAway(e.position, e.previousPosition);
      this._onAxisPointChange();
    };
    this._axisPoint1.onChange = (e) => {
    	forbidden0.keepAway(e.position, e.previousPosition);
      this._onAxisPointChange();
    };
    this._wingPoint0.onChange = () => {
    	this._wingRadius0 = this._wingPoint0.position.clone()
      	.sub(this._axisPoint0.position)
        .dot(this._axisNormal);
    	this._constrainWingPoint0();
      this._onControlPointChange();
    };
    this._wingPoint1.onChange = () => {
    	this._wingRadius1 = this._wingPoint1.position.clone()
      	.sub(this._axisPoint1.position)
        .dot(this._axisNormal);
    	this._constrainWingPoint1();
      this._onControlPointChange();
    };
    this._onAxisPointChange();
    
  	this._shortcut = new Shortcut();
    this._shortcutNeedsUpdate = true;
    
    this._mesh = new THREE.Mesh(new THREE.BufferGeometry(), shortcutMaterial);
    this._mesh.layers.set(uiLayer);
    this._mesh.geometry.setAttribute(
    	'position', new THREE.BufferAttribute(new Float32Array(6 * 3), 3));
    this.add(this._mesh);
    this._geometryNeedsUpdate = true;
  }
  
  get shortcut() {
  	if (this._shortcutNeedsUpdate) {
    	this._shortcutNeedsUpdate = false;
      const quad = this._quad;
      this._shortcut.line0.setFromPoints(quad[0], quad[3]);
      this._shortcut.line1.setFromPoints(quad[1], quad[2]);
      this._shortcut.axis.setFromPoints(
      	this._axisPoint0.position, this._axisPoint1.position);
    }
    return this._shortcut;
  }
  
  get _quad() {
  	if (!this.__quad) {
      const a0 = this._axisPoint0.position;
      const a1 = this._axisPoint1.position;
      const w0 = this._axisNormal.clone()
      	.multiplyScalar(Math.abs(this._wingRadius0));
      const w1 = this._axisNormal.clone()
      	.multiplyScalar(Math.abs(this._wingRadius1));
    	this.__quad = [
      	a0.clone().sub(w0), a0.clone().add(w0),
        a1.clone().add(w1), a1.clone().sub(w1), 
      ];
    }
    return this.__quad;
  }
  
  step() {
  	if (this._geometryNeedsUpdate) {
    	this._geometryNeedsUpdate = false;
      const quad = this._quad;
      const positions = this._mesh.geometry.getAttribute('position');
      vec3sToFloat3s([
      		quad[0], quad[1], quad[2],
          quad[0], quad[2], quad[3],
        ],
        positions.array);
      positions.needsUpdate = true;
    }
  }
  
  _onControlPointChange() {
  	this.__quad = null;
  	this._shortcutNeedsUpdate = true;
    this._geometryNeedsUpdate = true;
    this.onChange();
  }
  
  _onAxisPointChange() {
  	this._axisNormal = this._axisPoint1.position.clone()
      .sub(this._axisPoint0.position).rotateXy90right().normalize();
    this._constrainWingPoint0();
    this._constrainWingPoint1();
    this._onControlPointChange();
  }
  
  _constrainWingPoint0() {
    this._wingPoint0.position
    	.copy(this._axisNormal).multiplyScalar(this._wingRadius0)
      .add(this._axisPoint0.position);
  }
  
  _constrainWingPoint1() {
    this._wingPoint1.position
    	.copy(this._axisNormal).multiplyScalar(this._wingRadius1)
      .add(this._axisPoint1.position);
  }
}

class SolutionStage extends THREE.Group {
	constructor(args) {
  	super();
    
  	this._predecessor = args.predecessor;
    this._faces = args.faces;
    
    if (args.texture) {
    	this._faceMaterial = new THREE.MeshBasicMaterial({
        map: args.texture,
        depthTest: false,
      });
      this._faceBackMaterial = this._faceMaterial.clone();
      this._faceBackMaterial.color.set(0x333333);
    } else {
    	this._faceMaterial = this.predecessor._faceMaterial;
      this._faceBackMaterial = this.predecessor._faceBackMaterial;
    }
   
    this._edgeMaterial = new THREE.MeshLambertMaterial({
    	depthTest: false,
    });
    
    this._boundingBox = new THREE.Box2(
    	new THREE.Vector2(-0.6, -0.6), new THREE.Vector2(0.6, 0.6));
    this.add(new THREE.Box3Helper(box3From2(this._boundingBox)));
    this._hitbox = new THREE.Mesh(
    	new THREE.PlaneGeometry(1.2, 1.2), solutionStageHitboxMaterial);
    this._hitbox.layers.set(pickLayer);
    this.add(this._hitbox);
    
    this._root = new THREE.Group();
    this._sheet = new THREE.Group();
    this._root.add(this._sheet);
    this.add(this._root);
    
    this._geometryNeedsUpdate = true;
  }
  
  get predecessor() { return this._predecessor; }
  
  get boundingBox() { return this._boundingBox; }
  
  get hitbox() { return this._hitbox; }
  
  get shortcut() {
  	return this._shortcutControl ? this._shortcutControl.shortcut : null;
  }
  
  step() {
  	if (this._shortcutControl) {
    	this._shortcutControl.step();
    }
  
  	if (this.predecessor && this.predecessor._downstreamNeedsUpdate) {
    	this.predecessor._downstreamNeedsUpdate = false;
      this._downstreamNeedsUpdate = true;
      
      const shortcut = this.predecessor.shortcut;
      this._faces = folder.fold({
      	faces: this.predecessor._faces,
        creaseLines: [shortcut.line0, shortcut.axis],
      });
      this._geometryNeedsUpdate = true;
    }
    
    if (this._geometryNeedsUpdate) {
    	this._geometryNeedsUpdate = false;
      
    	const faceBoundingBox = new THREE.Box2();
      for (let i = 0; i < this._faces.length; ++i) {
      	faceBoundingBox.expandByPoints(this._faces[i].positions);
      }
      faceBoundingBox.getCenter3(this._root.position).negate();
      
      for (let i = 0; i < this._faces.length; ++i) {
      	if (this._sheet.children.length <= 2 * i) {
        	const faceMesh = new THREE.Mesh(new THREE.BufferGeometry());
          const edgeMesh = new THREE.LineSegments(
          	new THREE.BufferGeometry(), this._edgeMaterial);
          this._sheet.add(faceMesh, edgeMesh);
        }
        
        const face = this._faces[i];
        const positions = face.positions;
        const uvs = face.uvs;
        const vertexCount = positions.length;
        
        const triangleCount = vertexCount - 2;
        const facePositionBuffer = new Float32Array(9 * triangleCount);
        const faceUvBuffer = new Float32Array(6 * triangleCount);
        const p2 = positions[vertexCount - 1];
        let p1 = positions[0];
        const u2 = uvs[vertexCount - 1];
        let u1 = uvs[0];
        for (let j = 0; j < triangleCount; ++j) {
        	const p0 = p1;
          p1 = positions[j + 1];
          p0.toArray(facePositionBuffer, 9 * j + 0);
          p1.toArray(facePositionBuffer, 9 * j + 3);
          p2.toArray(facePositionBuffer, 9 * j + 6);
          const u0 = u1;
          u1 = uvs[j + 1];
          u0.toArray(faceUvBuffer, 6 * j + 0);
          u1.toArray(faceUvBuffer, 6 * j + 2);
          u2.toArray(faceUvBuffer, 6 * j + 4);
        }
        const faceMesh = this._sheet.children[2 * i + 0];
        faceMesh.material = face.side
        	? this._faceMaterial : this._faceBackMaterial;
        faceMesh.geometry.setAttribute('position',
        	new THREE.BufferAttribute(facePositionBuffer, 3));
        faceMesh.geometry.setAttribute('uv',
        	new THREE.BufferAttribute(faceUvBuffer, 2));
       
        const lineCount = vertexCount;
        const edgePositionBuffer = new Float32Array(6 * lineCount);
        const edgeNormalBuffer = new Float32Array(6 * lineCount);
        p1 = positions[vertexCount - 1];
        for (let j = 0; j < lineCount; ++j) {
          const p0 = p1;
          p1 = positions[j];
          p0.toArray(edgePositionBuffer, 6 * j + 0);
          p1.toArray(edgePositionBuffer, 6 * j + 3);
          const n = p1.clone().sub(p0).rotate90Right().normalize();
          n.toArray(edgeNormalBuffer, 6 * j + 0);
          n.toArray(edgeNormalBuffer, 6 * j + 3);
        }
        const edgeMesh = this._sheet.children[2 * i + 1];
        edgeMesh.geometry.setAttribute('position',
        	new THREE.BufferAttribute(edgePositionBuffer, 3));
        edgeMesh.geometry.setAttribute('normal',
        	new THREE.BufferAttribute(edgeNormalBuffer, 3));
      }
      
      for (
      		let i = this._sheet.children.length - 1;
          i >= 2 * this._faces.length;
          --i) {
        this._sheet.children[i].removeFromParent();
      }
    }
    
    if (this._positionPursuit) {
      const pursuit = this._positionPursuit;
      if (t >= pursuit.t1) {
        this.position.copy(pursuit.p1);
        this._positionPursuit = null;
      } else {
        this.position
          .copy(pursuit.p0)
          .lerp(pursuit.p1, (t - pursuit.t0) / (pursuit.t1 - pursuit.t0));
      }
    }
  }
  
  enableShortcut() {
  	if (this._shortcutControl) {
    	return null;
    }
    
    this._shortcutControl = new ShortcutControl();
    this._shortcutControl.onChange = () => this._onShortcutChange();
    this._root.add(this._shortcutControl);
    this._onShortcutChange();
    
    return new SolutionStage({
    	predecessor: this,
    });
  }
  
  pursuePosition(target) {
  	this._positionPursuit = {
      t0: t      , p0: this.position.clone(),
      t1: t + 0.2, p1: target.clone3(),
    };
  }
  
  _onShortcutChange() {
  	this._downstreamNeedsUpdate = true;
  }
}

class Camera extends THREE.OrthographicCamera {
	constructor() {
  	super(-1, 1, -1, 1, -1000, 1000);
  }
  
  get frustum() {
  	return {
      left: this.left, right: this.right,
      top: this.top, bottom: this.bottom,
    }
  }
  
  set frustum(value) {
  	this.left = value.left;
    this.right = value.right;
    this.top = value.top;
    this.bottom = value.bottom;
  }
  
  pursueVisibleArea(area) {
  	this._visibleArea = area;
    this._frustumPursuit = {
    	t0: t,
      t1: t + 0.2,
      frustum0: this.frustum,
      frustum1: Camera._frustumForVisibleArea(area),
    };
  }
  
  step() {
  	if (this._frustumPursuit) {
    	const pursuit = this._frustumPursuit;
      if (t >= pursuit.t1) {
      	this.frustum = pursuit.frustum1;
        this._frustumPursuit = null;
      } else {
      	const a = (t - pursuit.t0) / (pursuit.t1 - pursuit.t0);
        const f0 = pursuit.frustum0; const f1 = pursuit.frustum1;
        this.frustum = {
        	left:   lerp(f0.left  , f1.left  , a),
          right:  lerp(f0.right , f1.right , a),
          top:    lerp(f0.top   , f1.top   , a),
          bottom: lerp(f0.bottom, f1.bottom, a),
        };
      }
    	this.updateProjectionMatrix();
    }
  }
  
  onWindowResize() {
  	this._frustumPursuit = null;
    this.frustum = Camera._frustumForVisibleArea(this._visibleArea);
    this.updateProjectionMatrix();
  }
  
  static _frustumForVisibleArea(area) {
  	function constrainAspect(u) {
    	return u.max(u.clone().multiplyScalar(0.1));
    }
  	const w = constrainAspect(
    	new THREE.Vector2(window.innerWidth, window.innerHeight));
    const a = constrainAspect(area.getSize(new THREE.Vector2()));
    const s = Math.max(a.x / w.x, a.y / w.y);
    const f = w.clone().multiplyScalar(s);
    const a0 = area.getCenter(new THREE.Vector2());
    return {
    	left:   a0.x - 0.5 * f.x, right: a0.x + 0.5 * f.x,
      bottom: a0.y - 0.5 * f.y, top:   a0.y + 0.5 * f.y,
    };
  }
}

const scene = new THREE.Scene();
const renderer = new THREE.WebGLRenderer();
const camera = new Camera();
const raycaster = new THREE.Raycaster();
const textureLoader = new THREE.TextureLoader();
const folder = new Folder();
const solutionStages = [];
const controlPoints = [];
let t = null;
let controlPointDrag = null;
let focusedSolutionStage = null;

document.body.appendChild(renderer.domElement);
window.addEventListener('resize', onWindowResize, false);
renderer.domElement.addEventListener('mousedown', onMouseDown, false);
renderer.domElement.addEventListener('mouseup', onMouseUp, false);
renderer.domElement.addEventListener('mousemove', onMouseMove, false);

requestAnimationFrame(start);

function start(tMillis) {
	t = tMillis / 1000.0;
  
  renderer.setClearColor(new THREE.Color(0x888888));
  renderer.autoClear = false;
  renderer.sortObjects = false;
  
  const topLight = new THREE.DirectionalLight(0xffffff);
  topLight.position.set(0.5, 1.0, 0.0);
  scene.add(topLight);
  const bottomLight = new THREE.DirectionalLight(0x444444);
  bottomLight.position.set(-0.5, -1.0, 0.0);
  scene.add(bottomLight);
  
  const stage0 = new SolutionStage({
  	faces: [{
    	positions: [
        new THREE.Vector2(0.0, 0.0),
        new THREE.Vector2(1.0, 0.0),
        new THREE.Vector2(1.0, 1.0),
        new THREE.Vector2(0.0, 1.0),
      ],
      uvs: [
        new THREE.Vector2(0.0, 0.0),
        new THREE.Vector2(1.0, 0.0),
        new THREE.Vector2(1.0, 1.0),
        new THREE.Vector2(0.0, 1.0),
      ],
      side: true,
    }],
    texture: textureLoader.load("shaggy.jpg"),
  });
  scene.add(stage0);
  solutionStages.push(stage0);
  
  layoutSolutionStages();
  onWindowResize();
  
  step(tMillis);
}

function step(tMillis) {
  requestAnimationFrame(step);
  t = tMillis / 1000.0;
  
  for (let i = 0; i < solutionStages.length; ++i) {
  	solutionStages[i].step();
  }
  
  for (let i = 0; i < controlPoints.length; ++i) {
  	const point = controlPoints[i];
    const dragged = controlPointDrag ? controlPointDrag.point : null;
    point.material = (point === dragged) ? redMaterial : greenMaterial;
  }
  
  camera.step();
  
  renderer.clear();
  camera.layers.set(defaultLayer);
  renderer.render(scene, camera);
  camera.layers.set(uiLayer);
  renderer.render(scene, camera);
}

function onWindowResize() {
	renderer.setSize(window.innerWidth, window.innerHeight);
  camera.onWindowResize();
}

function onMouseDown(event) {
	const ndc = mouseToNdc2(event);
  const worldMouse = ndc2ToWorld3(ndc);
  const intersections = [];
  raycaster.setFromCamera(ndc, camera);
  raycaster.layers.enableAll();
  const mouseOver = (object) => {
  	intersections.length = 0;
    raycaster.intersectObject(object, false, intersections);
    return intersections.length > 0 ? intersections[0] : null;
  };
  
  if (!event.altKey && !focusedSolutionStage) {
    for (let i = 0; i < controlPoints.length; ++i) {
      const intersection = mouseOver(controlPoints[i]);
      if (intersection) {
        const point = intersection.object;
        controlPointDrag = {
          point: point,
          offset: worldMouse.clone().sub(point.position),
        };
        return true;
      }
    }
  }
  
  if (focusedSolutionStage) {
  	if (event.altKey) {
    	focusSolutionStage(null);
    }
  } else {
    for (let i = 0; i < solutionStages.length; ++i) {
      const stage = solutionStages[i];
      if (mouseOver(stage.hitbox)) {
        if (event.altKey) {
          focusSolutionStage(stage);
        } else {
          const successor = stage.enableShortcut();
          if (successor) {
            scene.add(successor);
            solutionStages.push(successor);
            layoutSolutionStages();
          }
        }
        break;
      }
    }
  }
  
  return false;
}

function onMouseUp() {
	controlPointDrag = null;
}

function onMouseMove(event) {
	if (!controlPointDrag) {
  	return;
  }
  const drag = controlPointDrag;
  const e = { previousPosition: drag.point.position.clone() };
	mouseToWorld3(event, drag.point.position).sub(drag.offset);
  e.position = drag.point.position;
  drag.point.onChange(e);
}

function layoutSolutionStages() {
	function sqrtCeil(n) {
  	let k = 1;
  	for (; k * k < n; ++k);
    return k;
  }
  function divCeil(n, k) {
  	let l = 1;
  	for (; k * l < n; ++l);
    return l;
  }
	const stageCount = solutionStages.length;
  const columnCount = sqrtCeil(stageCount);
  const rowCount = divCeil(stageCount, columnCount);
  
  const size = new THREE.Vector2();
  const d = new THREE.Vector2(0, 0);
  for (let k = 0; k < stageCount; ++k) {
  	solutionStages[k].boundingBox.getSize(size);
    d.max(size);
  }
  d.x *= 1.1; d.y *= -1.1;
  
  for (let i = 0; i < rowCount; ++i) {
  	for (let j = 0; j < columnCount; ++j) {
    	const k = i * columnCount + j;
      if (k >= stageCount) {
      	break;
      }
      solutionStages[k].pursuePosition(new THREE.Vector2(j * d.x, i * d.y));
    }
  }
  
  const sceneWidth = (columnCount + 0.6) * d.x;
  const sceneHeight = -(rowCount + 0.6) * d.y;
  const boundingBox = new THREE.Box2(
  	new THREE.Vector2(              -0.5  * d.x, (rowCount - 0.5) * d.y),
    new THREE.Vector2((columnCount - 0.5) * d.x,            -0.5  * d.y));
  camera.pursueVisibleArea(boundingBox);
}

function createControlPoint(x, y) {
	const point = new THREE.Mesh(controlPointGeometry);
  point.scale.setScalar(0.05);
  point.position.set(x, y, 0);
  point.layers.set(uiLayer);
  controlPoints.push(point);
  return point;
}

function focusSolutionStage(stage) {
	if (focusedSolutionStage === stage) {
  	return;
  }
  focusedSolutionStage = stage;
  if (stage) {
  	const position = stage.getWorldPosition(new THREE.Vector3());
  	camera.pursueVisibleArea(stage.boundingBox.clone()
      .translate(position)
      .expandByScalar(0.1));
  }
}

function lerp(a, b, t) {
	return (1 - t) * a + t * b;
}

function boolsToFloat3s(bools, trueVec3, falseVec3, coords) {
	if (!coords) {
  	coords = new Float32Array(bools.length * 3);
  }
  let j = 0;
  for (let i = 0; i < bools.length; ++i) {
  	const v  = bools[i] ? trueVec3 : falseVec3;
    v.toArray(coords, 3 * i);
  }
  return coords;
}

function vec2sToFloat2s(vec2s, coords) {
	if (!coords) {
  	coords = new Float32Array(vec2s.length * 2);
  }
  let j = 0;
  for (let i = 0; i < vec2s.length; ++i) {
  	const v = vec2s[i];
    coords[j++] = v.x;
    coords[j++] = v.y;
  }
  return coords;
}

function vec3sToFloat3s(vec3s, coords) {
	if (!coords) {
  	coords = new Float32Array(vec3s.length * 3);
  }
  let j = 0;
  for (let i = 0; i < vec3s.length; ++i) {
  	const v = vec3s[i];
    coords[j++] = v.x;
    coords[j++] = v.y;
    coords[j++] = v.z;
  }
  return coords;
}

function vec2sToFloat3s(vec2s, coords) {
	if (!coords) {
  	coords = new Float32Array(vec2s.length * 3);
  }
  let j = 0;
  for (let i = 0; i < vec2s.length; ++i) {
  	const v = vec2s[i];
    coords[j++] = v.x;
    coords[j++] = v.y;
    coords[j++] = 0.0;
  }
  return coords;
}

function repeatedArray(value, length) {
	const result = new Array(length);
  for (let i = 0; i < length; ++i) {
  	result[i] = value;
  }
  return result;
}

function vec2TrianglesToLinesPositionAttribute(vec2s) {
	const coords = new Float32Array(vec2s.length * 2 * 3);
  let i = 0;
  let j = 0;
  while (i < vec2s.length) {
  	const a = vec2s[i++];
    const b = vec2s[i++];
    const c = vec2s[i++];
  	coords[j++] = a.x; coords[j++] = a.y; coords[j++] = 0.0;
  	coords[j++] = b.x; coords[j++] = b.y; coords[j++] = 0.0;
  	coords[j++] = b.x; coords[j++] = b.y; coords[j++] = 0.0;
  	coords[j++] = c.x; coords[j++] = c.y; coords[j++] = 0.0;
    coords[j++] = c.x; coords[j++] = c.y; coords[j++] = 0.0;
  	coords[j++] = a.x; coords[j++] = a.y; coords[j++] = 0.0;
  }
  return new THREE.BufferAttribute(coords, 3);
}

function mouseToNdc2(e) {
	return new THREE.Vector2(
  	2.0 * e.offsetX / e.target.offsetWidth - 1.0,
  	1.0 - 2.0 * e.offsetY / e.target.offsetHeight);
}

function mouseToWorld3(e, result = new THREE.Vector3()) {
	return ndc2ToWorld3(mouseToNdc2(e), result);
}

function ndc2ToWorld3(ndc, result = new THREE.Vector3()) {
	return result.copy2(ndc)
    .applyMatrix4(camera.projectionMatrixInverse)
    .setZ(0);
}

function box2From3(box3, box2 = new THREE.Box2()) {
	vec2From3(box3.min, box2.min);
  vec2From3(box3.max, box2.max);
  return box2;
}

function box3From2(box2, box3 = new THREE.Box3()) {
	box3.min.copy2(box2.min);
  box3.max.copy2(box2.max);
  return box3;
}

function rotation2AssumingSameLength(u, v, m = new THREE.Matrix3()) {
	const lengthSq = u.lengthSq();
  const c = u.dot(v) / lengthSq;
  const s = u.cross(v) / lengthSq;
  return m.set(
  	c, -s, 0,
    s,  c, 0,
    0,  0, 1);
}

function translate2(m, v) {
	m.elements[6] += v.x;
  m.elements[7] += v.y;
}