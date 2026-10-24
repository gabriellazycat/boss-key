/** Teclado + mouse. `pressed`/`released` valem por um frame (limpos em endFrame). */
export class Input {
  private down = new Set<string>();
  private pressedSet = new Set<string>();
  private releasedSet = new Set<string>();
  mouseX = 0;
  mouseY = 0;
  dx = 0;
  dy = 0;
  wheel = 0;
  locked = false;
  sensitivity = 1;
  /** Chamado quando a aba perde foco (GDD §8: troca para a planilha por segurança). */
  onBlur: (() => void) | null = null;

  constructor(private el: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (!this.down.has(e.code)) this.pressedSet.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
      this.releasedSet.add(e.code);
    });
    window.addEventListener('mousemove', (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
      if (this.locked) {
        // alguns navegadores dão um salto enorme ao travar o cursor
        if (Math.abs(e.movementX) > 300 || Math.abs(e.movementY) > 300) return;
        this.dx += e.movementX * this.sensitivity;
        this.dy += e.movementY * this.sensitivity;
      }
    });
    el.addEventListener('mousedown', (e) => {
      const k = `Mouse${e.button}`;
      if (!this.down.has(k)) this.pressedSet.add(k);
      this.down.add(k);
    });
    window.addEventListener('mouseup', (e) => {
      const k = `Mouse${e.button}`;
      this.down.delete(k);
      this.releasedSet.add(k);
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('wheel', (e) => (this.wheel += Math.sign(e.deltaY)), { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.el;
    });
    window.addEventListener('blur', () => {
      this.down.clear();
      this.onBlur?.();
    });
  }

  isDown(code: string) {
    return this.down.has(code);
  }
  pressed(code: string) {
    return this.pressedSet.has(code);
  }
  released(code: string) {
    return this.releasedSet.has(code);
  }
  axis(neg: string, pos: string) {
    return (this.isDown(pos) ? 1 : 0) - (this.isDown(neg) ? 1 : 0);
  }

  lock() {
    if (!this.locked) this.el.requestPointerLock?.()?.catch?.(() => {});
  }
  unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  endFrame() {
    this.pressedSet.clear();
    this.releasedSet.clear();
    this.dx = 0;
    this.dy = 0;
    this.wheel = 0;
  }
}
