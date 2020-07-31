import { vec3, mat4, glMatrix } from './vendor/gl-matrix.js';

const cameraZ = vec3.create();
const cameraX = vec3.create();
const cameraY = vec3.create();

function getClientPoint(e) {
  return {
    x: (e.touches ? e.touches[0] : e).clientX,
    y: (e.touches ? e.touches[0] : e).clientY,
  };
}

export default class Camera {
  constructor() {
    this.fovy = 45;
    this.near = 0.1;
    this.far = 100;
    this.eyeX = 0;
    this.eyeY = 0;
    this.eyeZ = 4;
    this.centerX = 0;
    this.centerY = 0;
    this.centerZ = 0;
    this.eye = vec3.create();
    this.center = vec3.create();
    this.up = vec3.fromValues(0, 1, 0);
    this.rx = 0;
    this.ry = 0;
    this.maxy = Math.PI / 180 * 89;
    this.viewMatrix = mat4.create();
    this.projectionMatrix = mat4.create();
    this.panSpeed = 0.1;
    this.zoomSpeed = 1.1;
    this.rotateSpeed = Math.PI / 180;
  }

  attach(canvas) {
    if (this._canvas) {
      return;
    }
    this._canvas = canvas;

    let lastPoint;
    let isPanning;

    this._handleMouseMove = (e) => {
      const point = getClientPoint(e);
      const offsetX = point.x - lastPoint.x;
      const offsetY = point.y - lastPoint.y;
      if (offsetX !== 0 || offsetY !== 0) {
        if (isPanning) {
          // http://learnwebgl.brown37.net/07_cameras/camera_linear_motion.html
          const x = offsetX * this.panSpeed;
          const y = offsetY * this.panSpeed;
          vec3.sub(cameraZ, this.eye, this.center);
          vec3.normalize(cameraZ, cameraZ);
          vec3.cross(cameraX, this.up, cameraZ);
          vec3.cross(cameraY, cameraZ, cameraX);

          vec3.scaleAndAdd(this.eye, this.eye, cameraX, -x);
          vec3.scaleAndAdd(this.eye, this.eye, cameraY, y);
          vec3.scaleAndAdd(this.center, this.center, cameraX, -x);
          vec3.scaleAndAdd(this.center, this.center, cameraY, y);

          [this.eyeX, this.eyeY, this.eyeZ] = this.eye;
          [this.centerX, this.centerY, this.centerZ] = this.center;
        } else {
          // http://learnwebgl.brown37.net/07_cameras/camera_rotating_motion.html
          const x = offsetX * this.rotateSpeed;
          const y = offsetY * this.rotateSpeed;
          this.rx -= x;
          this.ry += y;
          if (this.ry > this.maxy) {
            this.ry = this.maxy;
          }
          if (this.ry < -this.maxy) {
            this.ry = -this.maxy;
          }
          vec3.sub(cameraZ, this.eye, this.center);
          const distance = vec3.length(cameraZ);
          const xz = Math.cos(this.ry) * distance;
          this.eyeX = this.centerX + Math.sin(this.rx) * xz;
          this.eyeY = this.centerY + Math.sin(this.ry) * distance;
          this.eyeZ = this.centerZ + Math.cos(this.rx) * xz;

          vec3.set(this.eye, this.eyeX, this.eyeY, this.eyeZ);
        }
      }
      lastPoint = point;
    };

    this._clean = () => {
      lastPoint = null;
      window.removeEventListener('mousemove', this._handleMouseMove);
      window.removeEventListener('mouseup', this._clean);
      window.removeEventListener('touchmove', this._handleMouseMove);
      window.removeEventListener('touchend', this._clean);
    };

    this._handleMouseDown = (e) => {
      e.preventDefault();
      if (e.button !== 0 && e.button !== 2) {
        return;
      }
      isPanning = e.button === 2;
      this._canvas.focus();
      lastPoint = getClientPoint(e);
      window.addEventListener('mousemove', this._handleMouseMove);
      window.addEventListener('mouseup', this._clean);
      window.addEventListener('touchmove', this._handleMouseMove);
      window.addEventListener('touchend', this._clean);
    };

    this._handleWheel = (e) => {
      if (e.deltaY !== 0) {
        const scale = e.deltaY > 0 ? this.zoomSpeed : 1 / this.zoomSpeed;
        vec3.lerp(this.eye, this.center, this.eye, scale);
        [this.eyeX, this.eyeY, this.eyeZ] = this.eye;
      }
    };

    this._handleContextmenu = (e) => {
      e.preventDefault();
    };

    canvas.addEventListener('mousedown', this._handleMouseDown);
    canvas.addEventListener('touchstart', this._handleMouseDown, { passive: false });
    canvas.addEventListener('wheel', this._handleWheel, { passive: false });
    canvas.addEventListener('blur', this._clean);
    canvas.addEventListener('contextmenu', this._handleContextmenu);
  }

  detach() {
    if (!this._canvas) {
      return;
    }
    this._canvas.removeEventListener('mousedown', this._handleMouseDown);
    this._canvas.removeEventListener('touchstart', this._handleMouseDown);
    this._canvas.removeEventListener('wheel', this._handleWheel);
    this._canvas.removeEventListener('blur', this._clean);
    this._canvas.removeEventListener('contextmenu', this._handleContextmenu);
  }

  getViewMatrix() {
    vec3.set(this.eye, this.eyeX, this.eyeY, this.eyeZ);
    vec3.set(this.center, this.centerX, this.centerY, this.centerZ);
    mat4.lookAt(this.viewMatrix, this.eye, this.center, this.up);
    return this.viewMatrix;
  }

  getProjectionMatrix() {
    mat4.perspective(
      this.projectionMatrix,
      glMatrix.toRadian(this.fovy),
      this._canvas.clientWidth / this._canvas.clientHeight,
      this.near,
      this.far,
    );
    return this.projectionMatrix;
  }
}