import { playGrain } from "./audio.js";
import { sendOSC } from "./network.js";

export class ClockWidget extends PIXI.Container {
  constructor(points, buffer, options = {}) {
    super();
    this.points = points; // tableau de points Pixi
    this.buffer = buffer; // AudioBuffer
    this.radius = options.radius || 80;
    this.angle = 0; // angle en radians
    this.speed = options.speed || 0.03; // vitesse de rotation
    this.center = new PIXI.Point(0, 0);

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
    this.hand = new PIXI.Graphics();
    this.addChild(this.hand);

    // Pour le drag
    this.eventMode = 'dynamic';
    this.cursor = 'grab';
    this.interactive = true;
    this.dragging = false;

    this.on('pointerdown', this.onDragStart.bind(this));
    this.on('pointerup', this.onDragEnd.bind(this));
    this.on('pointerupoutside', this.onDragEnd.bind(this));
    this.on('pointermove', this.onDragMove.bind(this));

    this.lastPlayedPointId = null;
    this.draw();
  }

  draw() {
  // Aiguille triangulaire
  this.hand.clear();
  const angle = this.angle;
  const r = this.radius;
  const w = 15; // largeur de la base de l'aiguille

  // Trois points du triangle
  const tipX = Math.cos(angle) * r;
  const tipY = Math.sin(angle) * r;
  const baseAngle = angle + Math.PI / 2;
  const baseX1 = Math.cos(baseAngle) * (w / 2);
  const baseY1 = Math.sin(baseAngle) * (w / 2);
  const baseX2 = Math.cos(baseAngle) * (-w / 2);
  const baseY2 = Math.sin(baseAngle) * (-w / 2);

  const poly = [
    [0 + baseX1, 0 + baseY1],
    [0 + baseX2, 0 + baseY2],
    [tipX, tipY]
  ];

  this.hand.beginFill(0x000000);
  this.hand.drawPolygon(poly.flat());
  this.hand.endFill();

  // Stocke la forme pour la collision
  this._needlePolygon = new PIXI.Polygon(poly.map(([x, y]) => new PIXI.Point(this.x + x, this.y + y)));
}
  update() {
    this.angle += this.speed;
if (this.angle > Math.PI * 2) this.angle -= Math.PI * 2;
this.draw();

if (this._needlePolygon) {
  for (const point of this.points) {
    const px = point.parent.toGlobal(point.position).x;
    const py = point.parent.toGlobal(point.position).y;
    if (this._needlePolygon.contains(px, py)) {
      if (this.lastPlayedPointId !== point.sampleId) {
        this.lastPlayedPointId = point.sampleId;
        point.targetRadius = point.baseRadius * 1.8;
        playGrain(point.startTime, point.duration, point.isEffectEnabled, this.buffer);
        sendOSC("/clock", point.sampleId);
      }
      return;
    }
     else point.targetRadius = point.baseRadius;
  }
}
this.lastPlayedPointId = null;
  }

  onDragStart(event) {
    this.dragging = true;
    this.dragOffset = {
      x: event.global.x - this.x,
      y: event.global.y - this.y
    };
  }

  onDragEnd() {
    this.dragging = false;
  }

  onDragMove(event) {
    if (this.dragging) {
      this.x = event.global.x - this.dragOffset.x;
      this.y = event.global.y - this.dragOffset.y;
    }
  }

  addTicker(app) {
    this._tickerFn = (delta) => this.update(delta);
    app.ticker.add(this._tickerFn);
    }

  removeTicker(app) {
    if (this._tickerFn) {
      app.ticker.remove(this._tickerFn);
      this._tickerFn = null;
    }
  }

  }

