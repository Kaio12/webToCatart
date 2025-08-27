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
    this.circle = new PIXI.Graphics();
    this.addChild(this.circle);

    // Dessin de l'aiguille
    this.hand = new PIXI.Graphics();
    this.addChild(this.hand);

    // Pour le drag
    this.eventMode = 'static';
    this.cursor = 'pointer';
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
    // Cercle
     this.circle.clear();
    this.circle.beginFill(0xffffff, 0.3); // Blanc semi-transparent
    this.circle.lineStyle(2, 0xffffff); // Ligne blanche
    this.circle.drawCircle(0, 0, this.radius);
    this.circle.endFill();

  // Aiguille (forme remplie noire pour visibilité maximale)
  this.hand.clear();
  const x = Math.cos(this.angle) * this.radius;
  const y = Math.sin(this.angle) * this.radius;
  
  // Dessine une forme remplie (triangle pointant vers l'extrémité)
  this.hand.beginFill(0x000000); // Noir pour contraste
  this.hand.lineStyle(2, 0x000000);
  this.hand.moveTo(0, 0);
  this.hand.lineTo(x, y);
  this.hand.lineTo(x * 0.9, y * 0.9); // Pointe légèrement en arrière pour un triangle
  this.hand.lineTo(0, 0);
  this.hand.endFill();
    }

  update() {
    // Tourne l'aiguille
    this.angle += this.speed;
    if (this.angle > Math.PI * 2) this.angle -= Math.PI * 2;
    this.draw();

    // Test collision avec les points
    const handX = this.x + Math.cos(this.angle) * this.radius;
    const handY = this.y + Math.sin(this.angle) * this.radius;

    for (const point of this.points) {
      const px = point.parent.toGlobal(point.position).x;
      const py = point.parent.toGlobal(point.position).y;
      const dist = Math.hypot(handX - px, handY - py);
      if (dist < (point.currentRadius || 12)) {
        if (this.lastPlayedPointId !== point.sampleId) {
          this.lastPlayedPointId = point.sampleId;

          point.targetRadius = point.baseRadius * 1.8; // si un point est touché, il augmente brièvement de taille

          playGrain(point.startTime, point.duration, point.isEffectEnabled, this.buffer);
          sendOSC("/clock", point.sampleId);
        } else point.targetRadius = point.baseRadius;
        return;
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
}