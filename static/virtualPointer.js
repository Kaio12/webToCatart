export class VirtualPointer {
  constructor(app, boundary, container,  options = {}) {
    this.app = app;
    this.boundary = boundary;
    this.container = container;
    this.pointerId = options.pointerId || 9999;
    this.pointerType = options.pointerType || 'virtual';
    this.buttons = 0;
    this.lastTarget = null;
    this.capturedTarget = null;
    this.active = false;
    this.global = new PIXI.Point();

    this.radius = options.radius || 14;
    this.color = options.color || 0xff3333;
    this.alpha = options.alpha ?? 0.9;
    this.outline = options.outline || 0x000000;
    this.outlineAlpha = 0.4;

    this.visual = new PIXI.Graphics().circle(0,0,this.radius).fill(this.color);
    this.visual.eventMode = 'none'; 
    this.container.addChild(this.visual);

  }

  setCapture(displayObject) {
    this.capturedTarget = displayObject;
  }

  releaseCapture() {
    this.capturedTarget = null;
  }

    _hit() {
        if (this.capturedTarget) return this.capturedTarget;
        if (this.boundary) {
        return this.boundary.hitTest(this.global.x, this.global.y);
        }
        return manualHitTest(this.app.stage, this.global);
    }


  move(x, y, extra = {}) {
    this.global.set(x, y);
    this.visual.position.set(x, y);
    const target = this._hit();

    if (target !== this.lastTarget) {
      if (this.lastTarget) this._dispatch('pointerout', this.lastTarget, extra);
      if (target) this._dispatch('pointerover', target, extra);
    }
    if (target) this._dispatch('pointermove', target, extra);
    this.lastTarget = target;
  }

  
  down(x, y, extra = {}) {
    this.move(x, y, extra);
    if (this.lastTarget) {
      this.buttons = 1;
      this.active = true;
      this._dispatch('pointerdown', this.lastTarget, extra);
    }
  }

  up(x, y, extra = {}) {
    this.move(x, y, extra);
    if (this.lastTarget) {
      this._dispatch('pointerup', this.lastTarget, extra);
      // tap synthétique
      this._dispatch('pointertap', this.lastTarget, extra);
    }
    this.buttons = 0;
    this.active = false;
    this.releaseCapture();
  }

  cancel(extra = {}) {
    if (this.lastTarget) {
      this._dispatch('pointercancel', this.lastTarget, extra);
    }
    this.buttons = 0;
    this.active = false;
    this.releaseCapture();
  }

  destroy() {
  if (this.visual && this.visual.parent) {
    this.visual.parent.removeChild(this.visual);
  }
  this.visual.destroy();
  this.visual = null;
}

  _dispatch(type, target, extra) {
    const e = this._makeEvent(type, target, extra);
    // bubble
    let current = target;
    while (current) {
      e.currentTarget = current;
      current.emit(type, e);
      if (e.stopped) break;
      current = current.parent;
    }
  }

  _makeEvent(type, target, extra) {
    return {
      type,
      pointerId: this.pointerId,
      pointerType: this.pointerType,
      buttons: this.buttons,
      target,
      currentTarget: target,
      global: this.global,
      altKey: !!extra.altKey,
      shiftKey: !!extra.shiftKey,
      ctrlKey: !!extra.ctrlKey,
      metaKey: !!extra.metaKey,
      stopPropagation() { this.stopped = true; },
      stopped: false,
      // compat minimal
      client: this.global,
      movementX: 0,
      movementY: 0
    };
  }
}


// Fallback manuel si pas de boundary (rare)
function manualHitTest(root, globalPoint) {
  for (let i = root.children.length - 1; i >= 0; i--) {
    const child = root.children[i];
    if (!child.visible || child.eventMode === 'none') continue;
    const found = manualHitTest(child, globalPoint);
    if (found) return found;
    if (isHit(child, globalPoint)) return child;
  }
  return null;
}

function isHit(displayObject, globalPoint) {
  if (!displayObject) return false;
  const local = displayObject.toLocal(globalPoint);
  if (displayObject.hitArea && displayObject.hitArea.contains(local.x, local.y)) return true;
  if (displayObject.containsPoint && displayObject.containsPoint(globalPoint)) return true;
  return false;
}