import { playGrain } from "./audio.js";
import { sendOSC } from "./network.js";

export class ClockWidget extends PIXI.Container {
  constructor(points, buffer, options = {}) {
    super();
    this.points = points; // tableau de points Pixi
    this.buffer = buffer; // AudioBuffer
    this.radius = options.radius || 80;
    this.rotation = 0; // angle en radians
    this.speed = options.speed || 0.03; // degres / seconde
    this.center = new PIXI.Point(0, 0);
    this.thickness = options.thickness ?? 6;
    this.resizing = false;
    this.resizeStartRadius = null;
    this.resizeStartPos = null;
    this.running = true;

    // Dessin du cercle
    this.circle = new PIXI.Graphics()
      .circle(0, 0, this.radius)
      .fill({
        color: 0xffffff,
        alpha: 0.3
      })
      .stroke({
        width: 5,
        color: 0xffffff
    });
    this.addChild(this.circle);

    // Dessin de l'aiguille
    this.hand = new PIXI.Graphics()
      .rect(0, -this.thickness / 2, this.radius, this.thickness)
      .fill({
        color: 0xffffff,
        alpha: 0.8
      });
    this.addChild(this.hand);

    // Pour le drag
    this.eventMode = 'dynamic';
    this.cursor = 'grab';
    this.interactive = true;
    this.dragging = false;

    this.on('pointerdown', this.onPointerDown.bind(this));
    this.on('pointerup', this.onPointerUp.bind(this));
    this.on('pointerupoutside', this.onPointerUp.bind(this));
    this.on('pointermove', this.onPointerMove.bind(this));
    this.on('pointertap', this.onPointerTap.bind(this));

    this.lastPlayedPointId = null;
  }


  update(delta = 1) {
  
    if (this.running) {
  this.rotation = (this.rotation + this.speed * delta) % (2 * Math.PI);
  //this.hand.angle = this.angle;

  const cx = this.x;
  const cy = this.y;
  const needleRotation = this.rotation;
  let hit = false;

  for (const point of this.points) {
    const gp = point.parent.toGlobal(point.position);
    const dx = gp.x - cx;
    const dy = gp.y - cy;
    const dist2 = dx * dx + dy * dy;
    if (dist2 > this.radius * this.radius) continue;

    // Angle du point (radians)
    let pa = Math.atan2(dy, dx);
    if (pa < 0) pa += Math.PI * 2;

    // Différence angulaire minimale (-PI, PI]
    let diff = pa - needleRotation;
    diff = (diff + Math.PI) % (Math.PI * 2) - Math.PI;

    // Tolérance angulaire (ajuste 0.03 ≈ 1.7°)
    if (Math.abs(diff) < 0.03) {
      if (this.lastPlayedPointId !== point.sampleId) {
        this.lastPlayedPointId = point.sampleId;
        if (point.baseRadius) point.targetRadius = point.baseRadius * 1.8;
        playGrain(point.startTime, point.duration, point.isEffectEnabled, this.buffer);
        sendOSC("/clock", point.sampleId);
      }
      hit = true;
      break;
    } else if (point.baseRadius) {
      point.targetRadius = point.baseRadius;
    }
  }

  if (!hit) this.lastPlayedPointId = null;
}
  }

onPointerDown(event) {
  const local = this.toLocal(event.global);
  const dist = Math.hypot(local.x, local.y);
  // Si clic proche du bord du cercle (±10px)
  if (Math.abs(dist - this.radius) < 12) {
    this.resizing = true;
    this.resizeStartRadius = this.radius;
    this.resizeStartPos = { x: event.global.x, y: event.global.y };
    this.cursor = 'nwse-resize';
  } else {
    // Drag normal
    this.dragging = true;
    this.dragOffset = {
      x: event.global.x - this.x,
      y: event.global.y - this.y
    };
    this.cursor = 'grabbing';
  }
}

onPointerUp() {
  this.dragging = false;
  this.resizing = false;
  this.cursor = 'grab';
}

onPointerMove(event) {
  if (this.resizing) {
    const local = this.toLocal(event.global);
    const newRadius = Math.max(20, Math.hypot(local.x, local.y));
    this.radius = newRadius;
    // Redessine le cercle et l'aiguille
    this.circle.clear()
      .circle(0, 0, this.radius)
      .fill({ color: 0xffffff, alpha: 0.3 })
      .stroke({ width: 5, color: 0xffffff });
    this.hand.clear()
      .rect(0, -this.thickness / 2, this.radius, this.thickness)
      .fill({ color: 0xffffff, alpha: 0.8 });
  } else if (this.dragging) {
    this.x = event.global.x - this.dragOffset.x;
    this.y = event.global.y - this.dragOffset.y;
  }
}

onPointerTap(event) {
  if (event.detail === 2) { // double-clic
    this.running = !this.running;
    this.cursor = this.running ? 'grab' : 'not-allowed';
    console.log ("pointertap");
  }
}

  addTicker(app) {
    this._tickerFn = (ticker) => this.update(ticker.deltaTime);
    app.ticker.add(this._tickerFn);
    }

  removeTicker(app) {
    if (this._tickerFn) {
      app.ticker.remove(this._tickerFn);
      this._tickerFn = null;
    }
  }

  }

